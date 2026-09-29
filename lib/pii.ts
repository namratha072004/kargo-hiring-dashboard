// Deterministic PII handling. No AI is involved here, so personal details never
// leave the server before they are stripped.

export type Pii = { full_name: string; email: string; phone: string };

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Runs of digits with common separators; filtered to 9-15 digits below so years/dates don't match.
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
// Profile URLs usually contain the person's name.
const PROFILE_URL_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|twitter\.com|x\.com|behance\.net|dribbble\.com|medium\.com)\/[^\s)]+/gi;

const HEADING_WORDS = /\b(resume|résumé|curriculum|vitae|cv|profile|summary|contact|experience|education|skills|product|manager|senior)\b/i;

function phoneMatches(text: string): string[] {
  return (text.match(PHONE_RE) ?? []).filter((m) => {
    const digits = m.replace(/\D/g, "").length;
    return digits >= 9 && digits <= 15 && !/^\d{4}\s*[-–]\s*\d{4}$/.test(m.trim());
  });
}

// Best guess only: the founder confirms/edits these before anything is processed.
export function extractPii(text: string): Pii {
  const email = text.match(EMAIL_RE)?.[0] ?? "";
  const phone = phoneMatches(text)[0]?.trim() ?? "";
  let full_name = "";
  for (const raw of text.split("\n").slice(0, 8)) {
    const line = raw.replace(EMAIL_RE, "").replace(PHONE_RE, "").replace(/[|•·,]/g, " ").trim();
    const words = line.split(/\s+/).filter(Boolean);
    if (
      words.length >= 2 && words.length <= 4 &&
      words.every((w) => /^[\p{L}][\p{L}'.-]*$/u.test(w)) &&
      !HEADING_WORDS.test(line)
    ) {
      full_name = words.map((w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(" ");
      break;
    }
  }
  return { full_name, email, phone };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(text: string, pii: Pii): string {
  let out = text.replace(EMAIL_RE, "[EMAIL]").replace(PROFILE_URL_RE, "[PROFILE URL]");
  for (const m of phoneMatches(out)) out = out.split(m).join("[PHONE]");
  if (pii.phone) out = out.split(pii.phone).join("[PHONE]");
  if (pii.email) out = out.split(pii.email).join("[EMAIL]");

  const name = pii.full_name.trim();
  if (name) {
    out = out.replace(new RegExp(escapeRe(name).replace(/\s+/g, "\\s+"), "gi"), "[CANDIDATE]");
    // Each part of the name on its own (e.g. "Priya" in "Priya led the migration").
    for (const part of name.split(/\s+/).filter((p) => p.replace(/\./g, "").length >= 2)) {
      out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(part)}(?![\\p{L}])`, "giu"), "[CANDIDATE]");
    }
    out = out.replace(/\[CANDIDATE\](\s+\[CANDIDATE\])+/g, "[CANDIDATE]");
  }
  return out;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}
