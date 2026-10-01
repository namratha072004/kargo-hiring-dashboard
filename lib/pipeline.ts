import { sql, getRoles, getRubric, getSettings, ROLES, type Criterion, type Role, type RoleCode } from "./db";
import { draftEmail, scoreCv, weightedScore, writeBrief } from "./ai";

// Rubric evidence that scored 3-4 for the applied role, used to personalise emails.
async function strengthsFor(id: string, role: RoleCode, criteria: Criterion[]) {
  const scores = await sql`select criterion_id, score, reason from criterion_scores where candidate_id = ${id}`;
  return criteria
    .filter((c) => c.role_code === role)
    .map((c) => ({ c, s: scores.find((x) => x.criterion_id === c.id) }))
    .filter(({ s }) => s && Number(s.score) >= 3)
    .map(({ c, s }) => `${c.name}: ${s!.reason}`);
}

// (Re)draft the first email as an invite or rejection. Never touches an email that was already sent.
export async function redraft(id: string, kind: "invite" | "reject") {
  const [c] = await sql`select applied_role, cv_text, email_sent_at from candidates where id = ${id}`;
  if (!c || c.email_sent_at) return;
  const [criteria, settings, roles] = await Promise.all([getRubric(), getSettings(), getRoles()]);
  const role = roles[c.applied_role as RoleCode];
  const strengths = await strengthsFor(id, role.code, criteria);
  const email = await draftEmail({ cv: c.cv_text, kind, role, settings, strengths });
  await sql`update candidates set email_kind = ${kind}, email_subject = ${email.subject},
            email_body = ${email.body}, email_override = null, email_error = null
            where id = ${id} and email_sent_at is null`;
}

// Step 1 (score both rubrics) + step 3 (draft email) for one candidate.
export async function processCandidate(id: string) {
  const [c] = await sql`select id, applied_role, cv_text, decision from candidates where id = ${id}`;
  if (!c) throw new Error("Candidate not found");

  await sql`update candidates set status = 'processing', error = null where id = ${id}`;
  try {
    const [criteria, settings] = await Promise.all([getRubric(), getSettings()]);
    const results = await scoreCv(c.cv_text, criteria);

    await sql.transaction([
      sql`delete from criterion_scores where candidate_id = ${id}`,
      ...results.map(
        (r) => sql`insert into criterion_scores (candidate_id, criterion_id, score, reason)
                   values (${id}, ${r.criterion_id}, ${r.score}, ${r.reason})`,
      ),
      ...ROLES.map(
        (role) => sql`insert into role_scores (candidate_id, role_code, weighted_score)
                      values (${id}, ${role}, ${weightedScore(results, criteria, role)})
                      on conflict (candidate_id, role_code) do update set weighted_score = excluded.weighted_score`,
      ),
    ]);

    // Draft for Arjun's decision if he already made one, otherwise for the AI's suggestion.
    const suggested = weightedScore(results, criteria, c.applied_role) >= settings.invite_threshold ? "invite" : "reject";
    await redraft(id, c.decision === "pending" ? suggested : c.decision);
    await sql`update candidates set status = 'scored', brief = null where id = ${id}`;
  } catch (err) {
    await sql`update candidates set status = 'error', error = ${String((err as Error).message ?? err)} where id = ${id}`;
    throw err;
  }
}

// Step 2 (briefs for the top N per applied role) + re-drafting undecided, unsent emails whose
// suggestion flipped because the invite line changed. Idempotent.
export async function reconcile() {
  const [criteria, settings, roles] = await Promise.all([getRubric(), getSettings(), getRoles()]);
  const rows = await sql`
    select c.id, c.applied_role, c.cv_text, c.brief, c.email_kind, c.email_sent_at, c.decision, rs.weighted_score
    from candidates c join role_scores rs on rs.candidate_id = c.id and rs.role_code = c.applied_role
    where c.status = 'scored'
    order by rs.weighted_score desc, c.created_at`;

  const work: Promise<unknown>[] = [];
  for (const code of ROLES) {
    const role = roles[code];
    rows.filter((r) => r.applied_role === code).forEach((r, i) => {
      const inTop = i < settings.top_n;
      if (inTop && !r.brief) work.push(briefFor(r.id, r.cv_text, role, criteria));
      if (!inTop && r.brief) work.push(sql`update candidates set brief = null where id = ${r.id}`);

      const suggested = Number(r.weighted_score) >= settings.invite_threshold ? "invite" : "reject";
      if (r.decision === "pending" && !r.email_sent_at && r.email_kind !== suggested) {
        work.push(redraft(r.id, suggested));
      }
    });
  }
  await Promise.all(work);
}

async function briefFor(id: string, cv: string, role: Role, criteria: Criterion[]) {
  const scores = await sql`select criterion_id, score, reason from criterion_scores where candidate_id = ${id}`;
  const scoreLines = criteria
    .filter((c) => c.role_code === role.code)
    .map((c) => {
      const s = scores.find((x) => x.criterion_id === c.id);
      return `- ${c.name}: ${s?.score ?? "?"}/4 — ${s?.reason ?? ""}`;
    })
    .join("\n");
  const brief = await writeBrief({ cv, role, scoreLines });
  await sql`update candidates set brief = ${brief} where id = ${id}`;
}
