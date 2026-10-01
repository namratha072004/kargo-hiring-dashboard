// Presentation helpers for scores. Pure functions, safe on server and client.

// 1.00 (red) → 4.00 (green), through amber.
export function scoreHue(score: number) {
  const t = Math.min(1, Math.max(0, (score - 1) / 3));
  return Math.round(t * 135);
}
// Pastel: soft fill for rings / bars, very light wash for chips, deep shade for text on that wash.
export const scoreColor = (s: number) => `hsl(${scoreHue(s)} 52% 64%)`;
export const scoreBg = (s: number) => `hsl(${scoreHue(s)} 70% 94%)`;
export const scoreInk = (s: number) => `hsl(${scoreHue(s)} 45% 30%)`;

export function scoreLabel(s: number) {
  if (s >= 3.5) return "Excellent";
  if (s >= 3) return "Strong";
  if (s >= 2.5) return "Mixed";
  if (s >= 2) return "Weak";
  return "Very weak";
}

export const LEVELS = ["", "Absent", "Weak", "Present", "Strong"] as const;
