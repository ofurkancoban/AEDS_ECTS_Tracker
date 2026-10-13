// Semester workload balance for the Planner: credits, weekly hours and exam
// load per upcoming semester, plus concrete "move X to Y" suggestions that
// only use semesters the module actually runs in.
import type { Catalog } from "./catalog";
import { allowedSemesters, catalogCourse, codeOf, resolveCode } from "./catalog";
import { LECTURE_WEEKS, MAX_ECTS_PER_SEMESTER } from "./constants";
import { allSemesters, compareSemesters, currentSemester } from "./semesters";
import type { Course } from "./types";

export type Assessment = "exam" | "coursework" | "unknown";

/** Best guess at how a module is assessed, from its free-text exam field. */
export function assessmentOf(examType: string | undefined | null): Assessment {
  const t = (examType || "").trim().toLowerCase();
  if (!t) return "unknown";
  const coursework = /^(portfolio|term paper|formal presentation|student research|assignment|presentation|end of term \(term paper|entweder portfolio)/;
  if (coursework.test(t)) return "coursework";
  if (/written|klausur|\bexam\b|exam(ination)?s? (takes|dates)|end of (the )?(semester|lecture period)|after the end of the (lecture|event) period|lecture-free period/.test(t)) return "exam";
  if (/portfolio|term paper|presentation|referat|project|assignment|during the semester|hausarbeit|seminararbeit/.test(t)) return "coursework";
  return "unknown";
}

export interface SemesterLoad {
  semester: string;
  courses: Course[];
  ects: number;
  hoursPerWeek: number;
  exams: number;
  coursework: number;
  overloaded: boolean; // more than 30 ECTS
  examHeavy: boolean; // four or more end-of-term exams
}

export const EXAM_HEAVY = 4;

function examTypeOf(c: Course, cat: Catalog): string {
  if (c.examType) return c.examType;
  const code = resolveCode(c.name, cat) || codeOf(c.name);
  return catalogCourse(code, cat)?.examType || "";
}

/** Load of the current and upcoming semesters that have real, unfinished courses. */
export function semesterLoads(courses: Course[], cat: Catalog, from = currentSemester()): SemesterLoad[] {
  const by = new Map<string, Course[]>();
  courses.forEach((c) => {
    if (c.hypothetical || c.status === "completed" || c.semester === "Unscheduled") return;
    if (compareSemesters(c.semester, from) < 0) return;
    by.set(c.semester, [...(by.get(c.semester) || []), c]);
  });
  return [...by.entries()]
    .sort(([a], [b]) => compareSemesters(a, b))
    .map(([semester, list]) => {
      const ects = list.reduce((a, c) => a + (c.ects || 0), 0);
      const kinds = list.map((c) => assessmentOf(examTypeOf(c, cat)));
      const exams = kinds.filter((k) => k === "exam").length;
      return {
        semester,
        courses: list,
        ects,
        hoursPerWeek: list.reduce((a, c) => a + (c.workloadHours || c.ects * 30), 0) / LECTURE_WEEKS,
        exams,
        coursework: kinds.filter((k) => k === "coursework").length,
        overloaded: ects > MAX_ECTS_PER_SEMESTER,
        examHeavy: exams >= EXAM_HEAVY,
      };
    });
}

export interface MoveSuggestion {
  course: Course;
  from: string;
  to: string;
  reason: "overloaded" | "exam-heavy" | "uneven";
  fromEctsAfter: number;
  toEctsAfter: number;
}

const UNEVEN_GAP = 18;

/**
 * Suggestions that relieve a heavy semester by moving one planned course to a
 * later semester it runs in (confirmed or predicted) that stays within 30 ECTS.
 * Compulsory and running courses are never moved; one suggestion per semester.
 */
export function balanceSuggestions(courses: Course[], cat: Catalog, from = currentSemester()): MoveSuggestion[] {
  const loads = semesterLoads(courses, cat, from);
  const ds = allSemesters();
  const ectsIn = (s: string) => loads.find((l) => l.semester === s)?.ects ?? 0;
  const examsIn = (s: string) => loads.find((l) => l.semester === s)?.exams ?? 0;
  const lightest = loads.length ? Math.min(...loads.map((l) => l.ects)) : 0;
  const out: MoveSuggestion[] = [];

  for (const load of loads) {
    const reason: MoveSuggestion["reason"] | null = load.overloaded
      ? "overloaded"
      : load.examHeavy
        ? "exam-heavy"
        : loads.length > 1 && load.ects - lightest >= UNEVEN_GAP
          ? "uneven"
          : null;
    if (!reason) continue;

    const candidates = load.courses
      .filter((c) => c.status === "planned")
      .filter((c) => {
        const code = resolveCode(c.name, cat) || codeOf(c.name);
        return !(code && cat.compulsory.includes(code)) && c.category !== "thesis";
      })
      // For an exam-heavy term, moving an exam helps; otherwise any course does.
      .sort((a, b) => {
        if (reason !== "exam-heavy") return 0;
        const ea = assessmentOf(examTypeOf(a, cat)) === "exam" ? 0 : 1;
        const eb = assessmentOf(examTypeOf(b, cat)) === "exam" ? 0 : 1;
        return ea - eb;
      });

    let best: MoveSuggestion | null = null;
    for (const c of candidates) {
      const code = resolveCode(c.name, cat) || codeOf(c.name);
      const allowed = allowedSemesters(code, cat);
      const start = ds.indexOf(load.semester);
      for (let i = start + 1; i <= start + 4 && i < ds.length; i++) {
        const to = ds[i];
        if (allowed && !allowed.includes(to)) continue;
        if (!allowed && to.slice(0, 4) !== load.semester.slice(0, 4)) continue; // unknown offering: keep the term type
        const after = ectsIn(to) + c.ects;
        if (after > MAX_ECTS_PER_SEMESTER) continue;
        if (reason === "uneven" && after >= load.ects) continue; // must actually even things out
        if (reason === "exam-heavy" && assessmentOf(examTypeOf(c, cat)) === "exam" && examsIn(to) + 1 >= EXAM_HEAVY) continue;
        best = { course: c, from: load.semester, to, reason, fromEctsAfter: load.ects - c.ects, toEctsAfter: after };
        break;
      }
      if (best) break;
    }
    if (best) out.push(best);
  }
  return out;
}
