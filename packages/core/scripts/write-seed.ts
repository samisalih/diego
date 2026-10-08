import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeedSql } from "../src/seed/sql.ts";

const seedPath = fileURLToPath(new URL("../../../supabase/seed.sql", import.meta.url));

mkdirSync(dirname(seedPath), { recursive: true });
writeFileSync(seedPath, buildSeedSql());
console.log(`Wrote ${seedPath}`);
