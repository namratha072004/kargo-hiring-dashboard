import { db, getRubric, getSettings, ROLES, type RoleCode } from "./db";
import { draftEmail, scoreCv, weightedScore, writeBrief } from "./ai";

const ROLE_TITLES: Record<RoleCode, string> = { PM: "Product Manager", SPM: "Senior Product Manager" };

type CandidateRow = {
  id: string;
  applied_role: RoleCode;
  cv_text: string;
  brief: string | null;
  email_kind: "invite" | "reject" | null;
  email_sent_at: string | null;
};

// Step 1 (score both rubrics) + step 3 (draft email) for one candidate.
export async function processCandidate(id: string) {
  const { data: c, error } = await db
    .from("candidates")
    .select("id, applied_role, cv_text, brief, email_kind, email_sent_at")
    .eq("id", id)
    .single<CandidateRow>();
  if (error) throw error;

  await db.from("candidates").update({ status: "processing", error: null }).eq("id", id);
  try {
    const [criteria, settings] = await Promise.all([getRubric(), getSettings()]);
    const results = await scoreCv(c.cv_text, criteria);

    await db.from("criterion_scores").delete().eq("candidate_id", id);
    const { error: e1 } = await db
      .from("criterion_scores")
      .insert(results.map((r) => ({ candidate_id: id, ...r })));
    if (e1) throw e1;
    const { error: e2 } = await db.from("role_scores").upsert(
      ROLES.map((role) => ({ candidate_id: id, role_code: role, weighted_score: weightedScore(results, criteria, role) })),
    );
    if (e2) throw e2;

    const applied = weightedScore(results, criteria, c.applied_role);
    const kind = applied >= settings.invite_threshold ? "invite" : "reject";
    if (!c.email_sent_at) {
      const email = await draftEmail({ cv: c.cv_text, kind, roleTitle: ROLE_TITLES[c.applied_role], settings });
      await db.from("candidates").update({
        email_kind: kind, email_subject: email.subject, email_body: email.body, email_override: null,
      }).eq("id", id);
    }
    await db.from("candidates").update({ status: "scored", brief: null }).eq("id", id);
  } catch (err) {
    await db.from("candidates").update({ status: "error", error: String((err as Error).message ?? err) }).eq("id", id);
    throw err;
  }
}

// Step 2 (briefs for the top N per applied role) + re-drafting any unsent email whose
// invite/reject decision changed because the threshold changed. Idempotent.
export async function reconcile() {
  const [criteria, settings] = await Promise.all([getRubric(), getSettings()]);
  const { data: rows, error } = await db
    .from("candidates")
    .select("id, applied_role, cv_text, brief, email_kind, email_sent_at, role_scores(role_code, weighted_score)")
    .eq("status", "scored");
  if (error) throw error;

  const work: PromiseLike<unknown>[] = [];
  for (const role of ROLES) {
    const ranked = rows
      .filter((r) => r.applied_role === role)
      .map((r) => ({
        ...r,
        score: Number(r.role_scores.find((s) => s.role_code === role)?.weighted_score ?? 0),
      }))
      .sort((a, b) => b.score - a.score);

    ranked.forEach((r, i) => {
      const inTop = i < settings.top_n;
      if (inTop && !r.brief) work.push(briefFor(r.id, r.cv_text, role, criteria));
      if (!inTop && r.brief) work.push(db.from("candidates").update({ brief: null }).eq("id", r.id).then());

      const kind = r.score >= settings.invite_threshold ? "invite" : "reject";
      if (!r.email_sent_at && r.email_kind !== kind) {
        work.push(
          draftEmail({ cv: r.cv_text, kind, roleTitle: ROLE_TITLES[role], settings }).then((email) =>
            db.from("candidates").update({
              email_kind: kind, email_subject: email.subject, email_body: email.body, email_override: null,
            }).eq("id", r.id),
          ),
        );
      }
    });
  }
  await Promise.all(work);
}

async function briefFor(id: string, cv: string, role: RoleCode, criteria: Awaited<ReturnType<typeof getRubric>>) {
  const { data: scores } = await db
    .from("criterion_scores")
    .select("criterion_id, score, reason")
    .eq("candidate_id", id);
  const scoreLines = criteria
    .filter((c) => c.role_code === role)
    .map((c) => {
      const s = scores?.find((x) => x.criterion_id === c.id);
      return `- ${c.name}: ${s?.score ?? "?"}/4 — ${s?.reason ?? ""}`;
    })
    .join("\n");
  const brief = await writeBrief({ cv, roleTitle: ROLE_TITLES[role], scoreLines });
  await db.from("candidates").update({ brief }).eq("id", id);
}

export { ROLE_TITLES };
