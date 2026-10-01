import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { redraft } from "@/lib/pipeline";

export const maxDuration = 120;

// Arjun's call. The AI only suggests; this is what unlocks sending.
export async function POST(req: Request) {
  const { id, decision } = await req.json();
  if (!["pending", "invite", "reject"].includes(decision)) {
    return NextResponse.json({ error: "Bad decision" }, { status: 400 });
  }
  const [c] = await sql`select email_kind, email_sent_at from candidates where id = ${id}`;
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (c.email_sent_at) return NextResponse.json({ error: "The email already went out, so the decision is locked." }, { status: 409 });

  await sql`update candidates set decision = ${decision}, decided_at = ${decision === "pending" ? null : new Date().toISOString()} where id = ${id}`;
  try {
    if (decision !== "pending" && c.email_kind !== decision) await redraft(id, decision);
  } catch (e) {
    return NextResponse.json({ error: `Decision saved, but re-drafting the email failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (decision === "invite") {
    await sql`insert into interviews (candidate_id) values (${id}) on conflict (candidate_id) do nothing`;
  }
  return NextResponse.json({ ok: true });
}
