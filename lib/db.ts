import { neon } from "@neondatabase/serverless";

// Server-only. DATABASE_URL must never be exposed to the browser.
export const sql = neon(process.env.DATABASE_URL!);

export type RoleCode = "PM" | "SPM";
export const ROLES: RoleCode[] = ["PM", "SPM"];

export type Criterion = {
  id: string;
  role_code: RoleCode;
  key: string;
  position: number;
  name: string;
  weight: number;
  level_1: string;
  level_2: string;
  level_3: string;
  level_4: string;
};

export type Settings = {
  invite_threshold: number;
  top_n: number;
  company_name: string;
  sender_name: string;
  invite_next_step: string;
};

export type Role = { code: RoleCode; title: string; jd: string };

export async function getRubric(): Promise<Criterion[]> {
  const rows = await sql`select * from rubric_criteria order by role_code, position`;
  return rows.map((c) => ({ ...c, weight: Number(c.weight) }) as Criterion);
}

export async function getSettings(): Promise<Settings> {
  const [s] = await sql`select * from settings where id = 1`;
  return { ...s, invite_threshold: Number(s.invite_threshold) } as Settings;
}

export async function getRoles(): Promise<Record<RoleCode, Role>> {
  const rows = (await sql`select code, title, jd from roles`) as Role[];
  return Object.fromEntries(rows.map((r) => [r.code, r])) as Record<RoleCode, Role>;
}
