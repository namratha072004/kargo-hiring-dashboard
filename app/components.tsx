"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

// Run jobs with limited parallelism.
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

// ---------------------------------------------------------------- nav

const LINKS = [
  { href: "/", label: "📊 Dashboard" },
  { href: "/candidates", label: "👥 Candidates" },
  { href: "/interviews", label: "🎙️ Interviews" },
  { href: "/upload", label: "⬆️ Upload CVs" },
  { href: "/settings", label: "⚙️ Settings" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="topbar">
      <Link href="/" className="brand"><span className="brand-mark">📦</span>Kargo Hiring</Link>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}
            className={(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "on" : ""}>{l.label}</Link>
        ))}
      </nav>
      <div className="who">The app evaluates. <b>Arjun decides.</b></div>
    </header>
  );
}

// ---------------------------------------------------------------- upload

type Row = {
  file: File;
  file_name: string;
  full_name: string;
  email: string;
  phone: string;
  error?: string;
  state?: string;
};

export function Uploader() {
  const router = useRouter();
  const [role, setRole] = useState<"PM" | "SPM">("PM");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState("");
  const [finished, setFinished] = useState(false);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function onFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy(true);
    setFinished(false);
    setMsg("Reading files…");
    const fd = new FormData();
    fd.set("action", "extract");
    files.forEach((f) => fd.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    setRows(json.files.map((r: Partial<Row>, i: number) => ({ full_name: "", email: "", phone: "", ...r, file: files[i] }) as Row));
    setMsg("");
    setBusy(false);
  }

  async function processAll() {
    setBusy(true);
    const todo = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.error && r.state !== "done");
    let done = 0;
    setMsg(`Scoring 0 of ${todo.length}… (about 40 seconds each, 3 at a time)`);
    await pool(todo, 3, async ({ r, i }) => {
      try {
        update(i, { state: "saving…" });
        const fd = new FormData();
        fd.set("action", "save");
        fd.set("file", r.file);
        fd.set("role", role);
        fd.set("full_name", r.full_name);
        fd.set("email", r.email);
        fd.set("phone", r.phone);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        update(i, { state: "scoring & drafting…" });
        await post("/api/process", { id: json.id });
        update(i, { state: "done" });
      } catch (e) {
        update(i, { state: `failed: ${(e as Error).message}` });
      }
      setMsg(`Scoring ${++done} of ${todo.length}…`);
    });
    setMsg("Writing interview briefs for the top candidates…");
    try {
      await post("/api/process", { reconcile: true });
      setMsg("All done! 🎉");
      setFinished(true);
    } catch (e) {
      setMsg(`Briefs failed: ${(e as Error).message}`);
    }
    setBusy(false);
    router.refresh();
  }

  const ready = rows.filter((r) => !r.error && r.state !== "done");
  const missingName = ready.some((r) => !r.full_name.trim());

  return (
    <>
      <section className="card">
        <div className="row" style={{ marginTop: 0 }}>
          <label style={{ maxWidth: 320 }}>
            Which role did they apply for?
            <select value={role} onChange={(e) => setRole(e.target.value as "PM" | "SPM")} disabled={busy}>
              <option value="PM">Product Manager</option>
              <option value="SPM">Senior Product Manager</option>
            </select>
          </label>
          <p className="small ink2" style={{ flex: 2, margin: 0 }}>
            Every CV is scored against <b>both</b> the PM and SPM rubric either way. Upload one role&apos;s CVs per batch.
          </p>
        </div>
        <label
          className={`dropzone ${over ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) onFiles(e.dataTransfer.files); }}
        >
          <span className="big-emoji">📄</span>
          <span className="display" style={{ fontSize: 18, fontWeight: 800 }}>Drop CVs here, or click to choose</span>
          <span className="small ink2">PDF, DOCX or TXT · as many as you like</span>
          <input type="file" multiple accept=".pdf,.docx,.txt,.md" disabled={busy}
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
      </section>

      {rows.length > 0 && (
        <section className="card tint-sun">
          <h2>🔒 Check the personal details</h2>
          <p className="small ink2">
            Name, email and phone are stored separately and <b>never sent to the AI</b>. They&apos;re stripped from the CV before scoring, so fix any that look wrong.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ background: "var(--card)", borderRadius: 12 }}>
              <thead><tr><th>File</th><th>Full name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="small">{r.file_name}</td>
                    {r.error ? (
                      <td colSpan={4} className="err">{r.error}</td>
                    ) : (
                      <>
                        <td><input value={r.full_name} disabled={busy || r.state === "done"} placeholder="required"
                          onChange={(e) => update(i, { full_name: e.target.value })} /></td>
                        <td><input value={r.email} disabled={busy || r.state === "done"}
                          onChange={(e) => update(i, { email: e.target.value })} /></td>
                        <td><input value={r.phone} disabled={busy || r.state === "done"}
                          onChange={(e) => update(i, { phone: e.target.value })} /></td>
                        <td className="small" style={{ whiteSpace: "nowrap" }}>
                          {r.state === "done" ? <span className="ok">✅ done</span>
                            : r.state?.startsWith("failed") ? <span className="err">{r.state}</span>
                            : r.state ? <span><span className="spin">⏳</span> {r.state}</span>
                            : "ready"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="big" onClick={processAll} disabled={busy || !ready.length || missingName}>
              ✨ Score {ready.length} CV{ready.length === 1 ? "" : "s"} as {role}
            </button>
            <button className="secondary" onClick={() => { setRows([]); setMsg(""); setFinished(false); }} disabled={busy}>Clear</button>
            {finished && <Link className="btn green" href={`/candidates?role=${role}`}>See the ranking →</Link>}
          </div>
          {msg && <p className="small"><b>{msg}</b></p>}
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- decision

export function DecisionPanel(props: {
  id: string;
  decision: "pending" | "invite" | "reject";
  recommendation: "invite" | "reject" | null;
  score: number | null;
  threshold: number;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function decide(d: "pending" | "invite" | "reject") {
    setBusy(d);
    setErr("");
    try {
      await post("/api/decision", { id: props.id, decision: d });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <div>
      {props.recommendation && (
        <div className="suggest">
          <span className="bot">🤖</span>
          <span>
            The rubric score is <b>{props.score?.toFixed(2)}</b> against an invite line of <b>{props.threshold.toFixed(2)}</b>, so the app{" "}
            <b>suggests {props.recommendation === "invite" ? "an interview" : "passing"}</b>. That&apos;s only a suggestion. The call is yours.
          </span>
        </div>
      )}
      {props.locked ? (
        <p className="small"><b>Decision locked:</b> the email already went out.</p>
      ) : (
        <div className="decide">
          <button className={`big green ${props.decision === "invite" ? "selected" : ""}`} disabled={!!busy} onClick={() => decide("invite")}>
            {busy === "invite" ? <span className="spin">⏳</span> : "✅"} Invite to interview
          </button>
          <button className={`big red ${props.decision === "reject" ? "selected" : ""}`} disabled={!!busy} onClick={() => decide("reject")}>
            {busy === "reject" ? <span className="spin">⏳</span> : "✋"} Pass on them
          </button>
          {props.decision !== "pending" && (
            <button className="secondary small" disabled={!!busy} onClick={() => decide("pending")}>Undo</button>
          )}
        </div>
      )}
      {busy && busy !== "pending" && <p className="small ink2" style={{ marginTop: 10 }}>Saving, and rewriting the email to match if needed (about 10 seconds)…</p>}
      {err && <p className="err small" style={{ marginTop: 10 }}>{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- email

export function EmailEditor(props: {
  id: string;
  which?: "initial" | "followup";
  to: string | null;
  firstName: string;
  testTo?: string;
  subject: string;
  body: string;
  sentAt: string | null;
  lastError: string | null;
  canSend: boolean;
  blockedReason?: string;
}) {
  const router = useRouter();
  const which = props.which ?? "initial";
  const [subject, setSubject] = useState(props.subject);
  const [body, setBody] = useState(props.body);
  const [state, setState] = useState(props.lastError ? `Last send failed: ${props.lastError}` : "");
  const [busy, setBusy] = useState(false);
  const [sentTest, setSentTest] = useState(false);
  const dirty = subject !== props.subject || body !== props.body;

  if (props.sentAt) {
    return (
      <div>
        <div className="banner green">📨 <span>Sent to <b>{props.to}</b> on {new Date(props.sentAt).toLocaleString("en-IN")}</span></div>
        <div className="mailbox"><div className="hdr"><b>{props.subject}</b></div><pre>{props.body}</pre></div>
      </div>
    );
  }

  async function save() {
    const tpl = body.replaceAll(props.firstName, "{{first_name}}");
    if (which === "followup") await post("/api/interview", { action: "save_followup", id: props.id, subject, body: tpl });
    else await post("/api/candidate", { action: "save_email", id: props.id, subject, body: tpl });
  }

  async function send() {
    if (!props.to || !props.canSend) return;
    const msg = props.testTo
      ? `TEST MODE: this will go to ${props.testTo} (not ${props.to}). Send it?`
      : `Send this email to ${props.to} now?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      if (dirty) await save();
      setState("Sending…");
      const r = await post("/api/send", { id: props.id, which });
      if (r.test) { setSentTest(true); setState(""); } else setState("Sent! 🎉");
      router.refresh();
    } catch (e) {
      setState(`Failed: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <div>
      {props.testTo && (
        <div className="banner violet">🧪 <span><b>Test mode is on.</b> Emails go to <b>{props.testTo}</b> instead of the candidate, until a sending domain is verified in Resend.</span></div>
      )}
      <div className="mailbox">
        <div className="hdr">To: <b>{props.to ?? "no email on file"}</b></div>
        <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label style={{ marginBottom: 0 }}>Message<textarea rows={13} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      </div>
      <div className="row">
        <button className="big" onClick={send} disabled={busy || !props.to || !props.canSend}>
          {busy ? <span className="spin">⏳</span> : "🚀"} {props.testTo ? "Send test email" : "Send email"}
        </button>
        {dirty && (
          <button className="secondary" disabled={busy}
            onClick={async () => { await save(); setState("Draft saved ✔"); router.refresh(); }}>
            💾 Save edits
          </button>
        )}
      </div>
      {!props.canSend && props.blockedReason && <p className="small ink2">🔒 {props.blockedReason}</p>}
      {sentTest && <div className="banner green">✅ <span>Test email sent to <b>{props.testTo}</b>. Check that inbox (and spam). It isn&apos;t marked as sent, so you can send it again for real later.</span></div>}
      {state && <p className={state.startsWith("Failed") || state.startsWith("Last") ? "err small" : "ok small"}>{state}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- interview

type IV = {
  status: string;
  scheduled_at: string | null;
  mode: string;
  notes: string;
  rating: number | null;
  scorecard: Record<string, number>;
  outcome: string;
  recording_url: string | null;
  recording_name: string | null;
  recording_is_blob: boolean;
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InterviewEditor(props: {
  id: string;
  iv: IV;
  criteria: { id: string; name: string; cvScore: number }[];
  blobEnabled: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({ ...props.iv, scheduled_at: toLocalInput(props.iv.scheduled_at) });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(props.iv.recording_is_blob ? "" : props.iv.recording_url ?? "");
  const [upPct, setUpPct] = useState<number | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  async function save(extra: Partial<typeof f> = {}) {
    const next = { ...f, ...extra };
    setF(next);
    setBusy(true);
    try {
      await post("/api/interview", {
        action: "save", id: props.id,
        fields: { ...next, scheduled_at: next.scheduled_at ? new Date(next.scheduled_at).toISOString() : null },
      });
      setMsg("Saved ✔");
      router.refresh();
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  async function saveLink() {
    await post("/api/interview", { action: "recording", id: props.id, url: link.trim(), name: link.trim() ? "Recording link" : null, isBlob: false });
    setMsg("Recording link saved ✔");
    router.refresh();
  }

  async function uploadFile(file: File) {
    setUpPct(0);
    try {
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`interviews/${props.id}/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/recording/upload",
        multipart: file.size > 50 * 1024 * 1024,
        onUploadProgress: (p) => setUpPct(Math.round(p.percentage)),
      });
      await post("/api/interview", { action: "recording", id: props.id, url: blob.url, name: file.name, isBlob: true });
      setMsg("Recording uploaded ✔");
      router.refresh();
    } catch (e) {
      setMsg(`Upload failed: ${(e as Error).message}`);
    }
    setUpPct(null);
  }

  return (
    <div>
      <div className="row" style={{ marginTop: 0 }}>
        <label>📅 When
          <input type="datetime-local" value={f.scheduled_at} onChange={(e) => set({ scheduled_at: e.target.value })} />
        </label>
        <label>📍 Where
          <select value={f.mode} onChange={(e) => set({ mode: e.target.value })}>
            <option>In person, Mumbai office</option>
            <option>Video call</option>
            <option>Phone call</option>
          </select>
        </label>
        <label>Status
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="to_schedule">To schedule</option>
            <option value="scheduled">Scheduled</option>
            <option value="done">Interview done</option>
            <option value="no_show">No-show</option>
          </select>
        </label>
      </div>

      <h3 style={{ marginTop: 6 }}>🎙️ Recording</h3>
      {props.iv.recording_url ? (
        <div className="mailbox" style={{ marginBottom: 10 }}>
          {props.iv.recording_is_blob ? (
            /\.(mp3|m4a|wav|ogg|aac)$/i.test(props.iv.recording_name ?? "")
              ? <audio controls src={`/api/recording/${props.id}`} style={{ width: "100%" }} />
              : <video controls src={`/api/recording/${props.id}`} style={{ width: "100%", borderRadius: 12 }} />
          ) : (
            <a className="btn small secondary" href={props.iv.recording_url} target="_blank" rel="noreferrer">▶️ Open recording</a>
          )}
          <p className="small muted" style={{ marginTop: 6, marginBottom: 0 }}>{props.iv.recording_name}</p>
        </div>
      ) : <p className="small muted">No recording yet.</p>}
      <div className="row">
        <label>Paste a link (Google Drive, Zoom, Loom…)
          <input value={link} placeholder="https://…" onChange={(e) => setLink(e.target.value)} />
        </label>
        <button className="secondary small" onClick={saveLink}>Save link</button>
      </div>
      {props.blobEnabled ? (
        <label className="dropzone" style={{ padding: 16 }}>
          <span>{upPct != null ? `⬆️ Uploading… ${upPct}%` : "⬆️ Or upload the audio / video file (stored privately)"}</span>
          <input type="file" accept="audio/*,video/*" disabled={upPct != null}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadFile(file); e.target.value = ""; }} />
        </label>
      ) : (
        <p className="small muted">File uploads switch on once Vercel Blob storage is connected. Links work now.</p>
      )}

      <h3 style={{ marginTop: 18 }}>📝 Arjun&apos;s notes</h3>
      <textarea rows={6} value={f.notes} placeholder="What did you learn? What did they say about the vendor migration?"
        onChange={(e) => set({ notes: e.target.value })} />
      <p className="small muted" style={{ marginTop: 6 }}>Used to draft the follow-up email. The candidate&apos;s name, email and phone are stripped before the AI sees them.</p>

      <h3 style={{ marginTop: 18 }}>🧮 Post-interview scorecard</h3>
      <p className="small ink2">Did the interview back up what the CV claimed? Score each criterion 1–4 yourself.</p>
      {props.criteria.map((k) => (
        <div className="sc-row" key={k.id}>
          <span><b>{k.name}</b></span>
          <span className="small muted">CV: {k.cvScore}/4</span>
          <span className="sc-pick">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" className={f.scorecard[k.id] === n ? "selected" : ""}
                style={f.scorecard[k.id] === n ? { background: `hsl(${((n - 1) / 3) * 135} 55% 78%)` } : undefined}
                onClick={() => set({ scorecard: { ...f.scorecard, [k.id]: n } })}>{n}</button>
            ))}
          </span>
        </div>
      ))}

      <div className="row" style={{ marginTop: 16 }}>
        <div>
          <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>Overall gut feel</div>
          <span className="stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => set({ rating: n })} aria-label={`${n} stars`}>
                {(f.rating ?? 0) >= n ? "⭐" : "☆"}
              </button>
            ))}
          </span>
        </div>
      </div>

      <h3 style={{ marginTop: 10 }}>🏁 Outcome</h3>
      <div className="decide">
        <button className={`violet ${f.outcome === "next_round" ? "selected" : ""}`} onClick={() => set({ outcome: "next_round" })}>🔁 Next round</button>
        <button className={`green ${f.outcome === "hire" ? "selected" : ""}`} onClick={() => set({ outcome: "hire" })}>🎉 Hire</button>
        <button className={`red ${f.outcome === "no_hire" ? "selected" : ""}`} onClick={() => set({ outcome: "no_hire" })}>🙅 No hire</button>
        {f.outcome !== "pending" && <button className="secondary small" onClick={() => set({ outcome: "pending" })}>Not decided</button>}
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <button className="big" disabled={busy} onClick={() => save()}>{busy ? <span className="spin">⏳</span> : "💾"} Save interview</button>
        {msg && <span className={msg.startsWith("Failed") || msg.startsWith("Upload failed") ? "err small" : "ok small"}>{msg}</span>}
      </div>
    </div>
  );
}

