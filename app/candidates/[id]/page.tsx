import Link from "next/link";
import { notFound } from "next/navigation";
import { getCandidates, firstNameOf, otherRole } from "@/lib/queries";
import { scoreLabel } from "@/lib/score";
import { ActionButton, DecisionPanel, EmailEditor } from "../../components";
import { InterviewChip, MetricBars, OutcomeChip, ScoreRing, StrengthsGaps } from "../../ui";

export const dynamic = "force-dynamic";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { candidates, settings } = await getCandidates({ id });
  const c = candidates[0];
  if (!c) notFound();

  const role = c.applied_role;
  const other = otherRole(role);
  const first = firstNameOf(c.full_name);
  const body = (c.email_override ?? c.email_body ?? "").replaceAll("{{first_name}}", first);
  const decided = c.decision !== "pending";
  const draftMatches = c.email_kind === c.decision;
  const steps = [
    { n: 1, t: "Review the score", done: c.status === "scored" },
    { n: 2, t: "Make your call", done: decided },
    { n: 3, t: "Send the email", done: !!c.email_sent_at },
    ...(c.decision === "invite" ? [{ n: 4, t: "Interview", done: c.interview?.status === "done" }] : []),
  ];
  const nowIdx = steps.findIndex((s) => !s.done);

  return (
    <>
      <p><Link href={`/candidates?role=${role}`} className="small">← Back to {role} ranking</Link></p>

      <section className="card">
        <div className="hstack" style={{ alignItems: "flex-start", gap: 24 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <span className="chip tangerine">Applied for {role === "PM" ? "Product Manager" : "Senior Product Manager"}</span>
            <h1 style={{ marginTop: 10 }}>{c.full_name}</h1>
            <p className="ink2 small">
              {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "no email"} · {c.phone ?? "no phone"} · 📎 {c.file_name}
            </p>
            <div className="hstack">
              <InterviewChip c={c} />
              {c.interview && <OutcomeChip outcome={c.interview.outcome} />}
              <ActionButton label="🔄 Re-score" url="/api/process" body={{ id, reconcile: true }}
                confirm={c.email_sent_at ? undefined : "Re-score this CV and re-draft the email?"} />
              <ActionButton label="🗑️ Delete" url="/api/candidate" body={{ action: "delete", id }}
                confirm="Delete this candidate and all their personal details? This can't be undone." redirect="/candidates" />
            </div>
          </div>
          <div className="hstack" style={{ gap: 28, paddingBottom: 18 }}>
            <div style={{ textAlign: "center" }}>
              <ScoreRing score={c.scores[role]} size={112} label={`${role} · applied`} />
            </div>
            <div style={{ textAlign: "center", opacity: 0.85 }}>
              <ScoreRing score={c.scores[other]} size={84} label={other} />
            </div>
          </div>
        </div>
        {c.scores[role] != null && (
          <p className="small" style={{ marginTop: 6, marginBottom: 0 }}>
            <b>{scoreLabel(c.scores[role]!)}</b> for {role}: {c.scores[role]!.toFixed(2)} out of 4.00 (invite line {settings.invite_threshold.toFixed(2)}).
          </p>
        )}
        {c.status !== "scored" && <div className="banner red" style={{ marginTop: 12 }}>⚠️ <span>Status: {c.status} {c.error}</span></div>}
      </section>

      <div className="steps">
        {steps.map((s, i) => (
          <span key={s.n} className={`step ${s.done ? "done" : i === nowIdx ? "now" : ""}`}>
            <span className="n">{s.done ? "✓" : s.n}</span>{s.t}
          </span>
        ))}
      </div>

      <div className="grid-2">
        <section className="card tint-sun">
          <h2>⚖️ Your call, Arjun</h2>
          <DecisionPanel id={id} decision={c.decision} recommendation={c.recommendation}
            score={c.scores[role]} threshold={settings.invite_threshold} locked={!!c.email_sent_at} />
          {c.decision === "invite" && (
            <p className="small" style={{ marginTop: 14, marginBottom: 0 }}>
              🎙️ Added to <Link href={`/interviews#${id}`}><b>Interviews</b></Link>. Schedule it, add the recording and notes there.
            </p>
          )}
        </section>
        <section className="card tint-violet">
          <h2>📝 Interview brief</h2>
          {c.brief ? <p>{c.brief}</p> : <p className="ink2 small">Briefs are written for the top {settings.top_n} per role. Change that in Settings.</p>}
        </section>
      </div>

      <section className="card">
        <h2>🔍 Why {c.scores[role]?.toFixed(2)} for {role}?</h2>
        <MetricBars metrics={c.metrics[role]} />
        <StrengthsGaps metrics={c.metrics[role]} />
        <details style={{ marginTop: 18 }}>
          <summary className="small" style={{ cursor: "pointer", fontWeight: 700 }}>▶ Also scored against {other}: {c.scores[other]?.toFixed(2)}</summary>
          <div style={{ marginTop: 14 }}>
            <MetricBars metrics={c.metrics[other]} />
            <StrengthsGaps metrics={c.metrics[other]} />
          </div>
        </details>
      </section>

      <section className="card anchor" id="email">
        <div className="hstack" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>✉️ Email to {first}</h2>
          {c.email_kind && (
            <span className={`chip ${c.email_kind === "invite" ? "green" : "red"}`}>
              {c.email_kind === "invite" ? "Interview invite" : "Rejection"}
            </span>
          )}
        </div>
        {!decided && !c.email_sent_at && (
          <div className="banner sun">👇 <span>This {c.email_kind === "invite" ? "invite" : "rejection"} follows the app&apos;s suggestion. <b>Confirm &amp; send</b> accepts it and sends it in one click. To overrule, pick {c.email_kind === "invite" ? "Pass" : "Invite"} above and the email is rewritten to match.</span></div>
        )}
        {c.email_body ? (
          <EmailEditor key={`${c.email_kind}-${c.email_body?.length}`} id={id} to={c.email} firstName={first}
            kind={c.email_kind ?? "invite"} decisionPending={!decided}
            testTo={process.env.RESEND_TEST_TO || undefined} subject={c.email_subject ?? ""} body={body}
            sentAt={c.email_sent_at} sentTo={c.email_sent_to} lastError={c.email_error}
            canSend={!decided || draftMatches}
            blockedReason={decided && !draftMatches ? "The draft is being rewritten to match your decision. Refresh in a moment." : undefined} />
        ) : <p className="ink2">No draft yet.</p>}
      </section>

      <section className="card flat">
        <details>
          <summary className="small" style={{ cursor: "pointer", fontWeight: 700 }}>🔒 What the AI saw (personal details removed)</summary>
          <pre className="small ink2" style={{ marginTop: 12 }}>{c.cv_text}</pre>
        </details>
      </section>
    </>
  );
}
