import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { codeOf, getCatalog } from "./catalog";
import { MAX_ECTS_PER_SEMESTER } from "./constants";
import { graduationPath, lastChanceCourses, nextSemesterPlans, openInSemester } from "./planning";
import { allSemesters } from "./semesters";
import { computeStats } from "./stats";
import { STATS_OPTS, course } from "./testUtils";

const cat = getCatalog();

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00"));
});
afterAll(() => vi.useRealTimers());

const sample = () => [
  course("wir821", "economics", "SoSe24", "completed", "3.0"),
  course("wir873", "economics", "WiSe25/26", "completed", "1.0"),
  course("inf604", "datascience", "WiSe25/26", "completed", "1.7"),
  course("inf607", "datascience", "SoSe25", "completed", "2.0"),
  course("inf962", "datascience", "SoSe25", "completed", "2.3"),
];

describe("graduationPath", () => {
  const courses = sample();
  const stats = computeStats(courses, cat, STATS_OPTS);
  const path = graduationPath(courses, stats, cat)!;

  it("never plans more than 30 ECTS in a semester", () => {
    expect(path.terms.length).toBeGreaterThan(0);
    path.terms.forEach((t) => expect(t.items.reduce((a, i) => a + i.ects, 0)).toBeLessThanOrEqual(MAX_ECTS_PER_SEMESTER));
  });

  it("never suggests a course the student already has", () => {
    const taken = new Set(courses.map((c) => codeOf(c.name)));
    path.terms.flatMap((t) => t.items).forEach((i) => expect(taken.has(codeOf(i.label))).toBe(false));
  });

  it("schedules every missing compulsory module and puts the thesis last", () => {
    const planned = path.terms.flatMap((t) => t.items.map((i) => codeOf(i.label)));
    stats.missingCompulsory.forEach((lb) => expect(planned).toContain(codeOf(lb)));
    if (path.finished) {
      const last = path.terms[path.terms.length - 1];
      expect(last.items.map((i) => i.category)).toEqual(["thesis"]);
    }
  });

  it("starts after the last semester with planned courses", () => {
    const withPlan = [...courses, course("wir874", "economics", "SoSe27", "planned")];
    const p = graduationPath(withPlan, computeStats(withPlan, cat, STATS_OPTS), cat)!;
    const ds = allSemesters();
    expect(ds.indexOf(p.terms[0].semester)).toBeGreaterThan(ds.indexOf("SoSe27"));
  });
});

describe("nextSemesterPlans", () => {
  it("targets the semester after the current one and keeps already planned courses", () => {
    const courses = [...sample(), course("wir874", "economics", "SoSe27", "planned")];
    const plan = nextSemesterPlans(courses, computeStats(courses, cat, STATS_OPTS), cat)!;
    expect(plan.semester).toBe("SoSe27");
    expect(plan.optionA.some((i) => i.already && codeOf(i.label) === "wir874")).toBe(true);
    [plan.optionA, plan.optionB].forEach((o) => expect(o.reduce((a, i) => a + i.ects, 0)).toBeLessThanOrEqual(MAX_ECTS_PER_SEMESTER));
  });
});

describe("openInSemester / lastChanceCourses", () => {
  it("only lists modules that ran in that semester and are not taken", () => {
    const courses = sample();
    const groups = openInSemester(courses, "SoSe26", cat);
    groups.flatMap((g) => g.open).forEach((o) => {
      const code = codeOf(o.label)!;
      expect(cat.offered[code]).toContain("SoSe26");
      expect(courses.some((c) => codeOf(c.name) === code)).toBe(false);
    });
  });

  it("warns only about compulsory courses running now with a once-a-year pattern", () => {
    const stats = computeStats(sample(), cat, STATS_OPTS);
    lastChanceCourses(stats, cat).forEach((l) => {
      expect(stats.missingCompulsory).toContain(l.label);
      expect(l.pattern).not.toBe("both");
    });
  });
});
