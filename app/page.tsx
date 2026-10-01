import Link from "next/link";
import { getCandidates, appliedScore, type Candidate } from "@/lib/queries";
import { ROLES } from "@/lib/db";
import { DecisionChip, ScoreRing } from "./ui";

export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const { candidates, settings } = await getCandidates();
  const scored = candidates.filter((c) => c.status === "scored");
  const good = scored.filter((c) => c.recommendation === "invite");
  const below = scored.filter((c) => c.recommendation === "reject");
  const pending = scored.filter((c) => c.decision === "pending");
  const invited = scored.filter((c) => c.decision === "invite");
  const rejected = scored.filter((c) => c.decision === "reject");
  const inviteSent = invited.filter((c) => c.email_sent_at);
  const rejectSent = rejected.filter((c) => c.email_sent_at);
  const interviewed = invited.filter((c) => c.interview?.status === "done");
  const hires = invited.filter((c) => c.interview?.outcome === "hire");
  const failed = candidates.filter((c) => c.status === "error");

  const tiles = [
    { emoji: "📄", n: candidates.length, lbl: "CVs uploaded", sub: `${scored.length} scored`, cls: "tint-sun", href: "/candidates" },
    { emoji: "🌟", n: good.length, lbl: "Good fits", sub: `at or above the ${settings.invite_threshold.toFixed(2)} line`, cls: "tint-teal", href: "/candidates?filter=good" },
    { emoji: "🔻", n: below.length, lbl: "Below the line", sub: "suggested pass", cls: "tint-pink", href: "/candidates?filter=below" },
    { emoji: "⏳", n: pending.length, lbl: "Awaiting your call", sub: "no decision yet", cls: "tint-tangerine", href: "/candidates?filter=pending" },
    { emoji: "📞", n: invited.length, lbl: "Interview calls", sub: `${inviteSent.length} invites sent`, cls: "tint-violet", href: "/interviews" },
    { emoji: "✋", n: rejected.length, lbl: "Rejected", sub: `${rejectSent.length} emails sent`, cls: "", href: "/candidates?filter=rejected" },
  ];

  const funnel = [
    { lbl: "Uploaded", n: candidates.length, c: "var(--sun)" },
    { lbl: "Good fit", n: good.length, c: "var(--teal)" },
    { lbl: "Invited", n: invited.length, c: "var(--violet)" },
    { lbl: "Interviewed", n: interviewed.length, c: "var(--pink)" },
    { lbl: "Hired", n: hires.length, c: "var(--green)" },
  ];
  const max = Math.max(1, candidates.length);

  const top = (role: string) =>
    scored.filter((c) => c.applied_role === role).sort((a, b) => appliedScore(b) - appliedScore(a)).slice(0, 4);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}, Arjun ☀️</h1>
          <p>
            {pending.length
              ? <><b>{pending.length}</b> candidate{pending.length === 1 ? " is" : "s are"} waiting for your decision.</>
              : candidates.length ? "You're all caught up. 🎉" : "Upload some CVs to get started."}
          </p>
        </div>
        <Link href="/upload" className="btn big">⬆️ Upload CVs</Link>
      </div>

      <div className="stats">
        {tiles.map((t) => (
          <Link key={t.lbl} href={t.href} className={`stat card ${t.cls}`} style={{ marginBottom: 0 }}>
            <div className="emoji">{t.emoji}</div>
            <div className="num">{t.n}</div>
            <div className="lbl">{t.lbl}</div>
            <div className="sub">{t.sub}</div>
          </Link>
        ))}
      </div>

      {failed.length > 0 && (
        <div className="banner red">⚠️ <span><b>{failed.length}</b> CV{failed.length === 1 ? "" : "s"} failed to score. <Link href="/candidates?filter=errors">Retry them →</Link></span></div>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>🚚 Hiring funnel</h2>
          <div className="funnel">
            {funnel.map((f) => (
              <div className="funnel-row" key={f.lbl}>
                <span>{f.lbl}</span>
                <div className="funnel-track"><div className="funnel-fill" style={{ width: `${(f.n / max) * 100}%`, background: f.c }} /></div>
                <span className="num display" style={{ fontWeight: 800 }}>{f.n}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card tint-sun">
          <h2>⏳ Waiting for your call</h2>
          {pending.length === 0 ? <p className="ink2">Nothing waiting. Nice.</p> : (
            <div>
              {pending.sort((a, b) => appliedScore(b) - appliedScore(a)).slice(0, 6).map((c) => <Leader key={c.id} c={c} />)}
              {pending.length > 6 && <Link href="/candidates?filter=pending" className="small">+ {pending.length - 6} more →</Link>}
            </div>
          )}
        </section>
      </div>

      <div className="grid-2">
        {ROLES.map((role) => (
          <section className="card" key={role}>
            <div className="hstack" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>🏆 Top {role === "PM" ? "Product Manager" : "Senior PM"} applicants</h2>
              <span className="spacer" />
              <Link href={`/candidates?role=${role}`} className="small">See all →</Link>
            </div>
            {top(role).length === 0 ? <p className="ink2">No {role} applicants yet.</p> : top(role).map((c) => <Leader key={c.id} c={c} />)}
          </section>
        ))}
      </div>

      <p className="footer-note">📦 Kargo Hiring scores and drafts. Every interview and every email is Arjun&apos;s call.</p>
    </>
  );
}

function Leader({ c }: { c: Candidate }) {
  return (
    <Link href={`/candidates/${c.id}`} className="leader">
      <ScoreRing score={appliedScore(c)} size={46} />
      <div style={{ flex: 1 }}>
        <div className="nm">{c.full_name}</div>
        <div className="small ink2">{c.applied_role} · {c.recommendation === "invite" ? "🤖 suggests interview" : "🤖 suggests pass"}</div>
      </div>
      <DecisionChip c={c} />
      <span className="hide-sm"><EmailChipStatic c={c} /></span>
    </Link>
  );
}

// Same as EmailChip but without a nested link (the whole row is already a link).
function EmailChipStatic({ c }: { c: Candidate }) {
  if (c.email_sent_at) return <span className="chip teal">📨 sent</span>;
  return null;
}
