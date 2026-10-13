import { describe, expect, it } from "vitest";
import { allowedSemesters, getCatalog, offeringPattern } from "./catalog";
import { lastChanceCourses } from "./planning";
import { capacityRisk, compulsoryRisks, semestersUntil, unplannedLastChance } from "./risks";
import { computeStats } from "./stats";
import { STATS_OPTS, course } from "./testUtils";

const cat = getCatalog();
const today = new Date("2026-10-13T12:00:00"); // WiSe26/27 running

describe("semesters left before graduation", () => {
  it("counts the semesters after the running one, up to the graduation semester", () => {
    expect(semestersUntil("2027-09-30", today)).toEqual(["SoSe27"]);
    expect(semestersUntil("2028-03-31", today)).toEqual(["SoSe27", "WiSe27/28"]);
    expect(semestersUntil("2026-12-01", today)).toEqual([]);
    expect(semestersUntil("", today)).toBeNull();
  });
});

describe("capacity risk", () => {
  const done = [course("wir821", "economics", "SoSe24", "completed", "2.0")];
  const stats = computeStats(done, cat, STATS_OPTS); // 114 not planned yet

  it("warns when the credits not planned don't fit before the graduation date", () => {
    expect(capacityRisk(done, stats, "2028-03-31", today)).toEqual({ notPlanned: 114, semesters: ["SoSe27", "WiSe27/28"], room: 60 });
  });

  it("stays quiet when there is enough time, or no date", () => {
    expect(capacityRisk(done, stats, "2029-09-30", today)).toBeNull();
    expect(capacityRisk(done, stats, "", today)).toBeNull();
  });

  it("counts courses already planned in those semesters against the room", () => {
    const plan = [...done, course("wir874", "economics", "SoSe27", "planned"), course("wir895", "economics", "SoSe27", "planned")];
    const s = computeStats(plan, cat, STATS_OPTS);
    expect(capacityRisk(plan, s, "2027-09-30", today)).toEqual({ notPlanned: 102, semesters: ["SoSe27"], room: 18 });
  });

  it("is off once everything is planned", () => {
    expect(capacityRisk([], { ...stats, remaining: 0 }, "2026-12-01", today)).toBeNull();
  });
});

describe("compulsory modules not in the plan", () => {
  // Compulsory modules that run next semester (SoSe27) only once a year.
  const onceAYearNext = cat.compulsory.filter((c) => {
    const p = offeringPattern(c, cat);
    return p && p.pattern !== "both" && (allowedSemesters(c, cat) || []).includes("SoSe27");
  });

  it("are flagged when they run next semester only once a year", () => {
    const risks = compulsoryRisks([], cat, "", today);
    expect(risks.map((r) => r.code).sort()).toEqual([...onceAYearNext].sort());
    risks.forEach((r) => expect(r).toMatchObject({ semester: "SoSe27", pattern: "SoSe", lastBeforeGraduation: false }));
  });

  it("are not flagged once they are planned, running or completed", () => {
    if (!onceAYearNext.length) return;
    const code = onceAYearNext[0];
    for (const status of ["planned", "in-progress", "completed"] as const) {
      const risks = compulsoryRisks([course(code, "empirical", "SoSe27", status, status === "completed" ? "2.0" : "")], cat, "", today);
      expect(risks.map((r) => r.code)).not.toContain(code);
    }
  });

  it("are flagged again after a failed attempt", () => {
    if (!onceAYearNext.length) return;
    const code = onceAYearNext[0];
    const risks = compulsoryRisks([course(code, "empirical", "SoSe25", "completed", "5.0")], cat, "", today);
    expect(risks.map((r) => r.code)).toContain(code);
  });

  it("mark the last run before the graduation date", () => {
    const risks = compulsoryRisks([], cat, "2027-09-30", today);
    risks.forEach((r) => expect(r.lastBeforeGraduation).toBe(true));
  });

  it("drop the 'last chance this semester' note for modules already planned", () => {
    const stats = computeStats([], cat, STATS_OPTS);
    const all = lastChanceCourses(stats, cat);
    if (!all.length) return;
    const planned = course(all[0].label, "economics", "WiSe26/27", "planned");
    expect(unplannedLastChance([planned], cat, all).map((l) => l.label)).not.toContain(all[0].label);
    expect(unplannedLastChance([], cat, all)).toEqual(all);
  });
});
