import { NextResponse } from "next/server";
import { Resend } from "resend";
import { sql } from "@/lib/db";
import { firstName } from "@/lib/pii";

export async function POST(req: Request) {
  const { id } = await req.json();
  const [c] = await sql`
    select c.email_subject, c.email_body, c.email_override, p.full_name, p.email
    from candidates c join candidate_pii p on p.candidate_id = c.id where c.id = ${id}`;
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!c.email) return NextResponse.json({ error: "No email address on file for this candidate." }, { status: 400 });
  if (!c.email_body || !c.email_subject) return NextResponse.json({ error: "No draft yet." }, { status: 400 });

  // Claim the send atomically so a double click can't send twice.
  const claimed = await sql`update candidates set email_sent_at = now(), email_error = null
                            where id = ${id} and email_sent_at is null returning id`;
  if (!claimed.length) return NextResponse.json({ error: "Already sent." }, { status: 409 });

  const text = (c.email_override ?? c.email_body).replaceAll("{{first_name}}", firstName(c.full_name));
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: c.email,
    replyTo: process.env.RESEND_REPLY_TO || undefined,
    subject: c.email_subject,
    text,
  });
  if (error) {
    await sql`update candidates set email_sent_at = null, email_error = ${error.message} where id = ${id}`;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  await sql`update candidates set resend_id = ${data?.id ?? null} where id = ${id}`;
  return NextResponse.json({ ok: true });
}
