import Link from "next/link";
import { getCandidates, appliedScore, firstNameOf, type Candidate } from "@/lib/queries";
import { ROLES, type RoleCode } from "@/lib/db";
import { scoreBg, scoreColor, scoreInk, scoreLabel } from "@/lib/score";
import { ConfirmSendButton, QuickDecide } from "./components";
import { ScoreRing } from "./ui";

export const dynamic = "force-dynamic";

const ROLE_COLOR: Record<RoleCode, string> = { PM: "var(--lavender)", SPM: "var(--peach)" };
const ROLE_NAME: Record<RoleCode, string> = { PM: "Product Manager", SPM: "Senior PM" };
const BUCKETS = [
  { lo: 1, hi: 2, label: "Very weak", range: "below 2.0", mid: 1.5 },
  { lo: 2, hi: 2.5, label: "Weak", range: "2.0–2.5", mid: 2.25 },
  { lo: 2.5, hi: 3, label: "Mixed", range: "2.5–3.0", mid: 2.75 },
  { lo: 3, hi: 3.5, label: "Strong", range: "3.0–3.5", mid: 3.25 },
  { lo: 3.5, hi: 4.01, label: "Excellent", range: "3.5+", mid: 3.75 },
];
const SHORT = ["Unprompted build", "Two audiences", "High-pressure call", "Adoption precision"];

