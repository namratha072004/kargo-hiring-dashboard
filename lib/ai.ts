// Every function here receives only the REDACTED CV. Real names, emails and phone
// numbers are never passed in; emails use a {{first_name}} placeholder.
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Criterion, Role, RoleCode, Settings } from "./db";

let _client: GoogleGenAI | null = null;
const gemini = () => (_client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";

async function ask<T extends z.ZodType>(opts: { system: string; prompt: string; schema: T }): Promise<z.infer<T>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await gemini().models.generateContent({
        model: MODEL,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(opts.schema, { target: "draft-7" }),
        },
      });
      const text = res.text;
      if (!text) throw new Error(`Gemini returned no text (finish reason: ${res.candidates?.[0]?.finishReason ?? "unknown"})`);
      return opts.schema.parse(JSON.parse(text));
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const cvBlock = (cv: string) => `<cv>\n${cv}\n</cv>`;

// ---------------------------------------------------------------- scoring

export type CriterionResult = { criterion_id: string; score: number; reason: string };

function rubricText(criteria: Criterion[], role: RoleCode) {
  return criteria
    .filter((c) => c.role_code === role)
    .map(
      (c) =>
        `### ${role}.${c.key} — ${c.name} (weight ${Math.round(c.weight * 100)}%)\n` +
        `1 - Absent: ${c.level_1}\n2 - Weak: ${c.level_2}\n3 - Present: ${c.level_3}\n4 - Strong: ${c.level_4}`,
    )
    .join("\n\n");
}

export async function scoreCv(cv: string, criteria: Criterion[]): Promise<CriterionResult[]> {
  const item = z.object({
    evidence: z.string().describe("Short verbatim quote(s) from the CV that decide the score, or 'none'"),
    score: z.number().int().min(1).max(4),
    reason: z.string().describe("One line, max ~25 words, naming what is present or missing"),
  });
  const shape: Record<string, typeof item> = {};
  for (const c of criteria) shape[`${c.role_code}_${c.key}`] = item;
  const schema = z.object(shape);

  const out = await ask({
    schema,
    system:
      "You score product-manager CVs against a fixed hiring rubric. Score strictly on what the CV text " +
      "literally states — never infer, assume or give credit for what a strong candidate 'probably' did. " +
      "When a CV sits between two levels, give the lower one. Personal details are redacted as [CANDIDATE], " +
      "[EMAIL], [PHONE]; ignore them. Judge only evidence, not prestige of employers or schools.",
    prompt:
      `Score this CV against BOTH rubrics below, every criterion, regardless of which role they applied for. ` +
      `Output keys are <ROLE>_<criterion key>, e.g. PM_unprompted_build.\n\n` +
      `## PM rubric\n${rubricText(criteria, "PM")}\n\n## SPM rubric\n${rubricText(criteria, "SPM")}\n\n` +
      `For each criterion: quote the deciding evidence, give a score 1-4 that matches the level descriptions ` +
      `exactly, and a one-line reason.\n\n${cvBlock(cv)}`,
  });

  return criteria.map((c) => {
    const r = out[`${c.role_code}_${c.key}`];
    if (!r) throw new Error(`Missing score for ${c.role_code}.${c.key}`);
    return { criterion_id: c.id, score: r.score, reason: r.reason.trim() };
  });
}

export function weightedScore(results: CriterionResult[], criteria: Criterion[], role: RoleCode) {
  const byId = new Map(results.map((r) => [r.criterion_id, r.score]));
  const total = criteria
    .filter((c) => c.role_code === role)
    .reduce((sum, c) => sum + c.weight * (byId.get(c.id) ?? 1), 0);
  return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------- brief

export async function writeBrief(opts: { cv: string; role: Role; scoreLines: string }): Promise<string> {
  const out = await ask({
    schema: z.object({ brief: z.string() }),
    system:
      "You write interview briefs for a busy founder. Exactly three sentences, plain text, no bullet points, " +
      "no headings. Refer to the candidate as 'the candidate'.",
    prompt:
      `Role: ${opts.role.title}\n\n<job_description>\n${opts.role.jd}\n</job_description>\n\n` +
      `Rubric scores:\n${opts.scoreLines}\n\n${cvBlock(opts.cv)}\n\n` +
      `Write the three-sentence brief: (1) the single strongest piece of evidence in the CV, with its specifics; ` +
      `(2) the weakest or unproven area against the rubric; (3) the one question the founder should ask in the ` +
      `interview to test that gap.`,
  });
  return out.brief.trim();
}

// ---------------------------------------------------------------- email

export async function draftEmail(opts: {
  cv: string;
  kind: "invite" | "reject";
  role: Role;
  settings: Settings;
}): Promise<{ subject: string; body: string }> {
  const { settings, role } = opts;
  const task =
    opts.kind === "invite"
      ? `Write an interview invitation for the ${role.title} role. Mention one or two specific things from ` +
        `their CV that made us want to talk, and connect them to what the role needs. Mention the role is ` +
        `in-office in Mumbai. Close with this next step, in your own words: "${settings.invite_next_step}"`
      : `Write a warm, respectful rejection for the ${role.title} role. Thank them, name one specific thing ` +
        `from their CV you genuinely noticed, say clearly and kindly that we won't be moving forward this time, ` +
        `and wish them well. Do not give scores, rubric language, or reasons that could read as a critique.`;
  const out = await ask({
    schema: z.object({ subject: z.string(), body: z.string() }),
    system:
      `You write short, human emails from ${settings.sender_name} at ${settings.company_name}. ` +
      `Plain text, 90-150 words, no markdown. Layout: greeting line, then 2-3 short paragraphs, then the sign-off — separate each with a blank line (a double newline in the JSON string). Start the body with "Hi {{first_name}}," exactly — that placeholder ` +
      `is filled in later with the candidate's real name, so never invent or guess a name and never write ` +
      `[CANDIDATE]. Sign off as ${settings.sender_name}. Never invent facts that are not in the CV or job description.`,
    prompt: `${task}\n\n<job_description>\n${role.jd}\n</job_description>\n\n${cvBlock(opts.cv)}`,
  });
  let body = out.body.trim().replace(/\[CANDIDATE\]/g, "{{first_name}}");
  if (!body.includes("{{first_name}}")) body = `Hi {{first_name}},\n\n${body}`;
  // Safety net if the model still returns one run-on paragraph.
  if (!body.includes("\n")) {
    body = body
      .replace(/^(Hi \{\{first_name\}\},)\s*/, "$1\n\n")
      .replace(/\s+((?:Best|Warm|Kind|Thanks|Regards|Cheers|Sincerely)[^.!?]{0,20},)\s*/, "\n\n$1\n");
  }
  return { subject: out.subject.trim().replace(/\[CANDIDATE\]/g, "").trim(), body };
}
