// What-if (hypothetical) courses must never change anything real: every
// derived number has to be identical with and without them, except the
// projected GPA and the course lists that display them.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildCourseContext } from "./assistant";
import { getCatalog } from "./catalog";
import { pendingCourses } from "./gradeSim";
import { encodeShare } from "./io";
import { graduationPath, lastChanceCourses, nextSemesterPlans, notOfferedAnymore, openInSemester } from "./planning";
import { attemptNumbers, computeStats } from "./stats";
import { STATS_OPTS, course } from "./testUtils";
import type { Course } from "./types";

const cat = getCatalog();
const OPTS = { ...STATS_OPTS, targetGrade: "1.8", graduationDate: "2027-09-30" };

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00"));
});
afterAll(() => vi.useRealTimers());

const real: Course[] = [
  course("wir821", "economics", "SoSe24", "completed", "2.7"),
  course("wir873", "economics", "WiSe25/26", "completed", "1.3"),
  course("wir893", "economics", "SoSe26", "in-progress"),
  course("wir874", "economics", "WiSe26/27", "planned"),
  course("wir875", "empirical", "WiSe25/26", "completed", "2.0"),
  course("inf604", "datascience", "WiSe25/26", "completed", "1.7"),
  course("inf607", "datascience", "SoSe25", "completed", "5.0"),
  course("wir890", "additional", "SoSe25", "completed", "3.3"),
];

// Every kind of simulated course: each status, a retake of a real module, a
// compulsory module, a thesis, a fail, an Additional one and a moved elective.
const what = (code: string, category: Course["category"], semester: string, status: Course["status"], grade = "", extra: Partial<Course> = {}) =>
  course(code, category, semester, status, grade, { hypothetical: true, ...extra });
const hypothetical: Course[] = [
  what("wir895", "economics", "WiSe26/27", "completed", "1.0"),
  what("wir894", "empirical", "WiSe26/27", "completed", "1.3"),
  what("inf607", "datascience", "SoSe26", "completed", "1.7"),
  what("inf535", "specialization", "WiSe26/27", "in-progress"),
  what("mam", "thesis", "SoSe27", "planned"),
  what("wir876", "economics", "SoSe26", "completed", "5.0"),
  what("wir901", "additional", "SoSe26", "completed", "1.0"),
  what("wir878", "specialization", "SoSe27", "completed", "2.3", { homeCategory: "economics" }),
];
const mixed = [...real, ...hypothetical];

describe("what-if courses leave real results untouched", () => {
  const a = computeStats(real, cat, OPTS);
  const b = computeStats(mixed, cat, OPTS);

  it("credits, GPA and requirements", () => {
    const pick = (s: typeof a) => ({
      completed: s.completed,
      inProgress: s.inProgress,
      planned: s.planned,
      remaining: s.remaining,
      gpa: s.gpa,
      gradePoints: s.gradePoints,
      gradedEcts: s.gradedEcts,
      requiredAverage: s.requiredAverage,
      remainingGradedEcts: s.remainingGradedEcts,
      daysLeft: s.daysLeft,
      compulsoryDone: s.compulsoryDone,
      compulsoryAny: s.compulsoryAny,
      missingCompulsory: s.missingCompulsory,
      missingGrades: s.missingGrades.map((c) => c.id),
      graduationReady: s.graduationReady,
      ectsMet: s.ectsMet,
      nothingOutstanding: s.nothingOutstanding,
      semesterGpa: s.semesterGpa,
      gradeBuckets: s.gradeBuckets,
      categories: s.categories.map((c) => [c.id, c.completed, c.inProgress, c.planned, c.remaining, c.gpa, c.compulsoryDone]),
    });
    expect(pick(b)).toEqual(pick(a));
  });

  it("only the projected GPA changes, using graded simulated courses outside Additional", () => {
    expect(a.projectedGpa).toBeNull();
    // Real graded (no fails, no Additional): 2.7, 1.3, 2.0, 1.7. Simulated: 1.0, 1.3, 1.7, 2.3 (5.0 and Additional excluded).
    const grades = [2.7, 1.3, 2.0, 1.7, 1.0, 1.3, 1.7, 2.3];
    expect(b.projectedGpa).toBe((grades.reduce((x, g) => x + g, 0) / grades.length).toFixed(2));
  });

  it("attempt numbers ignore simulated retakes", () => {
    const n = attemptNumbers(mixed);
    hypothetical.forEach((h) => expect(n.has(h.id)).toBe(false));
    expect([...attemptNumbers(real)]).toEqual([...n]);
  });

  it("planning: graduation path, next semester, open modules and warnings", () => {
    expect(graduationPath(mixed, b, cat)).toEqual(graduationPath(real, a, cat));
    expect(nextSemesterPlans(mixed, b, cat)).toEqual(nextSemesterPlans(real, a, cat));
    expect(openInSemester(mixed, "WiSe26/27", cat)).toEqual(openInSemester(real, "WiSe26/27", cat));
    expect(lastChanceCourses(b, cat)).toEqual(lastChanceCourses(a, cat));
    expect(notOfferedAnymore(mixed, cat).map((x) => x.course.id)).toEqual(notOfferedAnymore(real, cat).map((x) => x.course.id));
  });

  it("grade simulator, assistant context and QR share", () => {
    expect(pendingCourses(mixed).map((c) => c.id)).toEqual(pendingCourses(real).map((c) => c.id));
    expect(buildCourseContext(mixed, "1.8")).toBe(buildCourseContext(real, "1.8"));
    expect(encodeShare(mixed.filter((c) => !c.hypothetical))).toBe(encodeShare(real));
  });

  it("still lists simulated courses in their category", () => {
    const spec = b.categories.find((c) => c.id === "specialization")!;
    expect(spec.items.filter((c) => c.hypothetical)).toHaveLength(2);
    expect(spec.completed).toBe(0);
  });
});
