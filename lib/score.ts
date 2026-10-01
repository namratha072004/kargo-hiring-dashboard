// Presentation helpers for scores. Pure functions, safe on server and client.

// 1.00 (red) → 4.00 (green), through amber.
export function scoreHue(score: number) {
  const t = Math.min(1, Math.max(0, (score - 1) / 3));
  return Math.round(t * 135);
}
export const scoreColor = (s: number) => `hsl(${scoreHue(s)} 78% 46%)`;
export const scoreBg = (s: number) => `hsl(${scoreHue(s)} 85% 93%)`;

export function scoreLabel(s: number) {
  if (s >= 3.5) return "Excellent";
  if (s >= 3) return "Strong";
  if (s >= 2.5) return "Mixed";
  if (s >= 2) return "Weak";
  return "Very weak";
}

export const LEVELS = ["", "Absent", "Weak", "Present", "Strong"] as const;
