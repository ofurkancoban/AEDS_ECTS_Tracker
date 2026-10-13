import { describe, expect, it } from "vitest";
import { allSemesters, compareSemesters, currentSemester, planningSemester, sortBySemester } from "./semesters";

const d = (s: string) => new Date(s + "T12:00:00");

describe("semesters", () => {
  it("maps months to the running semester", () => {
    expect(currentSemester(d("2026-04-01"))).toBe("SoSe26");
    expect(currentSemester(d("2026-09-30"))).toBe("SoSe26");
    expect(currentSemester(d("2026-10-01"))).toBe("WiSe26/27");
    expect(currentSemester(d("2027-03-31"))).toBe("WiSe26/27");
  });

  it("switches the planning semester about a month early", () => {
    expect(planningSemester(d("2026-07-31"))).toBe("SoSe26");
    expect(planningSemester(d("2026-08-01"))).toBe("WiSe26/27");
    expect(planningSemester(d("2027-01-31"))).toBe("WiSe26/27");
    expect(planningSemester(d("2027-02-01"))).toBe("SoSe27");
  });

  it("lists semesters in order starting at WiSe20/21", () => {
    const all = allSemesters();
    expect(all.slice(0, 3)).toEqual(["WiSe20/21", "SoSe21", "WiSe21/22"]);
  });

  it("sorts Unscheduled last", () => {
    const sorted = sortBySemester([{ semester: "Unscheduled" }, { semester: "SoSe25" }, { semester: "WiSe24/25" }]);
    expect(sorted.map((x) => x.semester)).toEqual(["WiSe24/25", "SoSe25", "Unscheduled"]);
    expect(compareSemesters("Unscheduled", "SoSe30")).toBeGreaterThan(0);
  });
});
