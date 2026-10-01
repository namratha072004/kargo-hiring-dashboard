// Server-safe presentational pieces shared across pages.
import Link from "next/link";
import type { Candidate, Metric } from "@/lib/queries";
import { LEVELS, scoreBg, scoreColor, scoreInk, scoreLabel } from "@/lib/score";

export function ScoreRing({ score, size = 64, label }: { score: number | null; size?: number; label?: string }) {
  const s = score ?? 1;
  const pct = score == null ? 0 : ((s - 1) / 3) * 100;
  return (
    <div className="ring" title={score == null ? "Not scored" : `${s.toFixed(2)} / 4 · ${scoreLabel(s)}`}
      style={{ "--s": Math.max(pct, 4), "--c": scoreColor(s), "--size": `${size}px` } as React.CSSProperties}>
      <span>{score == null ? "–" : s.toFixed(2)}</span>
      {label && <small>{label}</small>}
    </div>
  );
}

export function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <span className="chip ghost">not scored</span>;
  return (
    <span className="chip" style={{ background: scoreBg(score), color: scoreInk(score) }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: scoreColor(score) }} />
      {score.toFixed(2)} · {scoreLabel(score)}
    </span>
  );
}

export function Segs({ score }: { score: number }) {
  return (
    <div className="segs" title={`${score}/4 · ${LEVELS[score]}`}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="seg" style={i <= score ? { background: scoreColor(score) } : undefined} />
      ))}
    </div>
  );
}

export function MetricBars({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="metrics">
      {metrics.map((m) => (
        <div className="metric" key={m.criterion.id}>
          <div className="metric-name">
            {m.criterion.name}
            <span className="w">{Math.round(m.criterion.weight * 100)}%</span>
          </div>
          <Segs score={m.score} />
          <div className="metric-reason">
            <b>{m.score}/4 {LEVELS[m.score]}</b> — {m.reason}
            {m.pointsLost > 0 && <span className="muted"> · lost {m.pointsLost.toFixed(2)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StrengthsGaps({ metrics }: { metrics: Metric[] }) {
  const strengths = metrics.filter((m) => m.score >= 3).sort((a, b) => b.score - a.score || b.criterion.weight - a.criterion.weight);
  const gaps = metrics.filter((m) => m.score <= 2).sort((a, b) => b.pointsLost - a.pointsLost);
  const total = metrics.reduce((s, m) => s + m.pointsLost, 0);
  return (
    <div className="sg">
      <div className="sg-box good">
        <h4>💪 Strengths</h4>
        {strengths.length ? (
          <ul>{strengths.map((m) => <li key={m.criterion.id}><b>{m.criterion.name}</b>: {m.reason}</li>)}</ul>
        ) : <p className="small">Nothing scored Present or Strong.</p>}
      </div>
      <div className="sg-box bad">
        <h4>📉 Where they lost points {total > 0 && <span className="muted small">({total.toFixed(2)} of 3.00 lost)</span>}</h4>
        {gaps.length ? (
          <ul>{gaps.map((m) => (
            <li key={m.criterion.id}><b>{m.criterion.name}</b> (−{m.pointsLost.toFixed(2)}): {m.reason}</li>
          ))}</ul>
        ) : <p className="small">No weak spots against the rubric.</p>}
      </div>
    </div>
  );
}

export function DecisionChip({ c }: { c: Candidate }) {
  if (c.decision === "invite") return <span className="chip green">✅ Arjun: Interview</span>;
  if (c.decision === "reject") return <span className="chip red">✋ Arjun: Pass</span>;
  return <span className="chip sun">⏳ Awaiting Arjun</span>;
}

export function SuggestChip({ c }: { c: Candidate }) {
  if (!c.recommendation) return null;
  return c.recommendation === "invite"
    ? <span className="chip ghost">🤖 suggests interview</span>
    : <span className="chip ghost">🤖 suggests pass</span>;
}

export function EmailChip({ c }: { c: Candidate }) {
  const href = `/candidates/${c.id}#email`;
  if (c.email_sent_at) {
    const test = c.email_sent_to && c.email_sent_to !== c.email;
    return <Link href={href} className="chip green">📨 {c.email_kind === "invite" ? "Invite" : "Rejection"} sent{test ? " (test)" : ""}</Link>;
  }
  return <Link href={href} className="chip violet">✉️ {c.email_kind === "invite" ? "Invite" : "Rejection"} drafted →</Link>;
}

export function InterviewChip({ c }: { c: Candidate }) {
  const iv = c.interview;
  if (!iv || c.decision !== "invite") return null;
  const map = {
    to_schedule: ["sun", "📅 To schedule"],
    scheduled: ["violet", `📅 ${iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Scheduled"}`],
    done: ["teal", "🎙️ Interviewed"],
    no_show: ["red", "👻 No-show"],
  } as const;
  const [cls, text] = map[iv.status];
  return <Link href={`/interviews#${c.id}`} className={`chip ${cls}`}>{text}</Link>;
}

export function OutcomeChip({ outcome }: { outcome: string }) {
  if (outcome === "hire") return <span className="chip green">🎉 Hire</span>;
  if (outcome === "next_round") return <span className="chip violet">🔁 Next round</span>;
  if (outcome === "no_hire") return <span className="chip red">🙅 No hire</span>;
  return null;
}
