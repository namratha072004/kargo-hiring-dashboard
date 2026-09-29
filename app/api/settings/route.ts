import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const b = await req.json();
  const { error } = await db.from("settings").update({
    invite_threshold: Number(b.invite_threshold),
    top_n: Math.max(0, Math.round(Number(b.top_n))),
    company_name: String(b.company_name),
    sender_name: String(b.sender_name),
    invite_next_step: String(b.invite_next_step),
  }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
