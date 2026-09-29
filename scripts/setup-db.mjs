// Creates the schema, seeds the rubric, and loads the JDs. Run once: npm run db:setup
import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const exists = await pool.query("select to_regclass('public.rubric_criteria') as t");
if (exists.rows[0].t) {
  console.log("Schema already exists — skipping create. (Drop the tables first to re-seed.)");
} else {
  await pool.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  console.log("Schema created and rubric seeded.");
}
for (const code of ["PM", "SPM"]) {
  const jd = readFileSync(new URL(`../db/jds/${code}.txt`, import.meta.url), "utf8");
  await pool.query("update roles set jd = $1 where code = $2", [jd, code]);
}
const { rows } = await pool.query(
  "select role_code, count(*)::int as criteria, sum(weight)::float as total_weight from rubric_criteria group by role_code order by role_code",
);
console.table(rows);
await pool.end();
