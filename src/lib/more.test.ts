// Edge cases across the logic layer that the main suites don't cover.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeOf, getCatalog, ownPool } from "./catalog";
import { CATEGORIES, TOTAL_REQUIRED, categoryById, defaultEctsFor } from "./constants";
import { pendingCourses, projectGpa, unplannedEcts } from "./gradeSim";
import { escapeHtml, shareUrl } from "./io";
import { notOfferedAnymore } from "./planning";
import { nextSemesterOfType, semesterIndex, termType } from "./semesters";
import { computeStats, isFail } from "./stats";
import { matchStums, normalizeTitle, parseStums } from "./stums";
import { STATS_OPTS, course } from "./testUtils";
import type { CategoryId, Course } from "./types";

const cat = getCatalog();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00"));
});
afterEach(() => vi.useRealTimers());

describe("programme rules", () => {
  it("adds up to 120 ECTS across the counted categories", () => {
    expect(TOTAL_REQUIRED).toBe(120);
    expect(CATEGORIES.filter((c) => !c.excludedFromTotal).map((c) => c.required)).toEqual([36, 18, 18, 18, 30, 0]);
  });

  it("defaults to 6 ECTS, 30 for the thesis", () => {
    expect(defaultEctsFor("economics")).toBe(6);
    expect(defaultEctsFor("thesis")).toBe(30);
    expect(categoryById("nope" as CategoryId).id).toBe("additional");
  });

  it("treats only grades above 4.0 as failed", () => {
    const g = (grade: string) => isFail(course("wir821", "economics", "SoSe24", "completed", grade));
    expect([g("4.0"), g("5.0"), g(""), g("x")]).toEqual([false, true, false, false]);
  });
});

describe("semester helpers", () => {
  it("finds the next semester of a term type", () => {
    expect(nextSemesterOfType("WiSe")).toBe("WiSe26/27");
    expect(nextSemesterOfType("SoSe")).toBe("SoSe27");
    expect(termType("SoSe25")).toBe("SoSe");
    expect(termType("Unscheduled")).toBeNull();
    expect(semesterIndex("WiSe20/21")).toBe(0);
    expect(semesterIndex("nope")).toBe(-1);
  });
});

/** Every requirement met using real catalog modules. */
function fullDegree(): Course[] {
  const out: Course[] = [];
  const add = (catId: CategoryId, need: number) => {
    const pool = ownPool(catId, cat).filter((l) => !out.some((c) => c.name === l));
    const comp = pool.filter((l) => cat.compulsory.includes(codeOf(l) || ""));
    const rest = pool.filter((l) => !comp.includes(l));
    let ects = 0;
    for (const l of [...comp, ...rest]) {
      if (ects >= need) break;
      out.push(course(l, catId, "SoSe25", "completed", "1.7"));
      ects += catId === "thesis" ? 30 : 6;
    }
  };
  add("economics", 36);
  add("empirical", 18);
  add("datascience", 18);
  add("specialization", 18);
  add("thesis", 30);
  return out;
}

describe("graduation readiness", () => {
  it("is ready when every target and compulsory module is done", () => {
    const s = computeStats(fullDegree(), cat, STATS_OPTS);
    expect(s.completed).toBe(120);
    expect(s.missingCompulsory).toEqual([]);
    expect(s.graduationReady).toBe(true);
    expect(s.nothingOutstanding).toBe(true);
    expect(s.gpa).toBe("1.70");
  });

  it("is not ready with 120 ECTS but a missing compulsory module", () => {
    const list = fullDegree();
    const i = list.findIndex((c) => cat.compulsory.includes(codeOf(c.name) || ""));
    list[i] = { ...list[i], name: "Replacement seminar" };
    const s = computeStats(list, cat, STATS_OPTS);
    expect(s.ectsMet).toBe(true);
    expect(s.graduationReady).toBe(false);
  });
});

