"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [msg, setMsg] = useState("");

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setMsg("Reading files…");
    const files = Array.from(list);
    const fd = new FormData();
    fd.set("action", "extract");
    files.forEach((f) => fd.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    setRows(json.files.map((r: Partial<Row>, i: number) => ({ full_name: "", email: "", phone: "", ...r, file: files[i] }) as Row));
    setMsg("Check the personal details below. They are stored separately and never sent to the AI.");
    setBusy(false);
  }

  async function processAll() {
    setBusy(true);
    const todo = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.error && r.state !== "done");
    let done = 0;
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
      setMsg(`Processed ${++done} of ${todo.length}`);
    });
    setMsg("Writing interview briefs for the top candidates…");
    try {
      await post("/api/process", { reconcile: true });
      setMsg("Done.");
    } catch (e) {
      setMsg(`Briefs failed: ${(e as Error).message}`);
    }
    setBusy(false);
    router.refresh();
  }

  const ready = rows.filter((r) => !r.error && r.state !== "done");
  const missingName = ready.some((r) => !r.full_name.trim());

  return (
    <section className="card">
      <h2>Add CVs</h2>
      <div className="row">
        <label>
          Applied for
          <select value={role} onChange={(e) => setRole(e.target.value as "PM" | "SPM")} disabled={busy}>
            <option value="PM">Product Manager</option>
            <option value="SPM">Senior Product Manager</option>
          </select>
        </label>
        <label>
          CV files (PDF, DOCX, TXT)
          <input type="file" multiple accept=".pdf,.docx,.txt,.md" disabled={busy}
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {rows.length > 0 && (
        <>
          <table>
            <thead><tr><th>File</th><th>Full name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="muted">{r.file_name}</td>
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
                      <td className={r.state?.startsWith("failed") ? "err" : "muted"}>{r.state ?? "ready"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button onClick={processAll} disabled={busy || !ready.length || missingName}>
              Process {ready.length} CV{ready.length === 1 ? "" : "s"} as {role}
            </button>
            <button className="secondary" onClick={() => { setRows([]); setMsg(""); }} disabled={busy}>Clear</button>
          </div>
        </>
      )}
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}

export function EmailEditor(props: {
  id: string;
  to: string | null;
  firstName: string;
  subject: string;
  body: string;
  sentAt: string | null;
  lastError: string | null;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(props.subject);
  const [body, setBody] = useState(props.body);
  const [state, setState] = useState(props.lastError ? `Last send failed: ${props.lastError}` : "");
  const [busy, setBusy] = useState(false);
  const dirty = subject !== props.subject || body !== props.body;

  if (props.sentAt) {
    return (
      <div>
        <p className="ok">Sent to {props.to} on {new Date(props.sentAt).toLocaleString()}</p>
        <p><strong>{props.subject}</strong></p>
        <pre>{props.body}</pre>
      </div>
    );
  }

  async function save() {
    await post("/api/candidate", { action: "save_email", id: props.id, subject, body: body.replaceAll(props.firstName, "{{first_name}}") });
  }

  async function send() {
    if (!props.to) return;
    if (!confirm(`Send this email to ${props.to}?`)) return;
    setBusy(true);
    try {
      if (dirty) await save();
      setState("Sending…");
      await post("/api/send", { id: props.id });
      setState("Sent.");
      router.refresh();
    } catch (e) {
      setState(`Failed: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <div>
      <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label>Body<textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <div className="row">
        <button onClick={send} disabled={busy || !props.to}>
          {props.to ? `Send to ${props.to}` : "No email address on file"}
        </button>
        {dirty && (
          <button className="secondary" disabled={busy}
            onClick={async () => { await save(); setState("Draft saved."); router.refresh(); }}>
            Save draft
          </button>
        )}
      </div>
      {state && <p className={state.startsWith("Failed") || state.startsWith("Last") ? "err" : "muted"}>{state}</p>}
    </div>
  );
}

export function ActionButton(props: { label: string; url: string; body: unknown; confirm?: string; redirect?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button className={props.className ?? "secondary"} disabled={busy} onClick={async () => {
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
      }}>{busy ? "Working…" : props.label}</button>
      {err && <span className="err"> {err}</span>}
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
      {field("invite_threshold", "Invite line: applied-role score ≥ (1.00–4.00)", "number")}
      {field("top_n", "Interview briefs for the top N per role", "number")}
      {field("company_name", "Company name")}
      {field("sender_name", "Sign emails as")}
      <label>Invite next step<textarea rows={3} value={s.invite_next_step}
        onChange={(e) => setS({ ...s, invite_next_step: e.target.value })} /></label>
      <button onClick={async () => {
        setMsg("Saving and updating briefs / drafts…");
        try {
          await post("/api/settings", s);
          await post("/api/process", { reconcile: true });
          setMsg("Saved. Briefs and unsent drafts updated to match.");
          router.refresh();
        } catch (e) {
          setMsg(`Failed: ${(e as Error).message}`);
        }
      }}>Save</button>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
