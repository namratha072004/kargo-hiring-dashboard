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
  if (b.action === "delete") {
    await sql`delete from candidates where id = ${b.id}`;
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
