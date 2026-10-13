import { describe, expect, it } from "vitest";
import { normalizeGrade, sanitizeCourse, sanitizeCourses } from "./sanitize";

describe("sanitize", () => {
  it("drops records that cannot be a course", () => {
    expect(sanitizeCourse(null)).toBeNull();
    expect(sanitizeCourse("wir821")).toBeNull();
    expect(sanitizeCourse([1, 2])).toBeNull();
    expect(sanitizeCourse({ id: "x" })).toBeNull();
    expect(sanitizeCourse({ name: "   " })).toBeNull();
  });

  it("repairs fields with safe defaults", () => {
    expect(sanitizeCourse({ name: " Seminar ", category: "nope", ects: "abc", status: "done", grade: 1.7 })).toMatchObject({
      name: "Seminar",
      category: "additional",
      homeCategory: "additional",
      ects: 6,
      status: "planned",
      semester: "Unscheduled",
      grade: "1.7",
      hypothetical: false,
    });
    expect(sanitizeCourse({ name: "mam - Thesis", category: "thesis", ects: -3 })!.ects).toBe(30);
  });

  it("keeps extra fields and valid values", () => {
    const c = sanitizeCourse({ id: "k", name: "wir821 - X", category: "specialization", homeCategory: "economics", ects: 6, semester: "SoSe24", status: "completed", grade: "2,0", notes: "hi", hypothetical: true })!;
    expect(c).toMatchObject({ id: "k", category: "specialization", homeCategory: "economics", grade: "2.0", notes: "hi", hypothetical: true });
  });

  it("gives duplicate ids a new one and counts what was skipped", () => {
    const { courses, skipped } = sanitizeCourses([{ id: "a", name: "A" }, { id: "a", name: "B" }, {}, 5]);
    expect(courses).toHaveLength(2);
    expect(new Set(courses.map((c) => c.id)).size).toBe(2);
    expect(skipped).toBe(2);
    expect(sanitizeCourses({ not: "a list" })).toEqual({ courses: [], skipped: 0 });
  });

  it("normalises German decimal commas in grades", () => {
    expect(normalizeGrade("2,3")).toBe("2.3");
    expect(normalizeGrade(" 1.0 ")).toBe("1.0");
    expect(normalizeGrade(undefined)).toBe("");
  });
});
