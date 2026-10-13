// Grade simulator: projects the final GPA from assumed grades for every course
// that has no grade yet, plus an average for credits not planned at all.
import { GRADES, TOTAL_REQUIRED } from "./constants";
import { isFail } from "./stats";
import type { Course } from "./types";

export interface SimInput {
  gradePoints: number; // sum of ects * grade over graded courses (same basis as the overall GPA)
  gradedEcts: number;
  pending: Course[];
}

/** Real courses that will still get a grade counted in the GPA. */
export function pendingCourses(courses: Course[]): Course[] {
  return courses.filter(
    (c) => !c.hypothetical && c.category !== "additional" && !isFail(c) && !(c.status === "completed" && parseFloat(c.grade)),
  );
}

export function unplannedEcts(input: SimInput): number {
  const pendingEcts = input.pending.reduce((a, c) => a + (c.ects || 0), 0);
  return Math.max(0, TOTAL_REQUIRED - input.gradedEcts - pendingEcts);
}

export function projectGpa(input: SimInput, grades: Record<string, number>, restAverage: number): number | null {
  let points = input.gradePoints;
  let ects = input.gradedEcts;
  input.pending.forEach((c) => {
    const g = grades[c.id];
    if (!g) return;
    points += (c.ects || 0) * g;
    ects += c.ects || 0;
  });
  const rest = unplannedEcts(input);
  if (rest > 0 && restAverage) {
    points += rest * restAverage;
    ects += rest;
  }
  return ects > 0 ? points / ects : null;
}

/** The German grade at or better than `value` (e.g. 2.15 -> 2.0), clamped to 1.0..4.0. */
export function gradeAtOrBetter(value: number): number {
  const passing = GRADES.map(Number).filter((g) => g <= 4);
  const ok = passing.filter((g) => g <= value + 1e-9);
  return ok.length ? ok[ok.length - 1] : passing[0];
}

/** The nearest German grade to `value`. */
export function nearestGrade(value: number): number {
  const passing = GRADES.map(Number).filter((g) => g <= 4);
  return passing.reduce((best, g) => (Math.abs(g - value) < Math.abs(best - value) ? g : best), passing[0]);
}
