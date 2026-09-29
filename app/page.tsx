import Link from "next/link";
import { db, getSettings, type RoleCode } from "@/lib/db";
import { ActionButton, Uploader } from "./components";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  applied_role: RoleCode;
  status: string;
  error: string | null;
  brief: string | null;
  email_kind: string | null;
  email_sent_at: string | null;
  created_at: string;
  candidate_pii: { full_name: string } | null;
  role_scores: { role_code: RoleCode; weighted_score: number }[];
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const role: RoleCode = (await searchParams).role === "SPM" ? "SPM" : "PM";
  const other: RoleCode = role === "PM" ? "SPM" : "PM";
  const [settings, { data, error }] = await Promise.all([
    getSettings(),
    db.from("candidates")
      .select("id, applied_role, status, error, brief, email_kind, email_sent_at, created_at, candidate_pii(full_name), role_scores(role_code, weighted_score)")
      .returns<Row[]>(),
  ]);
  if (error) throw error;

  const score = (r: Row, rc: RoleCode) => {
    const s = r.role_scores.find((x) => x.role_code === rc);
    return s ? Number(s.weighted_score) : null;
  };
  const scored = data
    .filter((r) => r.applied_role === role && r.status === "scored")
    .sort((a, b) => (score(b, role) ?? 0) - (score(a, role) ?? 0));
  const unscored = data.filter((r) => r.status !== "scored");
  // Applied for the other role but would clear this role's line.
  const crossFits = data.filter(
    (r) => r.applied_role === other && r.status === "scored" && (score(r, role) ?? 0) >= settings.invite_threshold,
  );
  const lineIndex = scored.findIndex((r) => (score(r, role) ?? 0) < settings.invite_threshold);
  const pending = scored.filter((r) => !r.email_sent_at).length;

  return (
    <>
      <Uploader />

      <div className="tabs">
        <Link href="/?role=PM" className={role === "PM" ? "on" : ""}>Product Manager</Link>
        <Link href="/?role=SPM" className={role === "SPM" ? "on" : ""}>Senior Product Manager</Link>
      </div>

      <section className="card scroll">
        <h2>
          {role === "PM" ? "Product Manager" : "Senior Product Manager"} applicants — {scored.length} ranked
          <span className="muted"> · {pending} emails waiting to send · invite line {settings.invite_threshold.toFixed(2)} · briefs for top {settings.top_n}</span>
        </h2>
        {scored.length === 0 ? <p className="muted">No scored candidates yet.</p> : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>Candidate</th><th className="num">{role} score</th><th className="num">{other} score</th>
                <th>Draft</th><th>Brief</th><th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((r, i) => (
                <tr key={r.id} className={[i >= lineIndex && lineIndex !== -1 ? "below" : "", i === lineIndex - 1 ? "line" : ""].join(" ")}>
                  <td>{i + 1}</td>
                  <td><Link href={`/candidates/${r.id}`}>{r.candidate_pii?.full_name ?? "(no name)"}</Link></td>
                  <td className="num"><strong>{score(r, role)?.toFixed(2)}</strong></td>
                  <td className="num">{score(r, other)?.toFixed(2)}</td>
                  <td><span className={`pill ${r.email_kind ?? ""}`}>{r.email_kind ?? "—"}</span></td>
                  <td style={{ maxWidth: 420 }}>{r.brief ? <span className="muted">{r.brief}</span> : ""}</td>
                  <td>{r.email_sent_at ? <span className="ok">✓</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {crossFits.length > 0 && (
        <section className="card">
          <h2>Applied for {other}, but clear the {role} line</h2>
          <table><tbody>
            {crossFits.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/candidates/${r.id}`}>{r.candidate_pii?.full_name}</Link></td>
                <td className="num">{role} {score(r, role)?.toFixed(2)}</td>
                <td className="num muted">{other} {score(r, other)?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}

      {unscored.length > 0 && (
        <section className="card">
          <h2>Not scored yet</h2>
          <table><tbody>
            {unscored.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/candidates/${r.id}`}>{r.candidate_pii?.full_name}</Link> <span className="muted">({r.applied_role})</span></td>
                <td className={r.status === "error" ? "err" : "muted"}>{r.status}{r.error ? `: ${r.error}` : ""}</td>
                <td><ActionButton label="Retry" url="/api/process" body={{ id: r.id, reconcile: true }} /></td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}
    </>
  );
}
