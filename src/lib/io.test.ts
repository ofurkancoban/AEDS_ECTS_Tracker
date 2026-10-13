import { beforeEach, describe, expect, it } from "vitest";
import { codeOf } from "./catalog";
import { coursesFromCsv, coursesToCsv, decodeShare, encodeShare } from "./io";
import { latestAutoBackup, loadState, saveState, DEFAULT_STATE } from "./storage";
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

  it("keeps the previous five versions as automatic backups", () => {
    for (let i = 0; i < 8; i++) saveState({ ...DEFAULT_STATE, targetGrade: String(i) });
    const ring = JSON.parse(localStorage.getItem("ects-tracker-state::backups")!);
    expect(ring).toHaveLength(5);
    expect(latestAutoBackup()!.state.targetGrade).toBe("6");
    expect(loadState().targetGrade).toBe("7");
  });

  it("reads the classic UI's state shape", () => {
    localStorage.setItem("ects-tracker-state", JSON.stringify({ courses: [{ id: "a" }], theme: "dark", targetGrade: "1.5" }));
    const s = loadState();
    expect(s.theme).toBe("dark");
    expect(s.courses).toHaveLength(1);
    expect(s.graduationDate).toBe("");
  });
});
