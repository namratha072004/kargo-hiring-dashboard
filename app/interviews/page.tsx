import Link from "next/link";
import { getCandidates, appliedScore, firstNameOf, type Candidate } from "@/lib/queries";
import { DraftFollowupButton, EmailEditor, InterviewEditor } from "../components";
import { OutcomeChip, ScoreRing } from "../ui";

export const dynamic = "force-dynamic";

const COLS = [
  { key: "to_schedule", title: "📅 To schedule", cls: "tint-sun" },
  { key: "scheduled", title: "🗓️ Scheduled", cls: "tint-violet" },
  { key: "done", title: "🎙️ Done", cls: "tint-teal" },
] as const;

export default async function InterviewsPage() {
  const { candidates } = await getCandidates();
  const invited = candidates
    .filter((c) => c.decision === "invite" && c.interview)
    .sort((a, b) => appliedScore(b) - appliedScore(a));
  const blobEnabled = !!process.env.BLOB_READ_WRITE_TOKEN;
  const testTo = process.env.RESEND_TEST_TO || undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🎙️ Interviews</h1>
          <p>Everyone you&apos;ve said <b>yes</b> to. Schedule, record, take notes, score the interview and send the follow-up.</p>
        </div>
      </div>

      {invited.length === 0 ? (
        <div className="card empty">
          <span className="big-emoji">🎤</span>
          No interviews yet. Open a candidate and click <b>✅ Invite to interview</b>, and they&apos;ll show up here.
          <div style={{ marginTop: 14 }}><Link href="/candidates?filter=good" className="btn">See good fits →</Link></div>
        </div>
      ) : (
        <>
          <div className="board" style={{ marginBottom: 28 }}>
            {COLS.map((col) => {
              const items = invited.filter((c) => (col.key === "done" ? ["done", "no_show"] : [col.key]).includes(c.interview!.status));
              return (
                <div key={col.key}>
                  <div className={`col-head card ${col.cls}`} style={{ marginBottom: 12 }}>{col.title}<span className="chip">{items.length}</span></div>
                  {items.map((c) => (
                    <a key={c.id} href={`#${c.id}`} className="card leader" style={{ padding: "10px 14px", marginBottom: 10 }}>
                      <ScoreRing score={appliedScore(c)} size={40} />
                      <div style={{ flex: 1 }}>
                        <div className="nm">{c.full_name}</div>
                        <div className="small ink2">
                          {c.applied_role}
                          {c.interview!.scheduled_at && ` · ${new Date(c.interview!.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
                          {c.interview!.status === "no_show" && " · no-show"}
                        </div>
                      </div>
                      <OutcomeChip outcome={c.interview!.outcome} />
                    </a>
                  ))}
                  {items.length === 0 && <p className="small muted" style={{ textAlign: "center" }}>Nobody here</p>}
                </div>
              );
            })}
          </div>

          {invited.map((c) => <InterviewCard key={c.id} c={c} blobEnabled={blobEnabled} testTo={testTo} />)}
        </>
      )}
    </>
  );
}

function InterviewCard({ c, blobEnabled, testTo }: { c: Candidate; blobEnabled: boolean; testTo?: string }) {
  const iv = c.interview!;
  const first = firstNameOf(c.full_name);
  const role = c.applied_role;
  const question = c.brief?.split(/(?<=[.?!])\s+/).slice(-1)[0];
  const followBody = (iv.followup_body ?? "").replaceAll("{{first_name}}", first);
  const label = { next_round: "Next-round invite", hire: "Offer conversation", no_hire: "Post-interview rejection" }[iv.followup_kind ?? ""] ?? "";

  return (
    <section className="card anchor" id={c.id}>
      <div className="hstack" style={{ marginBottom: 14 }}>
        <ScoreRing score={appliedScore(c)} size={58} />
        <div style={{ flex: 1 }}>
          <Link href={`/candidates/${c.id}`} className="cand-name">{c.full_name}</Link>
          <div className="small ink2">
            {role === "PM" ? "Product Manager" : "Senior PM"} · {c.email}
            {c.email_sent_at ? " · 📨 invite sent" : <> · <Link href={`/candidates/${c.id}#email`}>✉️ invite not sent yet →</Link></>}
          </div>
        </div>
        <OutcomeChip outcome={iv.outcome} />
      </div>
      {question && <div className="banner violet">💡 <span><b>Ask them:</b> {question}</span></div>}

      <div className="grid-2">
        <div>
          <InterviewEditor
            key={JSON.stringify(iv)}
            id={c.id}
            iv={iv}
            blobEnabled={blobEnabled}
            criteria={c.metrics[role].map((m) => ({ id: m.criterion.id, name: m.criterion.name, cvScore: m.score }))}
          />
        </div>
        <div>
          <h3>📬 Follow-up email</h3>
          {iv.outcome === "pending" ? (
            <p className="small ink2">Pick an outcome (Next round / Hire / No hire) and save. Then draft a personalised follow-up from your notes.</p>
          ) : (
            <>
              <div className="hstack" style={{ marginBottom: 12 }}>
                {!iv.followup_sent_at && <DraftFollowupButton id={c.id} has={!!iv.followup_body} />}
                {label && <span className="chip">{label}</span>}
              </div>
              {iv.followup_kind && iv.followup_kind !== iv.outcome && !iv.followup_sent_at && (
                <div className="banner sun">⚠️ <span>The outcome changed since this was drafted. Re-draft it.</span></div>
              )}
              {iv.followup_body ? (
                <EmailEditor key={`${iv.followup_kind}-${iv.followup_body.length}`} which="followup" id={c.id} to={c.email}
                  firstName={first} testTo={testTo} subject={iv.followup_subject ?? ""} body={followBody}
                  sentAt={iv.followup_sent_at} lastError={iv.followup_error}
                  canSend={iv.followup_kind === iv.outcome}
                  blockedReason="Re-draft first so the email matches the outcome." />
              ) : <p className="small muted">No follow-up drafted yet.</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
