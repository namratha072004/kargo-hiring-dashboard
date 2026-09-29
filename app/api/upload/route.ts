import { NextResponse } from "next/server";
import { fileToText } from "@/lib/parse";
import { extractPii, redact, type Pii } from "@/lib/pii";
import { db, ROLES, type RoleCode } from "@/lib/db";

// Two actions, both deterministic (no AI):
//  "extract": read files, return a best guess at name/email/phone for the founder to confirm.
//  "save":    with confirmed details, split PII from the CV, store both separately.
export async function POST(req: Request) {
  const form = await req.formData();
  const action = form.get("action");

  if (action === "extract") {
    const files = form.getAll("files") as File[];
    const out = await Promise.all(
      files.map(async (f) => {
        try {
          return { file_name: f.name, ...extractPii(await fileToText(f)) };
        } catch (e) {
          return { file_name: f.name, error: (e as Error).message };
        }
      }),
    );
    return NextResponse.json({ files: out });
  }

  if (action === "save") {
    const file = form.get("file") as File;
    const role = form.get("role") as RoleCode;
    if (!ROLES.includes(role)) return NextResponse.json({ error: "Bad role" }, { status: 400 });
    const pii: Pii = {
      full_name: String(form.get("full_name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
    };
    if (!pii.full_name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const text = await fileToText(file);
    const { data, error } = await db
      .from("candidates")
      .insert({ applied_role: role, file_name: file.name, cv_text: redact(text, pii) })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: e2 } = await db.from("candidate_pii").insert({
      candidate_id: data.id, full_name: pii.full_name, email: pii.email || null, phone: pii.phone || null,
    });
    if (e2) {
      await db.from("candidates").delete().eq("id", data.id);
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
    return NextResponse.json({ id: data.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
