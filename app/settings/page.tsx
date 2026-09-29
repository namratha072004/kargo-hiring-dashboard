import { getRubric, getSettings, ROLES } from "@/lib/db";
import { SettingsForm } from "../components";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [s, criteria] = await Promise.all([getSettings(), getRubric()]);
  return (
    <>
      <h1>Settings</h1>
      <SettingsForm initial={{
        invite_threshold: s.invite_threshold, top_n: s.top_n, company_name: s.company_name,
        sender_name: s.sender_name, invite_next_step: s.invite_next_step,
      }} />
      <section className="card">
        <h2>Rubric in use</h2>
        {ROLES.map((role) => (
          <div key={role}>
            <h3>{role}</h3>
            <table>
              <thead><tr><th>Criterion</th><th className="num">Weight</th><th>4 — Strong looks like</th></tr></thead>
              <tbody>
                {criteria.filter((c) => c.role_code === role).map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td className="num">{Math.round(c.weight * 100)}%</td><td className="muted">{c.level_4}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </>
  );
}
