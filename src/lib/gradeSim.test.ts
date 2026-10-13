import { describe, expect, it } from "vitest";
import { gradeAtOrBetter, nearestGrade, pendingCourses, projectGpa, unplannedEcts } from "./gradeSim";
import { course } from "./testUtils";

describe("grade simulator", () => {
  const done = course("wir873", "economics", "SoSe25", "completed", "2.0");
  const running = course("wir821", "economics", "WiSe26/27", "in-progress");
  const planned = course("inf604", "datascience", "SoSe27", "planned");
  const extra = course("wir874", "additional", "SoSe27", "planned");
  const what = course("wir876", "economics", "SoSe27", "planned", "", { hypothetical: true });

  it("simulates real, GPA-relevant courses without a grade", () => {
    expect(pendingCourses([done, running, planned, extra, what]).map((c) => c.id)).toEqual([running.id, planned.id]);
  });

  it("projects the GPA over all 120 ECTS", () => {
    const input = { gradePoints: 12, gradedEcts: 6, pending: [running, planned] };
    expect(unplannedEcts(input)).toBe(102);
    const gpa = projectGpa(input, { [running.id]: 1.0, [planned.id]: 1.0 }, 2.0)!;
    expect(gpa).toBeCloseTo((12 + 6 + 6 + 102 * 2) / 120, 10);
  });

  it("rounds to German grades", () => {
    expect(gradeAtOrBetter(2.15)).toBe(2.0);
    expect(gradeAtOrBetter(0.5)).toBe(1.0);
    expect(nearestGrade(1.84)).toBe(1.7);
    expect(nearestGrade(1.86)).toBe(2.0);
  });
});
