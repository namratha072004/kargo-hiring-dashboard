import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { firstName } from "@/lib/pii";



export async function POST(req: Request) {
  const { id } = await req.json();
  const { data: c, error } = await db
    .from("candidates")
    .select("id, email_subject, email_body, email_override, email_sent_at, candidate_pii(full_name, email)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const pii = Array.isArray(c.candidate_pii) ? c.candidate_pii[0] : c.candidate_pii;
  if (!pii?.email) return NextResponse.json({ error: "No email address on file for this candidate." }, { status: 400 });
  if (!c.email_body || !c.email_subject) return NextResponse.json({ error: "No draft yet." }, { status: 400 });

  // Claim the send atomically so a double click can't send twice.
  const { data: claimed } = await db
    .from("candidates")
    .update({ email_sent_at: new Date().toISOString(), email_error: null })
    .eq("id", id)
    .is("email_sent_at", null)
    .select("id");
  if (!claimed?.length) return NextResponse.json({ error: "Already sent." }, { status: 409 });

  const text = (c.email_override ?? c.email_body).replaceAll("{{first_name}}", firstName(pii.full_name));
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error: sendErr } = await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: pii.email,
    replyTo: process.env.RESEND_REPLY_TO || undefined,
    subject: c.email_subject,
    text,
  });
  if (sendErr) {
    await db.from("candidates").update({ email_sent_at: null, email_error: sendErr.message }).eq("id", id);
    return NextResponse.json({ error: sendErr.message }, { status: 502 });
  }
  await db.from("candidates").update({ resend_id: data?.id }).eq("id", id);
  return NextResponse.json({ ok: true });
}
