import { describe, expect, it } from "vitest";
import { getCatalog } from "./catalog";
import { attemptNumbers, computeStats } from "./stats";
import { STATS_OPTS, course } from "./testUtils";

const cat = getCatalog();

describe("computeStats", () => {
  it("weights the GPA by ECTS and rounds to two decimals", () => {
    const s = computeStats(
      [course("wir821", "economics", "SoSe24", "completed", "1.3"), course("wir873", "economics", "WiSe24/25", "completed", "2.0"), course("inf604", "datascience", "WiSe25/26", "completed", "1.7")],
      cat,
      STATS_OPTS,
    );
    expect(s.gpa).toBe("1.67");
    expect(s.completed).toBe(18);
    expect(s.gradedEcts).toBe(18);
  });

  it("does not count failed courses towards credits or the GPA", () => {
    const s = computeStats([course("wir821", "economics", "SoSe24", "completed", "5.0"), course("wir873", "economics", "SoSe25", "completed", "2.0")], cat, STATS_OPTS);
    expect(s.completed).toBe(6);
    expect(s.gpa).toBe("2.00");
    expect(s.gradeBuckets.find((b) => b.label === "Fail")!.count).toBe(1);
  });

  it("keeps Additional courses out of the total and the GPA", () => {
    const s = computeStats([course("wir821", "additional", "SoSe24", "completed", "1.0"), course("wir873", "economics", "SoSe25", "completed", "3.0")], cat, STATS_OPTS);
    expect(s.completed).toBe(6);
    expect(s.gpa).toBe("3.00");
  });

  it("ignores hypothetical courses except for the projected GPA", () => {
    const s = computeStats(
      [course("wir873", "economics", "SoSe25", "completed", "3.0"), course("wir821", "economics", "SoSe26", "completed", "1.0", { hypothetical: true })],
      cat,
      STATS_OPTS,
    );
    expect(s.gpa).toBe("3.00");
    expect(s.completed).toBe(6);
    expect(s.projectedGpa).toBe("2.00");
  });

  it("computes the average needed for a target GPA", () => {
    const s = computeStats([course("wir873", "economics", "SoSe25", "completed", "2.0")], cat, { ...STATS_OPTS, targetGrade: "1.9" });
    // (1.9 * 120 - 12) / 114
    expect(s.requiredAverage).toBeCloseTo((1.9 * 120 - 12) / 114, 10);
    expect(s.remainingGradedEcts).toBe(114);
  });

  it("subtracts completed, running and planned credits from each category", () => {
    const s = computeStats(
      [course("wir821", "economics", "SoSe24", "completed", "2.0"), course("wir873", "economics", "WiSe26/27", "in-progress"), course("wir874", "economics", "WiSe26/27", "planned")],
      cat,
      STATS_OPTS,
    );
    const econ = s.categories.find((c) => c.id === "economics")!;
    expect([econ.completed, econ.inProgress, econ.planned, econ.remaining]).toEqual([6, 6, 6, 18]);
    expect(s.remaining).toBe(120 - 18);
  });

  it("tracks compulsory modules and readiness", () => {
    const s = computeStats([course("wir873", "economics", "SoSe25", "completed", "1.0")], cat, STATS_OPTS);
    expect(s.compulsoryDone).toContain("wir873");
    expect(s.missingCompulsory.length).toBe(cat.compulsory.length - 1);
    expect(s.graduationReady).toBe(false);
  });

  it("flags completed courses without a grade", () => {
    const s = computeStats([course("wir873", "economics", "SoSe25", "completed", "")], cat, STATS_OPTS);
    expect(s.missingGrades).toHaveLength(1);
  });
});

describe("attemptNumbers", () => {
  it("numbers retakes chronologically", () => {
    const a = course("wir821", "economics", "SoSe25", "completed", "2.0");
    const b = course("wir821", "economics", "SoSe24", "completed", "5.0");
    const n = attemptNumbers([a, b]);
    expect(n.get(b.id)).toBe(1);
    expect(n.get(a.id)).toBe(2);
  });
});
