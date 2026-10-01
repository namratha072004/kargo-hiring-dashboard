import { NextResponse } from "next/server";
import { Resend } from "resend";
import { sql } from "@/lib/db";
import { firstName } from "@/lib/pii";

// which: "initial" (invite / rejection after CV review) or "followup" (after the interview).
export async function POST(req: Request) {
  const { id, which = "initial" } = await req.json();
  const [c] = await sql`
    select c.decision, c.email_kind, c.email_subject, c.email_body, c.email_override, c.email_sent_at,
           i.followup_subject, i.followup_body, i.followup_sent_at, p.full_name, p.email
    from candidates c join candidate_pii p on p.candidate_id = c.id
    left join interviews i on i.candidate_id = c.id
    where c.id = ${id}`;
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!c.email) return NextResponse.json({ error: "No email address on file for this candidate." }, { status: 400 });

  let subject: string, body: string;
  if (which === "followup") {
    if (!c.followup_body || !c.followup_subject) return NextResponse.json({ error: "No follow-up drafted yet." }, { status: 400 });
    subject = c.followup_subject; body = c.followup_body;
  } else {
    if (c.decision === "pending") return NextResponse.json({ error: "Decide first: Invite or Reject." }, { status: 400 });
    if (c.email_kind !== c.decision) return NextResponse.json({ error: "Draft is still being rewritten to match your decision." }, { status: 409 });
    if (!c.email_body || !c.email_subject) return NextResponse.json({ error: "No draft yet." }, { status: 400 });
    subject = c.email_subject; body = c.email_override ?? c.email_body;
  }

  // Test mode (no verified domain yet): deliver to the founder's inbox instead of the candidate.
  const testTo = process.env.RESEND_TEST_TO?.trim();
  const to = testTo || c.email;

  // Claim the send atomically so a double click can't send twice.
  const claimed = which === "followup"
    ? await sql`update interviews set followup_sent_at = now(), followup_sent_to = ${to}, followup_error = null where candidate_id = ${id} and followup_sent_at is null returning candidate_id`
    : await sql`update candidates set email_sent_at = now(), email_sent_to = ${to}, email_error = null where id = ${id} and email_sent_at is null returning id`;
  if (!claimed.length) return NextResponse.json({ error: "Already sent." }, { status: 409 });

  const text = body.replaceAll("{{first_name}}", firstName(c.full_name));
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "Kargo Hiring <onboarding@resend.dev>",
    to,
    replyTo: process.env.RESEND_REPLY_TO || undefined,
    subject: testTo ? `[TEST → ${c.email}] ${subject}` : subject,
    text,
  });
  if (error) {
    if (which === "followup") await sql`update interviews set followup_sent_at = null, followup_sent_to = null, followup_error = ${error.message} where candidate_id = ${id}`;
    else await sql`update candidates set email_sent_at = null, email_sent_to = null, email_error = ${error.message} where id = ${id}`;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  if (which === "initial") await sql`update candidates set resend_id = ${data?.id ?? null} where id = ${id}`;
  return NextResponse.json({ ok: true, test: !!testTo, to, resend_id: data?.id ?? null });
}
