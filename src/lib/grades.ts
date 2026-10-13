// Grade colour scale: 1.0 uses the palette's accent, 4.0 its warning colour,
// with a smooth oklch mix in between (via green and yellow, not grey); fails use the danger colour. Built from the
// palette's own tokens, so it fits every palette and dark mode.

export interface GradeTone {
  color: string;
  soft: string;
}

export function gradeTone(grade: string | number | null | undefined): GradeTone | null {
  const g = typeof grade === "number" ? grade : parseFloat(String(grade ?? "").replace(",", "."));
  if (!Number.isFinite(g) || g <= 0) return null;
  if (g > 4) return { color: "var(--danger)", soft: "var(--danger-soft)" };
  const t = Math.round(((Math.min(4, Math.max(1, g)) - 1) / 3) * 100);
  const color = t === 0 ? "var(--accent)" : t === 100 ? "var(--warn)" : `color-mix(in oklch, var(--warn) ${t}%, var(--accent))`;
  return { color, soft: `color-mix(in oklab, ${color} 14%, transparent)` };
}
