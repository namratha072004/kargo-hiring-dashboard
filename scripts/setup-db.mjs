// Creates the schema, seeds the rubric, applies migrations, loads the JDs. Safe to re-run: npm run db:setup
import { Pool } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const exists = await pool.query("select to_regclass('public.rubric_criteria') as t");
if (exists.rows[0].t) {
  console.log("Base schema already exists.");
} else {
  await pool.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  console.log("Schema created and rubric seeded.");
}
const dir = new URL("../db/migrations/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await pool.query(readFileSync(new URL(f, dir), "utf8"));
  console.log("Applied", f);
}
for (const code of ["PM", "SPM"]) {
  const jd = readFileSync(new URL(`../db/jds/${code}.txt`, import.meta.url), "utf8");
  await pool.query("update roles set jd = $1 where code = $2", [jd, code]);
}
await pool.end();
