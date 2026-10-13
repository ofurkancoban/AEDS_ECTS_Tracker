// Randomised robustness checks: odd but possible data must never crash the
// logic layer or produce NaN.
import { describe, expect, it } from "vitest";
import { buildCourseContext } from "./assistant";
import { getCatalog } from "./catalog";
import { pendingCourses, projectGpa } from "./gradeSim";
import { coursesFromCsv, coursesToCsv, decodeShare, encodeShare } from "./io";
import { graduationPath, lastChanceCourses, nextSemesterPlans, notOfferedAnymore, openInSemester } from "./planning";
import { computeStats } from "./stats";
import { STATS_OPTS } from "./testUtils";
import type { Course } from "./types";

const cat = getCatalog();

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function randomCourse(r: () => number, i: number): Course {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const labels = cat.courses.map((c) => c.label);
  return {
    id: "c" + i,
    category: pick(["economics", "empirical", "datascience", "specialization", "thesis", "further", "additional"] as const),
    homeCategory: pick([undefined, "economics", "specialization"] as const),
    name: pick([...labels, ...labels, "Custom seminar", "wir999 - Unknown", "  ", "mam - Master´s Degree Module"]),
    ects: pick([6, 6, 6, 3, 30, 0, 7.5]),
    semester: pick(["SoSe24", "WiSe24/25", "SoSe25", "WiSe26/27", "SoSe27", "Unscheduled", "SoSe40", "garbage"]),
    status: pick(["planned", "in-progress", "completed"] as const),
    grade: pick(["", "1.0", "1.3", "2.7", "4.0", "5.0", "abc", "2,3"]),
    hypothetical: r() < 0.2,
  };
}

describe("fuzz", () => {
  for (let seed = 1; seed <= 60; seed++) {
    it(`seed ${seed}`, () => {
      const r = rng(seed);
      const courses = Array.from({ length: Math.floor(r() * 40) }, (_, i) => randomCourse(r, i));
      const s = computeStats(courses, cat, { ...STATS_OPTS, targetGrade: seed % 3 ? "1.7" : "", graduationDate: "2027-09-30" });
      const nums = [s.completed, s.inProgress, s.planned, s.remaining, s.gradePoints, s.gradedEcts, s.remainingGradedEcts];
      nums.forEach((n) => expect(Number.isFinite(n)).toBe(true));
      if (s.gpa) expect(Number.isFinite(parseFloat(s.gpa))).toBe(true);
      if (s.projectedGpa) expect(Number.isFinite(parseFloat(s.projectedGpa))).toBe(true);
      s.categories.forEach((c) => expect(c.remaining).toBeGreaterThanOrEqual(0));
      s.semesterGpa.forEach((x) => expect(Number.isFinite(x.avg)).toBe(true));

      const path = graduationPath(courses, s, cat);
      path?.terms.forEach((t) => expect(t.items.reduce((a, i) => a + i.ects, 0)).toBeLessThanOrEqual(30));
      nextSemesterPlans(courses, s, cat);
      openInSemester(courses, "WiSe26/27", cat);
      lastChanceCourses(s, cat);
      notOfferedAnymore(courses, cat);

      const pending = pendingCourses(courses);
      const g = projectGpa({ gradePoints: s.gradePoints, gradedEcts: s.gradedEcts, pending }, Object.fromEntries(pending.map((c) => [c.id, 2])), 2);
      if (g !== null) expect(Number.isFinite(g)).toBe(true);

      buildCourseContext(courses, "1.7");
      const back = coursesFromCsv(coursesToCsv(courses.filter((c) => c.name.trim())));
      expect(back.courses.length + back.skipped).toBe(courses.filter((c) => c.name.trim()).length);
      decodeShare(encodeShare(courses));
    });
  }
});
