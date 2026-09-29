import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const b = await req.json();
  const threshold = Number(b.invite_threshold);
  const topN = Math.round(Number(b.top_n));
  if (!(threshold >= 1 && threshold <= 4) || !(topN >= 0)) {
    return NextResponse.json({ error: "Invite line must be 1.00–4.00 and N must be ≥ 0" }, { status: 400 });
  }
  await sql`update settings set invite_threshold = ${threshold}, top_n = ${topN},
            company_name = ${String(b.company_name)}, sender_name = ${String(b.sender_name)},
            invite_next_step = ${String(b.invite_next_step)} where id = 1`;
  return NextResponse.json({ ok: true });
}
