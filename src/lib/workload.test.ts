import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { allowedSemesters, codeOf, getCatalog } from "./catalog";
import { STATS_OPTS, course } from "./testUtils";
import { assessmentOf, balanceSuggestions, semesterLoads } from "./workload";
import type { Course } from "./types";

const cat = getCatalog();
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00"));
});
afterAll(() => vi.useRealTimers());
void STATS_OPTS;

describe("assessmentOf", () => {
  it("classifies the catalog's free-text assessment descriptions", () => {
    expect(assessmentOf("Written exam max. 120 minutes")).toBe("exam");
    expect(assessmentOf("Written or oral exam")).toBe("exam");
    expect(assessmentOf("Klausur mindestens 60 Minuten oder Mündliche Prüfung")).toBe("exam");
    expect(assessmentOf("The exam takes place in the first three weeks after the end of the event period.")).toBe("exam");
    expect(assessmentOf("Portfolio with up to three components.")).toBe("coursework");
    expect(assessmentOf("Term paper: numerical simulation analysis")).toBe("coursework");
    expect(assessmentOf("During the semester")).toBe("coursework");
    expect(assessmentOf("Student research project or presentation")).toBe("coursework");
    expect(assessmentOf("Varies (host university)")).toBe("unknown");
    expect(assessmentOf("")).toBe("unknown");
  });

  it("classifies every assessment in the real catalog without crashing", () => {
    const kinds = cat.courses.map((c) => assessmentOf(c.examType));
    expect(kinds.filter((k) => k === "exam").length).toBeGreaterThan(5);
    expect(kinds.filter((k) => k === "coursework").length).toBeGreaterThan(5);
  });
});

/** Planned electives that run in WiSe26/27 and at least once later. */
function movableElectives(n: number): Course[] {
  return cat.courses
    .filter((c) => !c.compulsory && c.category !== "thesis")
    .filter((c) => {
      const a = allowedSemesters(c.code, cat) || [];
      return a.includes("WiSe26/27") && a.some((s) => s !== "WiSe26/27" && s > "") && a.indexOf("WiSe26/27") < a.length - 1;
    })
    .slice(0, n)
    .map((c) => course(c.label, c.category === "further" ? "further" : c.category, "WiSe26/27", "planned"));
}

describe("semesterLoads", () => {
  it("counts only real, unfinished courses from now on", () => {
    const list = [
      course("wir821", "economics", "SoSe24", "planned"),
      course("wir873", "economics", "WiSe26/27", "completed", "1.0"),
      course("wir874", "economics", "WiSe26/27", "planned"),
      course("wir895", "economics", "WiSe26/27", "in-progress"),
      course("wir894", "empirical", "WiSe26/27", "planned", "", { hypothetical: true }),
      course("inf604", "datascience", "Unscheduled", "planned"),
    ];
    const loads = semesterLoads(list, cat);
    expect(loads.map((l) => [l.semester, l.ects, l.courses.length])).toEqual([["WiSe26/27", 12, 2]]);
    expect(loads[0].hoursPerWeek).toBeCloseTo(360 / 14, 5);
  });
});

describe("balanceSuggestions", () => {
  it("moves a planned elective out of an overloaded semester to a later one it runs in", () => {
    const electives = movableElectives(6);
    expect(electives.length).toBe(6);
    const comp = cat.compulsory.slice(0, 1).map((c) => course(c, "economics", "WiSe26/27", "planned"));
    const list = [...electives, ...comp];
    const s = balanceSuggestions(list, cat);
    expect(s).toHaveLength(1);
    expect(s[0].reason).toBe("overloaded");
    expect(s[0].from).toBe("WiSe26/27");
    expect(cat.compulsory).not.toContain(codeOf(s[0].course.name));
    expect(allowedSemesters(codeOf(s[0].course.name), cat)).toContain(s[0].to);
    expect(s[0].fromEctsAfter).toBe(36);
    expect(s[0].toEctsAfter).toBeLessThanOrEqual(30);
  });

  it("never moves compulsory, running or thesis courses", () => {
    const list = [
      ...cat.compulsory.map((c) => course(c, "economics", "WiSe26/27", "planned")),
      ...movableElectives(4).map((c) => ({ ...c, status: "in-progress" as const })),
      course("mam", "thesis", "WiSe26/27", "planned"),
    ];
    expect(balanceSuggestions(list, cat)).toEqual([]);
  });

  it("evens out a semester much heavier than the others", () => {
    const heavy = movableElectives(4);
    const light = [course("wir821", "economics", "SoSe27", "planned")];
    const s = balanceSuggestions([...heavy, ...light], cat);
    expect(s[0]?.reason).toBe("uneven");
    expect(s[0].toEctsAfter).toBeLessThan(24);
  });

  it("stays quiet for a balanced plan", () => {
    const list = [course("wir874", "economics", "WiSe26/27", "planned"), course("wir821", "economics", "SoSe27", "planned")];
    expect(balanceSuggestions(list, cat)).toEqual([]);
  });
});
