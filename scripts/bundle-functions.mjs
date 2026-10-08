// Bundles each edge function (supabase/functions/<name>/src/index.ts) together with @app/core into
// one ESM file at supabase/functions/<name>/dist/index.js. npm packages stay external and are
// rewritten to pinned `npm:` specifiers so the Supabase edge runtime (Deno) resolves them itself.
// The single output file deploys the same way via the Supabase MCP, the CLI or the dashboard.
//
// Usage: node scripts/bundle-functions.mjs [name ...]   (no names = all functions with a src/index.ts)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const rootDir = resolve(import.meta.dirname, "..");
const functionsDir = join(rootDir, "supabase/functions");
const coreDir = join(rootDir, "packages/core");

function readDependencies(packageJsonPath) {
  if (!existsSync(packageJsonPath)) return {};
  return JSON.parse(readFileSync(packageJsonPath, "utf8")).dependencies ?? {};
}

function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function npmSpecifierPlugin(versions) {
  return {
    name: "npm-specifiers",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^@app\/core$/ }, () => ({ path: join(coreDir, "src/index.ts") }));
      pluginBuild.onResolve({ filter: /^(npm|jsr|node|https?):/ }, (args) => ({ path: args.path, external: true }));
      pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
        const name = packageName(args.path);
        const version = versions[name];
        if (!version) {
          throw new Error(`No pinned version for "${name}" — add it to packages/core or the function's package.json`);
        }
        return { path: `npm:${name}@${version}${args.path.slice(name.length)}`, external: true };
      });
    },
  };
}

async function bundleFunction(name) {
  const functionDir = join(functionsDir, name);
  const versions = {
    ...readDependencies(join(coreDir, "package.json")),
    ...readDependencies(join(functionDir, "package.json")),
  };
  await build({
    entryPoints: [join(functionDir, "src/index.ts")],
    outfile: join(functionDir, "dist/index.js"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2023",
    plugins: [npmSpecifierPlugin(versions)],
    logLevel: "warning",
  });
  console.log(`bundled ${name} → supabase/functions/${name}/dist/index.js`);
}

const requested = process.argv.slice(2);
const names = requested.length > 0
  ? requested
  : readdirSync(functionsDir).filter((entry) => existsSync(join(functionsDir, entry, "src/index.ts")));

for (const name of names) await bundleFunction(name);
