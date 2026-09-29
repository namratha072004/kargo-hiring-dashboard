import { sql, getRoles, getRubric, getSettings, ROLES, type Criterion, type Role, type RoleCode } from "./db";
import { draftEmail, scoreCv, weightedScore, writeBrief } from "./ai";

// Step 1 (score both rubrics) + step 3 (draft email) for one candidate.
export async function processCandidate(id: string) {
  const [c] = await sql`select id, applied_role, cv_text, email_sent_at from candidates where id = ${id}`;
  if (!c) throw new Error("Candidate not found");

  await sql`update candidates set status = 'processing', error = null where id = ${id}`;
  try {
    const [criteria, settings, roles] = await Promise.all([getRubric(), getSettings(), getRoles()]);
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

    const applied = weightedScore(results, criteria, c.applied_role);
    const kind = applied >= settings.invite_threshold ? "invite" : "reject";
    if (!c.email_sent_at) {
      const email = await draftEmail({ cv: c.cv_text, kind, role: roles[c.applied_role as RoleCode], settings });
      await sql`update candidates set email_kind = ${kind}, email_subject = ${email.subject},
                email_body = ${email.body}, email_override = null where id = ${id}`;
    }
    await sql`update candidates set status = 'scored', brief = null where id = ${id}`;
  } catch (err) {
    await sql`update candidates set status = 'error', error = ${String((err as Error).message ?? err)} where id = ${id}`;
    throw err;
  }
}

// Step 2 (briefs for the top N per applied role) + re-drafting any unsent email whose
// invite/reject decision changed because the threshold changed. Idempotent.
export async function reconcile() {
  const [criteria, settings, roles] = await Promise.all([getRubric(), getSettings(), getRoles()]);
  const rows = await sql`
    select c.id, c.applied_role, c.cv_text, c.brief, c.email_kind, c.email_sent_at, rs.weighted_score
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

      const kind = Number(r.weighted_score) >= settings.invite_threshold ? "invite" : "reject";
      if (!r.email_sent_at && r.email_kind !== kind) {
        work.push(
          draftEmail({ cv: r.cv_text, kind, role, settings }).then(
            (email) => sql`update candidates set email_kind = ${kind}, email_subject = ${email.subject},
                           email_body = ${email.body}, email_override = null where id = ${r.id}`,
          ),
        );
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
