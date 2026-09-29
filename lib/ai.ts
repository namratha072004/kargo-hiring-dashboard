// Every function here receives only the REDACTED CV. Real names, emails and phone
// numbers are never passed in; emails use a {{first_name}} placeholder.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Criterion, RoleCode, Settings } from "./db";

let _client: Anthropic | null = null;
const anthropic = () => (_client ??= new Anthropic());
const MODEL = "claude-opus-5";

async function ask<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort: "low" | "medium" | "high";
}): Promise<z.infer<T>> {
  const res = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    messages: [{ role: "user", content: opts.prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (res.stop_reason === "max_tokens") throw new Error("Model output was cut off (max_tokens).");
  if (!res.parsed_output) throw new Error("Model returned output that did not match the schema.");
  return res.parsed_output as z.infer<T>;
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
    score: z.number().int().describe("1, 2, 3 or 4"),
    reason: z.string().describe("One line, max ~25 words, naming what is present or missing"),
  });
  const shape: Record<string, typeof item> = {};
  for (const c of criteria) shape[`${c.role_code}.${c.key}`] = item;
  const schema = z.object(shape);

  const out = await ask({
    effort: "high",
    schema,
    system:
      "You score product-manager CVs against a fixed hiring rubric. Score strictly on what the CV text " +
      "literally states — never infer, assume or give credit for what a strong candidate 'probably' did. " +
      "When a CV sits between two levels, give the lower one. Personal details are redacted as [CANDIDATE], " +
      "[EMAIL], [PHONE]; ignore them. Judge only evidence, not prestige of employers or schools.",
    prompt:
      `Score this CV against BOTH rubrics below, every criterion, regardless of which role they applied for.\n\n` +
      `## PM rubric\n${rubricText(criteria, "PM")}\n\n## SPM rubric\n${rubricText(criteria, "SPM")}\n\n` +
      `For each criterion: quote the deciding evidence, give a score 1-4 that matches the level descriptions ` +
      `exactly, and a one-line reason.\n\n${cvBlock(cv)}`,
  });

  return criteria.map((c) => {
    const r = out[`${c.role_code}.${c.key}`];
    if (!r) throw new Error(`Missing score for ${c.role_code}.${c.key}`);
    const score = Math.min(4, Math.max(1, Math.round(r.score)));
    return { criterion_id: c.id, score, reason: r.reason.trim() };
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

export async function writeBrief(opts: {
  cv: string;
  roleTitle: string;
  scoreLines: string;
}): Promise<string> {
  const out = await ask({
    effort: "medium",
    schema: z.object({ brief: z.string() }),
    system:
      "You write interview briefs for a busy founder. Exactly three sentences, plain text, no bullet points, " +
      "no headings. Refer to the candidate as 'the candidate'.",
    prompt:
      `Role: ${opts.roleTitle}\n\nRubric scores:\n${opts.scoreLines}\n\n${cvBlock(opts.cv)}\n\n` +
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
  roleTitle: string;
  settings: Settings;
}): Promise<{ subject: string; body: string }> {
  const { settings } = opts;
  const task =
    opts.kind === "invite"
      ? `Write an interview invitation for the ${opts.roleTitle} role. Mention one or two specific things from ` +
        `their CV that made us want to talk. Close with this next step, in your own words: "${settings.invite_next_step}"`
      : `Write a warm, respectful rejection for the ${opts.roleTitle} role. Thank them, name one specific thing ` +
        `from their CV you genuinely noticed, say clearly and kindly that we won't be moving forward this time, ` +
        `and wish them well. Do not give scores, rubric language, or reasons that could read as a critique.`;
  const out = await ask({
    effort: "medium",
    schema: z.object({ subject: z.string(), body: z.string() }),
    system:
      `You write short, human emails from ${settings.sender_name} at ${settings.company_name}. ` +
      `Plain text, 90-150 words, no markdown. Start the body with "Hi {{first_name}}," exactly — that placeholder ` +
      `is filled in later with the candidate's real name, so never invent or guess a name and never write ` +
      `[CANDIDATE]. Sign off as ${settings.sender_name}. Never invent facts that are not in the CV.`,
    prompt: `${task}\n\n${cvBlock(opts.cv)}`,
  });
  let body = out.body.trim().replace(/\[CANDIDATE\]/g, "{{first_name}}");
  if (!body.includes("{{first_name}}")) body = `Hi {{first_name}},\n\n${body}`;
  return { subject: out.subject.trim().replace(/\[CANDIDATE\]/g, "").trim(), body };
}
