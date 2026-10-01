import Link from "next/link";
import { getCandidates, appliedScore, otherRole, type Candidate } from "@/lib/queries";
import type { RoleCode } from "@/lib/db";
import { ActionButton } from "../components";
import {
  DecisionChip, EmailChip, InterviewChip, MetricBars, ScorePill, ScoreRing, StrengthsGaps, SuggestChip,
} from "../ui";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; test: (c: Candidate) => boolean }> = {
  all: { label: "All", test: () => true },
  pending: { label: "⏳ Awaiting decision", test: (c) => c.decision === "pending" },
  good: { label: "🌟 Good fits", test: (c) => c.recommendation === "invite" },
  below: { label: "🔻 Below line", test: (c) => c.recommendation === "reject" },
  invited: { label: "✅ Invited", test: (c) => c.decision === "invite" },
  rejected: { label: "✋ Passed", test: (c) => c.decision === "reject" },
};

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ role?: string; filter?: string }> }) {
  const sp = await searchParams;
  const role: RoleCode = sp.role === "SPM" ? "SPM" : "PM";
  const filter = sp.filter && (FILTERS[sp.filter] || sp.filter === "errors") ? sp.filter : "all";
  const { candidates, settings } = await getCandidates();

  const errors = candidates.filter((c) => c.status !== "scored");
  const ranked = candidates
    .filter((c) => c.status === "scored" && c.applied_role === role)
    .sort((a, b) => appliedScore(b) - appliedScore(a));
  const shown = filter === "errors" ? [] : ranked.filter(FILTERS[filter].test);
  const lineAt = shown.findIndex((c) => appliedScore(c) < settings.invite_threshold);
  const crossFits = candidates.filter(
    (c) => c.status === "scored" && c.applied_role === otherRole(role) && (c.scores[role] ?? 0) >= settings.invite_threshold,
  );
  const q = (p: Record<string, string>) => `/candidates?${new URLSearchParams({ role, filter, ...p })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>👥 Candidates</h1>
          <p>Ranked by the rubric for the role they applied for. Open <b>Why this score?</b> on any card to see the breakdown.</p>
        </div>
        <div className="tabs">
          <Link href={q({ role: "PM" })} className={role === "PM" ? "on" : ""}>Product Manager</Link>
          <Link href={q({ role: "SPM" })} className={role === "SPM" ? "on" : ""}>Senior PM</Link>
        </div>
      </div>

      <div className="hstack" style={{ marginBottom: 18 }}>
        {Object.entries(FILTERS).map(([k, f]) => (
          <Link key={k} href={q({ filter: k })} className={`chip ${filter === k ? "ink" : ""}`}>
            {f.label} · {ranked.filter(f.test).length}
          </Link>
        ))}
        {errors.length > 0 && <Link href={q({ filter: "errors" })} className={`chip red ${filter === "errors" ? "ink" : ""}`}>⚠️ Not scored · {errors.length}</Link>}
      </div>

      {filter === "errors" ? (
        <section className="card">
          <h2>⚠️ Not scored yet</h2>
          {errors.length === 0 ? <p>Nothing here.</p> : (
            <table><tbody>
              {errors.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/candidates/${c.id}`}><b>{c.full_name}</b></Link> <span className="muted">({c.applied_role})</span></td>
                  <td className={c.status === "error" ? "err small" : "small"}>{c.status}{c.error ? `: ${c.error.slice(0, 160)}` : ""}</td>
                  <td><ActionButton label="🔄 Retry" url="/api/process" body={{ id: c.id, reconcile: true }} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </section>
      ) : shown.length === 0 ? (
        <div className="card empty"><span className="big-emoji">🫙</span>No candidates here yet. <Link href="/upload">Upload some CVs →</Link></div>
      ) : (
        shown.map((c, i) => (
          <div key={c.id}>
            {i === lineAt && lineAt > 0 && <div className="line-divider">INVITE LINE · {settings.invite_threshold.toFixed(2)}</div>}
            <CandidateCard c={c} rank={ranked.indexOf(c) + 1} role={role} />
          </div>
        ))
      )}

      {crossFits.length > 0 && filter !== "errors" && (
        <section className="card tint-violet">
          <h2>🔀 Applied for {otherRole(role)}, but clear the {role} line</h2>
          <p className="small ink2">Worth a look: they score at or above {settings.invite_threshold.toFixed(2)} on the {role} rubric too.</p>
          {crossFits.map((c) => (
            <Link href={`/candidates/${c.id}`} key={c.id} className="leader">
              <ScoreRing score={c.scores[role]} size={46} />
              <div style={{ flex: 1 }}><div className="nm">{c.full_name}</div><div className="small ink2">{role} {c.scores[role]?.toFixed(2)} · applied {c.applied_role} {appliedScore(c).toFixed(2)}</div></div>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

function CandidateCard({ c, rank, role }: { c: Candidate; rank: number; role: RoleCode }) {
  const other = otherRole(role);
  return (
    <section className="card cand">
      <div className="cand-top">
        <div className="rank">{rank}</div>
        <ScoreRing score={c.scores[role]} size={70} label={role} />
        <div className="cand-main">
          <Link href={`/candidates/${c.id}`} className="cand-name">{c.full_name}</Link>
          <div className="cand-meta">
            {c.email ?? "no email"} · {other} score {c.scores[other]?.toFixed(2) ?? "–"}
          </div>
          <div className="cand-chips">
            <ScorePill score={c.scores[role]} />
            <SuggestChip c={c} />
            <DecisionChip c={c} />
            <EmailChip c={c} />
            <InterviewChip c={c} />
          </div>
        </div>
        <div className="cand-side">
          <Link href={`/candidates/${c.id}`} className="btn small secondary">Open →</Link>
          <Link href={`/candidates/${c.id}#email`} className="btn small violet">✉️ Email</Link>
        </div>
      </div>
      {c.brief && <p className="small ink2 clamp2" style={{ margin: "0 18px 14px" }} title={c.brief}>📝 {c.brief}</p>}
      <details>
        <summary><span className="caret">▶</span> Why this score? Every metric, strengths and where they lost points</summary>
        <div className="drop">
          <MetricBars metrics={c.metrics[role]} />
          <StrengthsGaps metrics={c.metrics[role]} />
        </div>
      </details>
    </section>
  );
}
