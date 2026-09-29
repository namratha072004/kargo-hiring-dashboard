import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Save the founder's edits to a draft, or delete a candidate (and their PII) entirely.
export async function POST(req: Request) {
  const b = await req.json();
  if (b.action === "save_email") {
    const { error } = await db.from("candidates")
      .update({ email_subject: b.subject, email_override: b.body })
      .eq("id", b.id).is("email_sent_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete") {
    const { error } = await db.from("candidates").delete().eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
