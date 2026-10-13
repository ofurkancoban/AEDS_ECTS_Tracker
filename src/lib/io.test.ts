import { beforeEach, describe, expect, it } from "vitest";
import { codeOf } from "./catalog";
import { coursesFromCsv, coursesToCsv, decodeShare, encodeShare } from "./io";
import { DEFAULT_STATE, latestAutoBackup, listAutoBackups, loadState, saveState } from "./storage";
import { course } from "./testUtils";

describe("CSV", () => {
  it("round-trips courses, including quoted titles", () => {
    const list = [course("wir821", "economics", "SoSe24", "completed", "1.3", { notes: 'said "hi", twice' }), course("inf604", "datascience", "WiSe25/26", "planned")];
    const { courses, skipped } = coursesFromCsv(coursesToCsv(list));
    expect(skipped).toBe(0);
    expect(courses.map((c) => [c.category, c.name, c.ects, c.semester, c.status, c.grade, c.notes])).toEqual(
      list.map((c) => [c.category, c.name, c.ects, c.semester, c.status, c.grade, c.notes]),
    );
  });

  it("skips rows with an unknown category or no name", () => {
    const { courses, skipped } = coursesFromCsv("category,name,ects\neconomics,wir821 - X,6\nnope,wir873 - Y,6\neconomics,,6\n");
    expect(courses).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it("reads German Excel CSVs (semicolons, decimal commas, BOM)", () => {
    const text = "\uFEFFcategory;name;ects;semester;status;grade\neconomics;wir821 - International Trade;6,0;SoSe24;completed;2,3\n";
    const { courses, skipped } = coursesFromCsv(text);
    expect(skipped).toBe(0);
    expect(courses[0]).toMatchObject({ category: "economics", ects: 6, grade: "2.3", semester: "SoSe24" });
  });

  it("still reads comma CSVs whose titles contain semicolons", () => {
    const { courses } = coursesFromCsv('category,name,ects\neconomics,"wir821 - A; B",6\n');
    expect(courses[0].name).toBe("wir821 - A; B");
  });

  it("fills catalog details for imported modules", () => {
    const { courses } = coursesFromCsv("category,name,ects\neconomics,wir821 - International Trade,6\n");
    expect(courses[0].studipLink).toMatch(/^https:/);
    expect(courses[0].homeCategory).toBe("economics");
  });
});

describe("QR share format", () => {
  it("round-trips category, code, ECTS, semester, status and grade", () => {
    const list = [course("wir821", "economics", "SoSe24", "completed", "2.3"), course("mam", "thesis", "SoSe27", "planned")];
    const text = encodeShare(list);
    expect(text.split("\n")[0]).toBe("e~wir821~6~SoSe24~c~2.3");
    const back = decodeShare(text);
    expect(back.map((c) => [c.category, codeOf(c.name), c.ects, c.semester, c.status, c.grade])).toEqual(
      list.map((c) => [c.category, codeOf(c.name), c.ects, c.semester, c.status, c.grade]),
    );
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());
  const POOL = Array.from({ length: 10 }, (_, i) => course("wir821", "economics", "SoSe24", "completed", String(1 + i / 10)));
  const withCourses = (n: number, extra: Partial<typeof DEFAULT_STATE> = {}) => ({ ...DEFAULT_STATE, ...extra, courses: POOL.slice(0, n) });

  it("keeps up to five earlier course lists as automatic backups", () => {
    const t0 = Date.parse("2026-10-13T08:00:00Z");
    for (let i = 0; i < 8; i++) saveState(withCourses(i + 1), t0 + i * 3_600_000);
    const backups = listAutoBackups();
    expect(backups).toHaveLength(5);
    expect(backups.map((b) => b.courses.length)).toEqual([7, 6, 5, 4, 3]);
    expect(latestAutoBackup()!.state.courses).toHaveLength(7);
    expect(loadState().courses).toHaveLength(8);
  });

  it("does not spend backups on settings, page opens or bursts of edits", () => {
    const t0 = Date.parse("2026-10-13T08:00:00Z");
    saveState(withCourses(2), t0);
    saveState(withCourses(2, { theme: "dark", usageCount: 5, targetGrade: "1.5" }), t0 + 10_000);
    expect(listAutoBackups()).toHaveLength(0);
    saveState(withCourses(3), t0 + 20_000); // first real change: backed up
    saveState(withCourses(4), t0 + 30_000); // same burst: not again
    saveState(withCourses(5), t0 + 40_000);
    expect(listAutoBackups().map((b) => b.courses.length)).toEqual([2]);
    saveState(withCourses(6), t0 + 10 * 60_000); // later edit: new backup of the previous list
    expect(listAutoBackups().map((b) => b.courses.length)).toEqual([5, 2]);
  });

  it("reads the classic UI's state shape and repairs what it can", () => {
    localStorage.setItem(
      "ects-tracker-state",
      JSON.stringify({ courses: [{ id: "a", name: "wir821 - X", category: "economics", ects: "6", status: "completed", grade: "2,3" }, { id: "b" }, null], theme: "dark", targetGrade: "1.5" }),
    );
    const s = loadState();
    expect(s.theme).toBe("dark");
    expect(s.courses).toHaveLength(1);
    expect(s.courses[0]).toMatchObject({ id: "a", ects: 6, grade: "2.3", semester: "Unscheduled", homeCategory: "economics" });
    expect(s.graduationDate).toBe("");
  });

  it("survives a corrupted state or backup ring", () => {
    localStorage.setItem("ects-tracker-state", "{oops");
    localStorage.setItem("ects-tracker-state::backups", "not json");
    expect(loadState().courses).toEqual([]);
    expect(listAutoBackups()).toEqual([]);
  });
});