describe("dates and reminders", () => {
  it("counts the days to graduation", () => {
    expect(computeStats([], cat, { ...STATS_OPTS, graduationDate: "2026-10-20" }).daysLeft).toBe(7);
    expect(computeStats([], cat, STATS_OPTS).daysLeft).toBeNull();
  });

  it("counts calendar days across a DST change and handles bad dates", () => {
    // Clocks go back on 25 Oct 2026 in Germany.
    expect(computeStats([], cat, { ...STATS_OPTS, graduationDate: "2026-11-13" }).daysLeft).toBe(31);
    expect(computeStats([], cat, { ...STATS_OPTS, graduationDate: "2026-10-13" }).daysLeft).toBe(0);
    expect(computeStats([], cat, { ...STATS_OPTS, graduationDate: "not a date" }).daysLeft).toBeNull();
  });

  it("reminds about backups after a week, unless dismissed", () => {
    const one = [course("wir821", "economics", "SoSe24", "completed", "2.0")];
    expect(computeStats(one, cat, STATS_OPTS).needsBackupReminder).toBe(true);
    expect(computeStats(one, cat, { ...STATS_OPTS, lastBackupAt: "2026-10-10T12:00:00" }).needsBackupReminder).toBe(false);
    expect(computeStats(one, cat, { ...STATS_OPTS, lastBackupAt: "2026-10-01T12:00:00" }).needsBackupReminder).toBe(true);
    expect(computeStats(one, cat, { ...STATS_OPTS, backupReminderDismissed: true }).needsBackupReminder).toBe(false);
    expect(computeStats([], cat, STATS_OPTS).needsBackupReminder).toBe(false);
  });

  it("orders the semester GPA trend chronologically", () => {
    const s = computeStats(
      [course("wir821", "economics", "SoSe25", "completed", "2.0"), course("wir873", "economics", "SoSe24", "completed", "1.0"), course("inf604", "datascience", "WiSe24/25", "completed", "3.0")],
      cat,
      STATS_OPTS,
    );
    expect(s.semesterGpa.map((x) => [x.semester, x.avg])).toEqual([
      ["SoSe24", 1],
      ["WiSe24/25", 3],
      ["SoSe25", 2],
    ]);
  });
});

describe("notOfferedAnymore", () => {
  it("flags planned electives whose last run is in the past", () => {
    const last = Object.entries(cat.offered).find(([code, l]) => !cat.compulsory.includes(code) && l.length && semesterIndex(l[l.length - 1]) < semesterIndex("WiSe26/27") && semesterIndex(l[l.length - 1]) >= 0);
    expect(last).toBeTruthy();
    const [code] = last!;
    const planned = course(code, "specialization", "SoSe27", "planned");
    const done = course(code, "specialization", "SoSe24", "completed", "2.0");
    const flagged = notOfferedAnymore([planned, done], cat);
    expect(flagged.map((f) => f.course.id)).toEqual([planned.id]);
  });

  it("never flags compulsory modules", () => {
    const list = cat.compulsory.map((c) => course(c, "economics", "SoSe27", "planned"));
    expect(notOfferedAnymore(list, cat)).toEqual([]);
  });
});

describe("grade simulator edge cases", () => {
  it("has nothing to project without any credits", () => {
    expect(projectGpa({ gradePoints: 0, gradedEcts: 0, pending: [] }, {}, 0)).toBeNull();
  });

  it("does not simulate failed or already graded courses", () => {
    const failed = course("wir821", "economics", "SoSe24", "completed", "5.0");
    const graded = course("wir873", "economics", "SoSe24", "completed", "2.0");
    const noGrade = course("wir874", "economics", "SoSe24", "completed", "");
    expect(pendingCourses([failed, graded, noGrade]).map((c) => c.id)).toEqual([noGrade.id]);
  });

  it("never reports negative unplanned credits", () => {
    expect(unplannedEcts({ gradePoints: 0, gradedEcts: 126, pending: [] })).toBe(0);
  });
});

describe("io helpers", () => {
  it("escapes HTML for the print view", () => {
    expect(escapeHtml(`<b a="1">'&'</b>`)).toBe("&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
    expect(escapeHtml(null)).toBe("");
  });

  it("builds a #qrimport link on the current page", () => {
    expect(shareUrl("e~wir821~6~SoSe24~c~2.0")).toBe(window.location.origin + window.location.pathname + "#qrimport=e~wir821~6~SoSe24~c~2.0");
  });
});

describe("StuMS edge cases", () => {
  it("accepts runs of spaces as column separators", () => {
    const rows = parseStums("1  module Applied Economics  2100873    1,0  BE");
    expect(rows).toEqual([{ number: "2100873", title: "Applied Economics", grade: "1.0", status: "passed" }]);
  });

  it("ignores exam regulation and module group rows", () => {
    expect(parseStums("1\texamination regulations Master AEDS\t2000000\t\t1,7\tBE")).toEqual([]);
  });

  it("matches by title when the number is unknown", () => {
    const c = course("My Trade Course - extra", "additional", "SoSe24", "completed", "");
    const own = { ...c, name: "International Trade" };
    const m = matchStums([{ number: "999", title: "International Trade", grade: "2.0", status: "passed" }], [own]);
    expect(m.updates).toEqual([{ course: own, newGrade: "2.0" }]);
  });

  it("asks for review when a number matches more than one course", () => {
    const a = course("wir821", "economics", "SoSe23", "completed", "5.0");
    const b = course("wir821", "economics", "SoSe24", "completed", "");
    const m = matchStums([{ number: "2100821", title: "x", grade: "2.0", status: "passed" }], [a, b]);
    expect(m.review).toHaveLength(1);
  });

  it("normalises titles for matching", () => {
    expect(normalizeTitle("wir821 - International Trade, Production & Change")).toBe("international trade production change");
  });
});
