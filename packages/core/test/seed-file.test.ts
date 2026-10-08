import { describe, expect, it } from "vitest";
import { buildSeedSql } from "../src/seed/sql.ts";

// core has no Node types ("types": []), so the one Node API used here is typed locally.
declare global {
  interface ImportMeta {
    url: string;
  }
}
interface NodeFs {
  readFileSync(path: string, encoding: "utf8"): string;
}

describe("committed seed file", () => {
  // Red if supabase/seed.sql drifts from what buildSeedSql() generates.
  it("supabase/seed.sql equals buildSeedSql() byte for byte", async () => {
    const specifier = "node:fs";
    const { readFileSync } = (await import(specifier)) as NodeFs;
    const testDirectory = import.meta.url.replace(/[^/]*$/, "").replace("file://", "");
    const seedPath = decodeURIComponent(`${testDirectory}../../../supabase/seed.sql`);
    expect(readFileSync(seedPath, "utf8")).toBe(buildSeedSql());
  });
});
