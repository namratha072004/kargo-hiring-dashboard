import { getRubric, getSettings, ROLES } from "@/lib/db";
import { LEVELS } from "@/lib/score";
import { SettingsForm } from "../components";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [s, criteria] = await Promise.all([getSettings(), getRubric()]);
  return (
    <>
      <div className="page-head"><div><h1>⚙️ Settings</h1><p>Tune where the line sits and how emails read.</p></div></div>
      <SettingsForm initial={{
        invite_threshold: s.invite_threshold, top_n: s.top_n, company_name: s.company_name,
        sender_name: s.sender_name, invite_next_step: s.invite_next_step,
      }} />
      <div className="grid-2">
        {ROLES.map((role) => (
          <section className="card" key={role}>
            <h2>📏 {role === "PM" ? "Product Manager" : "Senior PM"} rubric</h2>
            {criteria.filter((c) => c.role_code === role).map((c) => (
              <details key={c.id} style={{ borderBottom: "1px solid var(--soft-line)", padding: "10px 0" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                  {c.name} <span className="chip sun" style={{ marginLeft: 6 }}>{Math.round(c.weight * 100)}%</span>
                </summary>
                <ol className="small ink2" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                  {[c.level_1, c.level_2, c.level_3, c.level_4].map((l, i) => <li key={i}><b>{LEVELS[i + 1]}:</b> {l}</li>)}
                </ol>
              </details>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
