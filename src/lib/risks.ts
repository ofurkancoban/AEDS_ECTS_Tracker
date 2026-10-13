// Planning risks: the tracker doesn't require a complete plan, it only warns
// when something can no longer work out:
// 1. the credits not planned yet don't fit in the semesters left before the
//    graduation date the student set, and
// 2. a compulsory module that isn't in the plan at all runs next semester but
//    usually only once a year.
import type { Catalog } from "./catalog";
import { allowedSemesters, codeOf, labelForCode, offeringPattern, resolveCode } from "./catalog";
import { MAX_ECTS_PER_SEMESTER } from "./constants";
import { allSemesters, currentSemester } from "./semesters";
import type { Stats } from "./stats";
import { isFail } from "./stats";
import type { Course } from "./types";

export interface CapacityRisk {
  notPlanned: number;
  semesters: string[]; // semesters still open for new courses before graduation
  room: number; // free ECTS in those semesters at 30 per semester
}

export interface CompulsoryRisk {
  code: string;
  label: string;
  semester: string; // the next run
  pattern: "WiSe" | "SoSe";
  lastBeforeGraduation: boolean;
}

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Semesters after the running one, up to and including the one the graduation date falls in. */
export function semestersUntil(graduationDate: string, today = new Date()): string[] | null {
  const end = parseDate(graduationDate);
  if (!end) return null;
  const ds = allSemesters();
  const from = ds.indexOf(currentSemester(today)) + 1;
  const to = ds.indexOf(currentSemester(end));
  if (from < 1 || to < 0) return null;
  return to >= from ? ds.slice(from, to + 1) : [];
}

export function capacityRisk(courses: Course[], stats: Stats, graduationDate: string, today = new Date()): CapacityRisk | null {
  if (stats.remaining <= 0) return null;
  const semesters = semestersUntil(graduationDate, today);
  if (!semesters) return null;
  const room = semesters.reduce((a, s) => {
    const used = courses.filter((c) => !c.hypothetical && c.semester === s && c.status !== "completed").reduce((x, c) => x + c.ects, 0);
    return a + Math.max(0, MAX_ECTS_PER_SEMESTER - used);
  }, 0);
  return stats.remaining > room ? { notPlanned: stats.remaining, semesters, room } : null;
}

/** Compulsory codes the student has some (not failed) course for: completed, running or planned. */
function compulsoryInPlan(courses: Course[], catalog: Catalog): Set<string> {
  const s = new Set<string>();
  courses.forEach((c) => {
    if (c.hypothetical || isFail(c)) return;
    const code = resolveCode(c.name, catalog) || codeOf(c.name);
    if (code && catalog.compulsory.includes(code)) s.add(code);
  });
  return s;
}

export function compulsoryRisks(courses: Course[], catalog: Catalog, graduationDate: string, today = new Date()): CompulsoryRisk[] {
  const ds = allSemesters();
  const next = ds[ds.indexOf(currentSemester(today)) + 1];
  if (!next) return [];
  const inPlan = compulsoryInPlan(courses, catalog);
  const until = semestersUntil(graduationDate, today);
  return catalog.compulsory
    .filter((code) => !inPlan.has(code))
    .map((code) => {
      const pattern = offeringPattern(code, catalog);
      const runs = allowedSemesters(code, catalog) || [];
      if (!pattern || pattern.pattern === "both" || !runs.includes(next)) return null;
      const later = until ? runs.filter((s) => until.includes(s) && s !== next) : [];
      return {
        code,
        label: labelForCode(code, catalog),
        semester: next,
        pattern: pattern.pattern,
        lastBeforeGraduation: !!until && later.length === 0,
      };
    })
    .filter((x): x is CompulsoryRisk => !!x);
}

/** The classic "last chance" note, minus modules already in the plan. */
export function unplannedLastChance(courses: Course[], catalog: Catalog, lastChance: { label: string; pattern: string }[]) {
  const inPlan = compulsoryInPlan(courses, catalog);
  return lastChance.filter((l) => !inPlan.has(codeOf(l.label) || ""));
}
