import { sql, getRubric, getSettings, type Criterion, type RoleCode, type Settings } from "./db";

export type Metric = {
  criterion: Criterion;
  score: number;        // 1..4
  reason: string;
  pointsLost: number;   // weighted points lost vs a perfect 4 (out of 3.00 max loss)
};

export type Interview = {
  status: "to_schedule" | "scheduled" | "done" | "no_show";
  scheduled_at: string | null;
  mode: string;
  recording_url: string | null;
  recording_name: string | null;
  recording_is_blob: boolean;
  notes: string;
  rating: number | null;
  scorecard: Record<string, number>;
  outcome: "pending" | "next_round" | "hire" | "no_hire";
  followup_kind: string | null;
  followup_subject: string | null;
  followup_body: string | null;
  followup_sent_at: string | null;
  followup_error: string | null;
};

export type Candidate = {
  id: string;
  applied_role: RoleCode;
  file_name: string;
  status: "pending" | "processing" | "scored" | "error";
  error: string | null;
  brief: string | null;
  decision: "pending" | "invite" | "reject";
  email_kind: "invite" | "reject" | null;
  email_subject: string | null;
  email_body: string | null;
  email_override: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  created_at: string;
  cv_text: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  scores: Record<RoleCode, number | null>;
  metrics: Record<RoleCode, Metric[]>;
  recommendation: "invite" | "reject" | null;
  interview: Interview | null;
};

function toIso(v: unknown) {
  return v ? new Date(v as string).toISOString() : null;
}

export async function getCandidates(opts: { id?: string } = {}): Promise<{
  candidates: Candidate[];
  settings: Settings;
  criteria: Criterion[];
}> {
  const [criteria, settings, rows, scoreRows, roleRows, interviewRows] = await Promise.all([
    getRubric(),
    getSettings(),
    opts.id
      ? sql`select c.*, p.full_name, p.email, p.phone from candidates c join candidate_pii p on p.candidate_id = c.id where c.id = ${opts.id}`
      : sql`select c.*, p.full_name, p.email, p.phone from candidates c join candidate_pii p on p.candidate_id = c.id order by c.created_at`,
    opts.id
      ? sql`select * from criterion_scores where candidate_id = ${opts.id}`
      : sql`select * from criterion_scores`,
    opts.id
      ? sql`select * from role_scores where candidate_id = ${opts.id}`
      : sql`select * from role_scores`,
    opts.id
      ? sql`select * from interviews where candidate_id = ${opts.id}`
      : sql`select * from interviews`,
  ]);

  const candidates = rows.map((c) => {
    const mine = scoreRows.filter((s) => s.candidate_id === c.id);
    const metricsFor = (role: RoleCode): Metric[] =>
      criteria
        .filter((k) => k.role_code === role)
        .map((k) => {
          const s = mine.find((x) => x.criterion_id === k.id);
          const score = s ? Number(s.score) : 0;
          return { criterion: k, score, reason: s?.reason ?? "", pointsLost: s ? k.weight * (4 - score) : 0 };
        })
        .filter((m) => m.score > 0);
    const rs = (role: RoleCode) => {
      const r = roleRows.find((x) => x.candidate_id === c.id && x.role_code === role);
      return r ? Number(r.weighted_score) : null;
    };
    const scores = { PM: rs("PM"), SPM: rs("SPM") };
    const applied = scores[c.applied_role as RoleCode];
    const iv = interviewRows.find((x) => x.candidate_id === c.id);
    return {
      ...c,
      created_at: toIso(c.created_at)!,
      email_sent_at: toIso(c.email_sent_at),
      scores,
      metrics: { PM: metricsFor("PM"), SPM: metricsFor("SPM") },
      recommendation: applied == null ? null : applied >= settings.invite_threshold ? "invite" : "reject",
      interview: iv
        ? { ...iv, scheduled_at: toIso(iv.scheduled_at), followup_sent_at: toIso(iv.followup_sent_at) }
        : null,
    } as Candidate;
  });
  return { candidates, settings, criteria };
}

export const appliedScore = (c: Candidate) => c.scores[c.applied_role] ?? 0;
export const otherRole = (r: RoleCode): RoleCode => (r === "PM" ? "SPM" : "PM");
export const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || "there";