export function DraftFollowupButton({ id, has }: { id: string; has: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button className="violet" disabled={busy} onClick={async () => {
        setBusy(true); setErr("");
        try { await post("/api/interview", { action: "draft_followup", id }); router.refresh(); }
        catch (e) { setErr((e as Error).message); }
        setBusy(false);
      }}>{busy ? <><span className="spin">⏳</span> Writing…</> : has ? "🔄 Re-draft from notes" : "✍️ Draft follow-up from my notes"}</button>
      {err && <span className="err small"> {err}</span>}
    </>
  );
}

// ---------------------------------------------------------------- misc

export function ActionButton(props: { label: string; url: string; body: unknown; confirm?: string; redirect?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button className={props.className ?? "secondary small"} disabled={busy} onClick={async () => {
        if (props.confirm && !confirm(props.confirm)) return;
        setBusy(true);
        setErr("");
        try {
          await post(props.url, props.body);
          if (props.redirect) router.push(props.redirect);
          router.refresh();
        } catch (e) {
          setErr((e as Error).message);
        }
        setBusy(false);
      }}>{busy ? <><span className="spin">⏳</span> Working…</> : props.label}</button>
      {err && <span className="err small"> {err}</span>}
    </>
  );
}

export function SettingsForm({ initial }: { initial: Record<string, string | number> }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState("");
  const field = (k: string, label: string, type = "text") => (
    <label>{label}<input type={type} step="0.05" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></label>
  );
  return (
    <section className="card">
      <div className="grid-2">
        {field("invite_threshold", "🎯 Invite line: suggest an interview at a score of at least (1.00–4.00)", "number")}
        {field("top_n", "📝 Write interview briefs for the top N per role", "number")}
        {field("company_name", "🏢 Company name")}
        {field("sender_name", "✍️ Sign emails as")}
      </div>
      <label>📬 Next step written into invites<textarea rows={3} value={s.invite_next_step}
        onChange={(e) => setS({ ...s, invite_next_step: e.target.value })} /></label>
      <button onClick={async () => {
        setMsg("Saving and updating briefs / drafts…");
        try {
          await post("/api/settings", s);
          await post("/api/process", { reconcile: true });
          setMsg("Saved ✔ Briefs and undecided drafts updated to match.");
          router.refresh();
        } catch (e) {
          setMsg(`Failed: ${(e as Error).message}`);
        }
      }}>💾 Save settings</button>
      {msg && <p className="small" style={{ marginTop: 10 }}><b>{msg}</b></p>}
    </section>
  );
}

// Compact Invite / Pass buttons for lists (dashboard). Same rules as DecisionPanel.
export function QuickDecide({ id, suggestion }: { id: string; suggestion: "invite" | "reject" | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function decide(d: "invite" | "reject") {
    setBusy(d); setErr("");
    try { await post("/api/decision", { id, decision: d }); router.refresh(); }
    catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  return (
    <span className="hstack" style={{ gap: 6 }}>
      <button className={`tiny green ${suggestion === "invite" ? "selected" : ""}`} disabled={!!busy} onClick={() => decide("invite")}
        title={suggestion === "invite" ? "Suggested by the rubric" : undefined}>
        {busy === "invite" ? <span className="spin">⏳</span> : "✅"} Invite
      </button>
      <button className={`tiny red ${suggestion === "reject" ? "selected" : ""}`} disabled={!!busy} onClick={() => decide("reject")}
        title={suggestion === "reject" ? "Suggested by the rubric" : undefined}>
        {busy === "reject" ? <span className="spin">⏳</span> : "✋"} Pass
      </button>
      {err && <span className="err small">{err}</span>}
    </span>
  );
}
