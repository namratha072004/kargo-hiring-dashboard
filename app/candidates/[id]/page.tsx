import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, getRubric, ROLES, type RoleCode } from "@/lib/db";
import { firstName } from "@/lib/pii";
import { ActionButton, EmailEditor } from "../../components";

export const dynamic = "force-dynamic";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [[c], criteria, scores, roleScores] = await Promise.all([
    sql`select c.*, p.full_name, p.email, p.phone
        from candidates c join candidate_pii p on p.candidate_id = c.id where c.id = ${id}`,
    getRubric(),
    sql`select criterion_id, score, reason from criterion_scores where candidate_id = ${id}`,
    sql`select role_code, weighted_score from role_scores where candidate_id = ${id}`,
  ]);
  if (!c) notFound();
  const pii = c as unknown as { full_name: string; email: string | null; phone: string | null };
  const first = firstName(pii.full_name);
  const body = (c.email_override ?? c.email_body ?? "").replaceAll("{{first_name}}", first);
  const rs = (role: RoleCode) => Number(roleScores?.find((r) => r.role_code === role)?.weighted_score ?? 0);

  return (
    <>
      <p><Link href={`/?role=${c.applied_role}`}>← {c.applied_role} ranking</Link></p>
      <section className="card">
        <h1>{pii.full_name}</h1>
        <p className="muted">
          Applied for {c.applied_role} · {pii.email ?? "no email"} · {pii.phone ?? "no phone"} · {c.file_name}
        </p>
        {c.status !== "scored" && <p className={c.status === "error" ? "err" : "muted"}>Status: {c.status} {c.error ?? ""}</p>}
        <div className="row">
          <ActionButton label="Re-score" url="/api/process" body={{ id, reconcile: true }}
            confirm={c.email_sent_at ? undefined : "Re-score this CV and re-draft the email?"} />
          <ActionButton label="Delete candidate" url="/api/candidate" body={{ action: "delete", id }}
            confirm="Delete this candidate and their personal details? This can't be undone." redirect="/" />
        </div>
      </section>

      {c.brief && (
        <section className="card">
          <h2>Interview brief</h2>
          <p>{c.brief}</p>
        </section>
      )}

      <div className="grid">
        <section className="card">
          <h2>
            Draft email <span className={`pill ${c.email_kind ?? ""}`}>{c.email_kind ?? "none"}</span>
          </h2>
          {c.email_body ? (
            <EmailEditor id={id} to={pii.email} firstName={first} subject={c.email_subject ?? ""} body={body}
              sentAt={c.email_sent_at ? new Date(c.email_sent_at).toISOString() : null} lastError={c.email_error} />
          ) : <p className="muted">No draft yet.</p>}
        </section>

        <section className="card">
          <h2>Scores</h2>
          {ROLES.map((role) => (
            <div key={role}>
              <h3>{role} — {rs(role).toFixed(2)} / 4.00 {role === c.applied_role && <span className="muted">(applied)</span>}</h3>
              <table><tbody>
                {criteria.filter((k) => k.role_code === role).map((k) => {
                  const s = scores?.find((x) => x.criterion_id === k.id);
                  return (
                    <tr key={k.id}>
                      <td style={{ width: "40%" }}>{k.name} <span className="muted">{Math.round(k.weight * 100)}%</span></td>
                      <td className="num"><strong>{s?.score ?? "–"}</strong></td>
                      <td className="muted">{s?.reason}</td>
                    </tr>
                  );
                })}
              </tbody></table>
            </div>
          ))}
        </section>
      </div>

      <section className="card">
        <details>
          <summary>What the AI saw (redacted CV)</summary>
          <pre className="muted" style={{ marginTop: 10 }}>{c.cv_text}</pre>
        </details>
      </section>
    </>
  );
}
