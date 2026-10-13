// Per-device display preferences that only the new UI knows about. Stored
// apart from the tracker state so the classic UI's saved format is unchanged.

export type Density = "comfortable" | "compact";
export const DENSITY_KEY = "ects-tracker-density";
export const PAST_COLLAPSED_KEY = "ects-tracker-past-collapsed";
export const CELEBRATED_KEY = "ects-tracker-celebrated";

export function loadDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function applyDensity(d: Density): void {
  document.documentElement.setAttribute("data-density", d);
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
