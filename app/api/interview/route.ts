import { NextResponse } from "next/server";
import { sql, getRoles, getSettings, type RoleCode } from "@/lib/db";
import { draftFollowup } from "@/lib/ai";
import { redact } from "@/lib/pii";

export const maxDuration = 120;

export async function POST(req: Request) {
  const b = await req.json();
  const id = b.id as string;
  await sql`insert into interviews (candidate_id) values (${id}) on conflict (candidate_id) do nothing`;

  if (b.action === "save") {
    const f = b.fields ?? {};
    await sql`update interviews set
      status = coalesce(${f.status ?? null}, status),
      scheduled_at = ${f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null},
      mode = coalesce(${f.mode ?? null}, mode),
      notes = coalesce(${f.notes ?? null}, notes),
      rating = ${f.rating ?? null},
      scorecard = coalesce(${f.scorecard ? JSON.stringify(f.scorecard) : null}::jsonb, scorecard),
      outcome = coalesce(${f.outcome ?? null}, outcome),
      updated_at = now()
      where candidate_id = ${id}`;
    return NextResponse.json({ ok: true });
  }

  if (b.action === "recording") {
    await sql`update interviews set recording_url = ${b.url || null}, recording_name = ${b.name || null},
              recording_is_blob = ${!!b.isBlob}, updated_at = now() where candidate_id = ${id}`;
    return NextResponse.json({ ok: true });
  }

  if (b.action === "draft_followup") {
    const [r] = await sql`select c.applied_role, c.cv_text, i.outcome, i.notes, p.full_name, p.email, p.phone
                          from candidates c join interviews i on i.candidate_id = c.id
                          join candidate_pii p on p.candidate_id = c.id where c.id = ${id}`;
    if (!r || r.outcome === "pending") return NextResponse.json({ error: "Pick an outcome first." }, { status: 400 });
    const [roles, settings] = await Promise.all([getRoles(), getSettings()]);
    // Arjun's notes may mention the candidate by name: strip personal details before the AI sees them.
    const notes = redact(r.notes, { full_name: r.full_name, email: r.email ?? "", phone: r.phone ?? "" });
    try {
      const email = await draftFollowup({ cv: r.cv_text, outcome: r.outcome, role: roles[r.applied_role as RoleCode], settings, notes });
      await sql`update interviews set followup_kind = ${r.outcome}, followup_subject = ${email.subject},
                followup_body = ${email.body}, followup_error = null where candidate_id = ${id} and followup_sent_at is null`;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === "save_followup") {
    await sql`update interviews set followup_subject = ${b.subject}, followup_body = ${b.body}
              where candidate_id = ${id} and followup_sent_at is null`;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
