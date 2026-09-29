import { createClient } from "@supabase/supabase-js";

// Server-only client. The service-role key bypasses RLS; it must never reach the browser.
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

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

export async function getRubric(): Promise<Criterion[]> {
  const { data, error } = await db
    .from("rubric_criteria")
    .select("*")
    .order("role_code")
    .order("position");
  if (error) throw error;
  return data.map((c) => ({ ...c, weight: Number(c.weight) }));
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return { ...data, invite_threshold: Number(data.invite_threshold) };
}
