import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Save the founder's edits to a draft, or delete a candidate (and their PII) entirely.
export async function POST(req: Request) {
  const b = await req.json();
  if (b.action === "save_email") {
    await sql`update candidates set email_subject = ${b.subject}, email_override = ${b.body}
              where id = ${b.id} and email_sent_at is null`;
    return NextResponse.json({ ok: true });
  }
  if (b.action === "unsend_test") {
    // Only test sends (delivered to someone other than the candidate) can be reset.
    const r = which(b.which) === "followup"
      ? await sql`update interviews i set followup_sent_at = null, followup_sent_to = null from candidate_pii p
                  where i.candidate_id = ${b.id} and p.candidate_id = i.candidate_id and i.followup_sent_to is distinct from p.email returning i.candidate_id`
      : await sql`update candidates c set email_sent_at = null, email_sent_to = null from candidate_pii p
                  where c.id = ${b.id} and p.candidate_id = c.id and c.email_sent_to is distinct from p.email returning c.id`;
    if (!r.length) return NextResponse.json({ error: "That email went to the real candidate, so it stays sent." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete") {
    await sql`delete from candidates where id = ${b.id}`;
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function which(w: unknown) {
  return w === "followup" ? "followup" : "initial";
}
