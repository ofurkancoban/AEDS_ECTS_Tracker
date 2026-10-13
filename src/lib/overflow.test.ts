import { describe, expect, it } from "vitest";
import { buildCourseContext } from "./assistant";
import { codeOf, getCatalog, ownPool } from "./catalog";
import { overflowNotes } from "./overflow";
import { computeStats } from "./stats";
import { STATS_OPTS, course } from "./testUtils";
import type { CategoryId, Course } from "./types";

const cat = getCatalog();

/** n completed (passed) electives of a category, compulsory modules first. */
function take(id: CategoryId, n: number, status: Course["status"] = "completed", used: Course[] = []): Course[] {
  const pool = ownPool(id, cat).filter((l) => !used.some((c) => c.name === l));
  const sorted = [...pool.filter((l) => cat.compulsory.includes(codeOf(l) || "")), ...pool.filter((l) => !cat.compulsory.includes(codeOf(l) || ""))];
  return sorted.slice(0, n).map((l) => course(l, id, "SoSe25", status, status === "completed" ? "2.0" : ""));
}

function degree(spec: { econ: number; emp: number; ds: number; spec: number; thesis: boolean; further?: number }): Course[] {
  const all: Course[] = [];
  const add = (list: Course[]) => all.push(...list);
  add(take("economics", spec.econ, "completed", all));
  add(take("empirical", spec.emp, "completed", all));
  add(take("datascience", spec.ds, "completed", all));
  add(take("specialization", spec.spec, "completed", all));
  if (spec.thesis) add([course("mam", "thesis", "SoSe26", "completed", "1.7")]);
  if (spec.further) add(take("further", spec.further, "completed", all));
  return all;
}

describe("credits beyond a category's requirement", () => {
  it("don't fill another category's gap", () => {
    // Economics 42 (6 over), Specialization 12 (6 short): 120 raw, 114 that count.
    const s = computeStats(degree({ econ: 7, emp: 3, ds: 3, spec: 2, thesis: true }), cat, STATS_OPTS);
    const econ = s.categories.find((c) => c.id === "economics")!;
    expect(econ.completed).toBe(42);
    expect(econ.counted.completed).toBe(36);
    expect(econ.overflow).toBe(6);
    expect(s.completed).toBe(114);
    expect(s.remaining).toBe(6);
    expect(s.ectsMet).toBe(false);
    expect(s.graduationReady).toBe(false);
  });

  it("counts Further modules only once moved into a category", () => {
    const s = computeStats(degree({ econ: 6, emp: 3, ds: 3, spec: 1, thesis: true, further: 2 }), cat, STATS_OPTS);
    expect(s.completed).toBe(108);
    expect(s.categories.find((c) => c.id === "further")!.overflow).toBe(12);
    expect(s.categories.find((c) => c.id === "specialization")!.remaining).toBe(12);
  });

  it("fill the total in order completed, running, planned", () => {
    const list = [...take("economics", 5), ...take("economics", 2, "in-progress", take("economics", 5)), ...take("economics", 1, "planned", take("economics", 7))];
    const econ = computeStats(list, cat, STATS_OPTS).categories.find((c) => c.id === "economics")!;
    expect(econ.counted).toEqual({ completed: 30, inProgress: 6, planned: 0 });
    expect(econ.overflow).toBe(12);
  });

  it("leave a complete degree ready", () => {
    const s = computeStats(degree({ econ: 6, emp: 3, ds: 3, spec: 3, thesis: true }), cat, STATS_OPTS);
    expect(s.completed).toBe(120);
    expect(s.ectsMet).toBe(true);
    expect(s.categories.every((c) => c.overflow === 0)).toBe(true);
  });

  it("are reported with a move that would use them", () => {
    const list = degree({ econ: 7, emp: 3, ds: 3, spec: 2, thesis: true });
    const notes = overflowNotes(list, computeStats(list, cat, STATS_OPTS), cat);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ category: "economics", overflow: 6, move: { to: "specialization" } });
    expect(cat.compulsory).not.toContain(codeOf(notes[0].move!.course.name));
  });

  it("are reported without a move when no category has room", () => {
    const list = degree({ econ: 7, emp: 3, ds: 3, spec: 3, thesis: true });
    const notes = overflowNotes(list, computeStats(list, cat, STATS_OPTS), cat);
    expect(notes).toEqual([{ category: "economics", overflow: 6, move: null }]);
  });

  it("are not counted in the assistant's progress line either", () => {
    const ctx = buildCourseContext(degree({ econ: 7, emp: 3, ds: 3, spec: 2, thesis: true }), "")!;
    expect(ctx.split("\n")[0]).toBe("My ECTS Tracker progress (114/120 ECTS completed):");
    expect(ctx).toContain("Economics (42/36 ECTS)");
  });
});
