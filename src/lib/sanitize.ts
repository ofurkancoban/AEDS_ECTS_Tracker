// Course data can come from older versions, hand-edited JSON backups or other
// tools. Everything that enters the app goes through here so a single bad
// record can't crash it (and keep crashing it, since state is persisted).
import { CATEGORY_IDS, STATUSES, defaultEctsFor } from "./constants";
import type { CategoryId, Course, Status } from "./types";

/** "2,3" -> "2.3"; anything that isn't a number is kept as typed (e.g. "") */
export function normalizeGrade(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim().replace(",", ".");
  return s;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}

let counter = 0;
function freshId(): string {
  counter += 1;
  return "r" + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
}

export function sanitizeCourse(raw: unknown): Course | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name).trim();
  if (!name) return null;
  const category = (CATEGORY_IDS as string[]).includes(str(r.category)) ? (r.category as CategoryId) : "additional";
  const home = (CATEGORY_IDS as string[]).includes(str(r.homeCategory)) ? (r.homeCategory as CategoryId) : category;
  const ectsNum = typeof r.ects === "number" ? r.ects : parseFloat(str(r.ects).replace(",", "."));
  const status = (STATUSES as string[]).includes(str(r.status)) ? (r.status as Status) : "planned";
  return {
    ...(r as Partial<Course>),
    id: str(r.id) || freshId(),
    name,
    category,
    homeCategory: home,
    ects: Number.isFinite(ectsNum) && ectsNum >= 0 ? ectsNum : defaultEctsFor(category),
    semester: str(r.semester).trim() || "Unscheduled",
    status,
    grade: normalizeGrade(r.grade),
    hypothetical: r.hypothetical === true,
  } as Course;
}

/** Cleans a list, dropping what can't be repaired and de-duplicating ids. */
export function sanitizeCourses(list: unknown): { courses: Course[]; skipped: number } {
  if (!Array.isArray(list)) return { courses: [], skipped: 0 };
  const seen = new Set<string>();
  const courses: Course[] = [];
  let skipped = 0;
  for (const raw of list) {
    const c = sanitizeCourse(raw);
    if (!c) {
      skipped++;
      continue;
    }
    if (seen.has(c.id)) c.id = freshId();
    seen.add(c.id);
    courses.push(c);
  }
  return { courses, skipped };
}
