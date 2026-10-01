import { get } from "@vercel/blob";
import { sql } from "@/lib/db";

// Streams a private recording to the signed-in founder (supports seeking via Range).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql`select recording_url, recording_is_blob from interviews where candidate_id = ${id}`;
  if (!r?.recording_url) return new Response("Not found", { status: 404 });
  if (!r.recording_is_blob) return Response.redirect(r.recording_url, 302);
  const range = req.headers.get("range");
  const blob = await get(r.recording_url, { access: "private", headers: range ? { range } : undefined });
  if (!blob?.stream) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = blob.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "private, no-store");
  return new Response(blob.stream, { status: range ? 206 : 200, headers });
}