function nowIST() {
  const d = new Date();
  const hour = Number(d.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const date = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  return { greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening", date };
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  const { candidates, settings, criteria } = await getCandidates();
  const scored = candidates.filter((c) => c.status === "scored");
  const good = scored.filter((c) => c.recommendation === "invite");
  const below = scored.filter((c) => c.recommendation === "reject");
  const pending = scored.filter((c) => c.decision === "pending").sort((a, b) => appliedScore(b) - appliedScore(a));
  const invited = scored.filter((c) => c.decision === "invite");
  const rejected = scored.filter((c) => c.decision === "reject");
  const inviteSent = invited.filter((c) => c.email_sent_at);
  const interviewed = invited.filter((c) => c.interview?.status === "done");
  const hires = invited.filter((c) => c.interview?.outcome === "hire");
  const failed = candidates.filter((c) => c.status === "error");
  const readyToSend = scored.filter((c) => c.decision !== "pending" && !c.email_sent_at && c.email_kind === c.decision);
  const upcoming = invited
    .filter((c) => c.interview?.status === "scheduled" && c.interview.scheduled_at)
    .sort((a, b) => +new Date(a.interview!.scheduled_at!) - +new Date(b.interview!.scheduled_at!));
  const toSchedule = invited.filter((c) => c.interview?.status === "to_schedule");
  const total = candidates.length;
  // Next up: highest-scoring candidate whose first email hasn't gone out, best first.
  const queue = scored
    .filter((c) => !c.email_sent_at && c.email_body)
    // ties: newest first, so fresh uploads surface ahead of older equals
    .sort((a, b) => appliedScore(b) - appliedScore(a) || +new Date(b.created_at) - +new Date(a.created_at));
  const spot = queue[0];
  const { greeting, date } = nowIST();

  const tiles = [
    { icon: "📄", bg: "var(--butter-soft)", n: total, lbl: "CVs uploaded", sub: `${scored.length} scored`, meter: pct(scored.length, total), c: "var(--butter-mid)", href: "/candidates" },
    { icon: "🌟", bg: "var(--mint-soft)", n: good.length, lbl: "Good fits", sub: `${pct(good.length, scored.length)}% clear the ${settings.invite_threshold.toFixed(2)} line`, meter: pct(good.length, scored.length), c: "var(--mint-mid)", href: "/candidates?filter=good" },
    { icon: "🔻", bg: "var(--rose-soft)", n: below.length, lbl: "Below the line", sub: "suggested pass", meter: pct(below.length, scored.length), c: "var(--rose-mid)", href: "/candidates?filter=below" },
    { icon: "⏳", bg: "var(--peach-soft)", n: pending.length, lbl: "Awaiting your call", sub: pending.length ? "needs a decision" : "all decided", meter: pct(pending.length, scored.length), c: "var(--peach-mid)", href: "/candidates?filter=pending" },
    { icon: "📞", bg: "var(--lavender-soft)", n: invited.length, lbl: "Interview calls", sub: `${inviteSent.length} invite${inviteSent.length === 1 ? "" : "s"} sent`, meter: pct(invited.length, scored.length), c: "var(--lavender-mid)", href: "/interviews" },
    { icon: "✋", bg: "var(--sky-soft)", n: rejected.length, lbl: "Rejected", sub: `${rejected.filter((c) => c.email_sent_at).length} emails sent`, meter: pct(rejected.length, scored.length), c: "var(--sky-mid)", href: "/candidates?filter=rejected" },
  ];

  const funnel = [
    { lbl: "Uploaded", n: total, c: "var(--butter-mid)" },
    { lbl: "Good fit", n: good.length, c: "var(--mint-mid)" },
    { lbl: "Invited", n: invited.length, c: "var(--lavender-mid)" },
    { lbl: "Interviewed", n: interviewed.length, c: "var(--sky-mid)" },
    { lbl: "Hired", n: hires.length, c: "var(--peach-mid)" },
  ];

  // Score distribution: applicants per score band, per applied role.
  const dist = BUCKETS.map((b) => ({
    ...b,
    counts: Object.fromEntries(ROLES.map((r) => [r, scored.filter((c) => c.applied_role === r && appliedScore(c) >= b.lo && appliedScore(c) < b.hi).length])) as Record<RoleCode, number>,
  }));
  const distMax = Math.max(1, ...dist.flatMap((d) => ROLES.map((r) => d.counts[r])));

  // Heatmap: average score per rubric criterion, across applicants for that role.
  const heat = [1, 2, 3, 4].map((pos, i) => ({
    name: SHORT[i],
    cells: ROLES.map((role) => {
      const k = criteria.find((c) => c.role_code === role && c.position === pos)!;
      const vals = scored.filter((c) => c.applied_role === role).map((c) => c.metrics[role].find((m) => m.criterion.id === k.id)?.score).filter(Boolean) as number[];
      return { role, full: k.name, weight: k.weight, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
    }),
  }));
  const allCells = heat.flatMap((h) => h.cells.map((c) => ({ ...c, short: h.name }))).filter((c) => c.avg != null);
  const weakest = allCells.sort((a, b) => a.avg! - b.avg!)[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{date}</div>
          <h1>{greeting}, Arjun 🌤️</h1>
          <p>
            {total === 0 ? "Upload some CVs to get started."
              : <>{scored.length} candidates scored · <b>{good.length}</b> look like good fits
                {pending.length > 0 && <> · <b>{pending.length}</b> waiting for your call</>}
                {readyToSend.length > 0 && <> · <b>{readyToSend.length}</b> email{readyToSend.length === 1 ? "" : "s"} ready to send</>}</>}
          </p>
        </div>
        <div className="hstack">
          {pending.length > 0 && <Link href="/candidates?filter=pending" className="btn secondary">Review pending</Link>}
          <Link href="/upload" className="btn">⬆️ Upload CVs</Link>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="banner red">⚠️ <span><b>{failed.length}</b> CV{failed.length === 1 ? "" : "s"} couldn&apos;t be scored. <Link href="/candidates?filter=errors">Retry →</Link></span></div>
      )}

      <div className="stats">
        {tiles.map((t) => (
          <Link key={t.lbl} href={t.href} className="stat">
            <span className="icon" style={{ background: t.bg }}>{t.icon}</span>
            <span className="num">{t.n}</span>
            <span className="lbl">{t.lbl}</span>
            <span className="sub">{t.sub}</span>
            <span className="meter"><div style={{ width: `${t.meter}%`, background: t.c }} /></span>
          </Link>
        ))}
      </div>

      {sent && (() => {
        const s = candidates.find((c) => c.id === sent && c.email_sent_at);
        if (!s) return null;
        const test = s.email_sent_to && s.email_sent_to !== s.email;
        return (
          <div className="banner green" style={{ alignItems: "center" }}>
            📨 <span style={{ flex: 1 }}>
              <b>{s.email_kind === "invite" ? "Invite" : "Rejection"} sent to {s.full_name}</b>, delivered to <b>{s.email_sent_to}</b>
              {test && <> (test mode, instead of {s.email})</>}. Their card is now marked as sent.
            </span>
            {s.decision === "invite" && <Link href={`/interviews#${s.id}`} className="btn small secondary">📅 Schedule interview</Link>}
            <Link href={`/candidates/${s.id}`} className="btn small secondary">View card</Link>
          </div>
        );
      })()}

      {spot && <Spotlight c={spot} next={queue.slice(1, 4)} threshold={settings.invite_threshold} testTo={process.env.RESEND_TEST_TO || undefined} />}

      <div className="grid-32">
        <section className="card">
          <div className="card-head">
            <h2>📊 Score distribution</h2>
            <span className="sub">applicants per score band, by role applied for</span>
          </div>
          <div className="legend">
            {ROLES.map((r) => <span key={r}><i style={{ background: ROLE_COLOR[r] }} />{ROLE_NAME[r]}</span>)}
          </div>
          <div className="chart" role="img" aria-label="Score distribution by role">
            <div className="hist">
              {dist.map((d) => (
                <div className="hist-col" key={d.label}>
                  {ROLES.map((r) => (
                    <div key={r} className="bar" tabIndex={0}
                      data-tip={`${ROLE_NAME[r]} · ${d.label} (${d.range}): ${d.counts[r]}`}
                      style={{ height: `${(d.counts[r] / distMax) * 100}%`, background: ROLE_COLOR[r], opacity: d.counts[r] ? 1 : 0.25 }}>
                      {d.counts[r] > 0 && <span className="v">{d.counts[r]}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="hist-x">
              {dist.map((d) => (
                <div key={d.label}><b><span className="dot" style={{ background: scoreColor(d.mid) }} />{d.label}</b>{d.range}</div>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>Invite line sits at {settings.invite_threshold.toFixed(2)}: the Strong and Excellent bands clear it.</p>
        </section>

        <section className="card">
          <div className="card-head"><h2>🚚 Hiring funnel</h2></div>
          <div className="funnel">
            {funnel.map((f, i) => (
              <div className="funnel-row" key={f.lbl}>
                <span>{f.lbl}</span>
                <div className="funnel-track" data-tip={`${f.lbl}: ${f.n}`}><div className="funnel-fill" style={{ width: `${pct(f.n, Math.max(1, total))}%`, background: f.c }} /></div>
                <span className="num display" style={{ fontWeight: 700 }}>{f.n}</span>
                <span className="conv">{i === 0 ? "" : `${pct(f.n, funnel[i - 1].n)}%`}</span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>The percentage is the share that made it from the previous stage.</p>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>🧭 Where the applicant pool is weak</h2>
            <span className="sub">average rubric score, 1–4</span>
          </div>
          <table className="heat">
            <thead><tr><th>Criterion</th>{ROLES.map((r) => <th key={r}>{ROLE_NAME[r]} applicants</th>)}</tr></thead>
            <tbody>
              {heat.map((h) => (
                <tr key={h.name}>
                  <td className="name">{h.name}</td>
                  {h.cells.map((c) => (
                    <td key={c.role}>
                      {c.avg == null ? <div className="cell na">–</div> : (
                        <div className="cell" tabIndex={0} style={{ background: scoreBg(c.avg), boxShadow: `inset 0 0 0 1px ${scoreColor(c.avg)}` }}
                          data-tip={`${c.full} (${Math.round(c.weight * 100)}%) · avg ${c.avg.toFixed(1)} across ${c.n}`}>
                          <span style={{ color: scoreInk(c.avg) }}>{c.avg.toFixed(1)}<small>{scoreLabel(c.avg)}</small></span>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {weakest && (
            <div className="insight">💡 <span>Weakest overall: <b>{weakest.short}</b> among {ROLE_NAME[weakest.role]} applicants (avg {weakest.avg!.toFixed(1)}). Worth probing in every interview.</span></div>
          )}
        </section>

        <section className="card tint-tangerine">
          <div className="card-head">
            <h2>⏳ Waiting for your call</h2>
            <span className="spacer" />
            {pending.length > 0 && <Link href="/candidates?filter=pending" className="small">See all {pending.length} →</Link>}
          </div>
          {pending.length === 0 ? <p className="ink2">Nothing waiting. Nice work. 🎉</p> : pending.slice(0, 6).map((c) => (
            <div className="list-row" key={c.id}>
              <ScoreRing score={appliedScore(c)} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/candidates/${c.id}`} className="nm">{c.full_name}</Link>
                <div className="small muted">{c.applied_role} · 🤖 suggests {c.recommendation === "invite" ? "interview" : "pass"}</div>
              </div>
              <QuickDecide id={c.id} suggestion={c.recommendation} />
            </div>
          ))}
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>🗓️ Upcoming interviews</h2><span className="spacer" /><Link href="/interviews" className="small">Interviews →</Link></div>
          {upcoming.length === 0 && toSchedule.length === 0 ? <p className="ink2 small">No interviews lined up yet. Invite someone to get started.</p> : (
            <>
              {upcoming.slice(0, 5).map((c) => {
                const d = new Date(c.interview!.scheduled_at!);
                return (
                  <div className="list-row" key={c.id}>
                    <div className="date-badge">
                      <b>{d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" })}</b>
                      <span>{d.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Link href={`/interviews#${c.id}`} className="nm">{c.full_name}</Link>
                      <div className="small muted">{d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} · {c.interview!.mode}</div>
                    </div>
                    <span className="chip violet">{c.applied_role}</span>
                  </div>
                );
              })}
              {toSchedule.length > 0 && (
                <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
                  📅 <b>{toSchedule.length}</b> still to schedule: {toSchedule.slice(0, 3).map((c) => c.full_name).join(", ")}{toSchedule.length > 3 ? "…" : ""}
                </p>
              )}
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h2>📬 Ready to send</h2><span className="sub">decided, email drafted, not sent yet</span></div>
          {readyToSend.length === 0 ? <p className="ink2 small">Nothing queued. Emails show up here once you decide Invite or Pass.</p> : readyToSend.slice(0, 6).map((c) => (
            <div className="list-row" key={c.id}>
              <span className={`chip ${c.decision === "invite" ? "green" : "red"}`}>{c.decision === "invite" ? "Invite" : "Rejection"}</span>
              <Link href={`/candidates/${c.id}#email`} className="nm" style={{ flex: 1 }}>{c.full_name}</Link>
              <Link href={`/candidates/${c.id}#email`} className="btn tiny secondary">Review &amp; send →</Link>
            </div>
          ))}
        </section>
      </div>

      <div className="grid-2">
        {ROLES.map((role) => <TopList key={role} role={role} list={scored.filter((c) => c.applied_role === role)} />)}
      </div>

      <p className="footer-note">📦 Kargo Hiring scores and drafts. Every interview and every email is Arjun&apos;s call.</p>
    </>
  );
}

function TopList({ role, list }: { role: RoleCode; list: Candidate[] }) {
  const top = [...list].sort((a, b) => appliedScore(b) - appliedScore(a)).slice(0, 4);
  return (
    <section className="card">
      <div className="card-head">
        <h2>🏆 Top {ROLE_NAME[role]} applicants</h2>
        <span className="spacer" />
        <Link href={`/candidates?role=${role}`} className="small">See all {list.length} →</Link>
      </div>
      {top.length === 0 ? <p className="ink2 small">No {role} applicants yet.</p> : top.map((c, i) => (
        <Link href={`/candidates/${c.id}`} className="leader" key={c.id}>
          <span className="rank">{i + 1}</span>
          <ScoreRing score={appliedScore(c)} size={42} />
          <div style={{ flex: 1 }}>
            <div className="nm">{c.full_name}</div>
            <div className="small muted">{scoreLabel(appliedScore(c))} · {c.decision === "pending" ? "awaiting decision" : c.decision === "invite" ? "invited" : "passed"}</div>
          </div>
        </Link>
      ))}
    </section>
  );
}

function Spotlight({ c, next, threshold, testTo }: { c: Candidate; next: Candidate[]; threshold: number; testTo?: string }) {
  const first = firstNameOf(c.full_name);
  const body = (c.email_override ?? c.email_body ?? "").replaceAll("{{first_name}}", first);
  const kind = (c.email_kind ?? "invite") as "invite" | "reject";
  const decided = c.decision !== "pending";
  const mismatch = decided && c.email_kind !== c.decision;
  return (
    <section className="card tint-violet" id="next-up">
      <div className="card-head">
        <h2>⭐ Next up: review &amp; confirm</h2>
        <span className="sub">top-scoring candidate whose email hasn&apos;t gone out yet</span>
        <span className="spacer" />
        {next.length > 0 && <span className="small muted">Then: {next.map((n) => n.full_name).join(" · ")}</span>}
      </div>
      <div className="grid-2">
        <div style={{ background: "var(--card)", borderRadius: 14, padding: 18 }}>
          <div className="hstack" style={{ marginBottom: 12, gap: 14 }}>
            <ScoreRing score={appliedScore(c)} size={64} />
            <div style={{ flex: 1 }}>
              <Link href={`/candidates/${c.id}`} className="cand-name">{c.full_name}</Link>
              <div className="small muted">
                {c.applied_role === "PM" ? "Product Manager" : "Senior PM"} · {scoreLabel(appliedScore(c))} · line {threshold.toFixed(2)}
              </div>
              <div className="cand-chips">
                <span className="chip ghost">🤖 suggests {c.recommendation === "invite" ? "interview" : "pass"}</span>
                {decided && <span className={`chip ${c.decision === "invite" ? "green" : "red"}`}>Arjun: {c.decision === "invite" ? "Interview" : "Pass"}</span>}
              </div>
            </div>
          </div>
          <h3>📝 Interview brief</h3>
          <p className="small ink2" style={{ marginBottom: 0 }}>{c.brief ?? "No brief (only the top candidates per role get one)."}</p>
        </div>
        <div style={{ background: "var(--card)", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column" }}>
          <div className="hstack" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>✉️ Draft email</h3>
            <span className={`chip ${kind === "invite" ? "green" : "red"}`}>{kind === "invite" ? "Interview invite" : "Rejection"}</span>
          </div>
          <div className="mailbox" style={{ flex: 1 }}>
            <div className="hdr">To: <b>{c.email}</b>{testTo && <span className="muted"> · test mode: delivers to {testTo}</span>}<br />Subject: <b>{c.email_subject}</b></div>
            <pre className="small" style={{ maxHeight: 210, overflowY: "auto" }}>{body}</pre>
          </div>
          <div className="row" style={{ marginBottom: 0 }}>
            <ConfirmSendButton id={c.id} kind={kind} decisionPending={!decided} to={c.email} testTo={testTo} disabled={mismatch}
              afterSendHref={`/?sent=${c.id}`} />
            <Link href={`/candidates/${c.id}#email`} className="btn secondary small">✏️ Edit first</Link>
            {!decided && <Link href={`/candidates/${c.id}`} className="small">or {kind === "invite" ? "pass" : "invite"} instead →</Link>}
          </div>
          {mismatch && <p className="small err" style={{ marginBottom: 0 }}>Draft is being rewritten to match your decision. Refresh in a moment.</p>}
        </div>
      </div>
    </section>
  );
}
