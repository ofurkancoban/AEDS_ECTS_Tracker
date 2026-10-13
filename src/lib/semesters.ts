const FIRST_YEAR = 2020;

function yy(year: number): string {
  return String(year).slice(-2);
}

/** Every semester label from WiSe20/21 up to six years from now, in order. */
export function allSemesters(): string[] {
  const last = new Date().getFullYear() + 6;
  const out: string[] = [];
  for (let y = FIRST_YEAR; y <= last; y++) {
    out.push(`WiSe${yy(y)}/${yy(y + 1)}`);
    out.push(`SoSe${yy(y + 1)}`);
  }
  return out;
}

/** The semester running today (SoSe = Apr-Sep, WiSe = Oct-Mar). */
export function currentSemester(today = new Date()): string {
  const m = today.getMonth() + 1;
  const y = today.getFullYear();
  if (m >= 4 && m <= 9) return `SoSe${yy(y)}`;
  if (m >= 10) return `WiSe${yy(y)}/${yy(y + 1)}`;
  return `WiSe${yy(y - 1)}/${yy(y)}`;
}

/**
 * The semester students are planning for: switches to the upcoming term about
 * a month before the current one ends (Feb/Mar -> SoSe, Aug/Sep -> WiSe).
 */
export function planningSemester(today = new Date()): string {
  const m = today.getMonth() + 1;
  const y = today.getFullYear();
  if (m === 8 || m === 9) return `WiSe${yy(y)}/${yy(y + 1)}`;
  if (m === 2 || m === 3) return `SoSe${yy(y)}`;
  return currentSemester(today);
}

export function semesterIndex(label: string): number {
  return allSemesters().indexOf(label);
}

export function sortBySemester<T extends { semester: string }>(items: T[]): T[] {
  const order = allSemesters();
  const pos = (s: string) => (s === "Unscheduled" ? order.length : order.indexOf(s));
  return items.slice().sort((a, b) => pos(a.semester) - pos(b.semester));
}

export function compareSemesters(a: string, b: string): number {
  const order = allSemesters();
  const pa = a === "Unscheduled" ? order.length + 1 : order.indexOf(a) === -1 ? order.length : order.indexOf(a);
  const pb = b === "Unscheduled" ? order.length + 1 : order.indexOf(b) === -1 ? order.length : order.indexOf(b);
  return pa - pb;
}

/** First semester at/after the current one that starts with "WiSe"/"SoSe". */
export function nextSemesterOfType(type: string): string {
  const all = allSemesters();
  const from = Math.max(0, all.indexOf(currentSemester()));
  for (let i = from; i < all.length; i++) if (all[i].startsWith(type)) return all[i];
  return all.find((s) => s.startsWith(type)) || all[0];
}

export function termType(label: string): "WiSe" | "SoSe" | null {
  if (label.startsWith("WiSe")) return "WiSe";
  if (label.startsWith("SoSe")) return "SoSe";
  return null;
}
