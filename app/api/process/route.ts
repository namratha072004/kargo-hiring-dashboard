import { NextResponse } from "next/server";
import { processCandidate, reconcile } from "@/lib/pipeline";

export const maxDuration = 300;

// { id } scores + drafts one candidate; { reconcile: true } refreshes briefs and email types.
export async function POST(req: Request) {
  const body = await req.json();
  try {
    if (body.id) await processCandidate(body.id);
    if (body.reconcile) await reconcile();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
