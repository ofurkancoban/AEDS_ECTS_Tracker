// Which changes set things in motion.
import { describe, expect, it } from "vitest";
import { isFresh, layoutKey, noteNewCourses } from "./motion";

const c = (id: string, extra: Partial<{ category: string; semester: string; status: string; grade: string }> = {}) => ({
  id,
  category: "economics",
  semester: "WiSe26/27",
  status: "planned",
  grade: "",
  ...extra,
});

describe("noteNewCourses", () => {
  it("marks a course that was just added", () => {
    noteNewCourses([c("a")], [c("a"), c("b1")]);
    expect(isFresh("b1")).toBe(true);
    expect(isFresh("a")).toBe(false);
  });

  it("leaves a bulk import alone", () => {
    noteNewCourses([], ["i1", "i2", "i3", "i4"].map((id) => c(id)));
    expect(isFresh("i1")).toBe(false);
  });
});

describe("layoutKey", () => {
  it("changes when a card would move, not when a grade is typed", () => {
    const base = layoutKey([c("a"), c("b")]);
    expect(layoutKey([c("a", { grade: "1.3" }), c("b")])).toBe(base);
    expect(layoutKey([c("a", { semester: "SoSe27" }), c("b")])).not.toBe(base);
    expect(layoutKey([c("a", { status: "completed" }), c("b")])).not.toBe(base);
    expect(layoutKey([c("b"), c("a")])).not.toBe(base);
  });
});
