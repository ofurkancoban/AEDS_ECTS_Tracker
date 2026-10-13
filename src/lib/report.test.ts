import { describe, expect, it } from "vitest";
import { getCatalog } from "./catalog";
import { DEFAULT_STATE } from "./storage";
import { graduationPath } from "./planning";
import { buildReport } from "./report";
import { computeStats } from "./stats";
import { STATS_OPTS, course } from "./testUtils";

const cat = getCatalog();

function report(courses = [course("wir821", "economics", "SoSe24", "completed", "2.0"), course("wir874", "economics", "WiSe26/27", "planned")], extra = {}) {
  const state = { ...DEFAULT_STATE, courses, targetGrade: "1.9", graduationDate: "2027-09-30", ...extra };
  const stats = computeStats(courses, cat, { ...STATS_OPTS, targetGrade: state.targetGrade, graduationDate: state.graduationDate });
  return buildReport({ state, stats, catalog: cat, path: graduationPath(courses, stats, cat), now: new Date("2026-10-13T12:00:00") });
}

describe("progress report", () => {
  const html = report();

  it("summarises credits, GPA, target and graduation", () => {
    expect(html).toContain("<title>AEDS progress report 13 October 2026</title>");
    expect(html).toMatch(/<span>Completed<\/span><b>6 ECTS<\/b>/);
    expect(html).toMatch(/<span>GPA<\/span><b>2.00<\/b>/);
    expect(html).toMatch(/Target GPA<\/span><b>1.90 \(needs 1.89 on the remaining 114 ECTS\)/);
    expect(html).toContain("2027-09-30");
    expect(html).toMatch(/Compulsory modules<\/span><b>0 of \d+ completed<\/b>/);
  });

  it("lists requirements, compulsory modules, courses by semester and the plan", () => {
    expect(html).toContain("<h2>Requirements</h2>");
    expect(html).toMatch(/<span class="mark half">◐<\/span>wir874/);
    expect(html).toContain("<h3>SoSe24 <span class=\"muted\">· 6 ECTS · average 2.00</span></h3>");
    expect(html).toContain("Suggested schedule for what is not planned yet");
  });

  it("escapes course names and leaves what-if courses out", () => {
    const h = report([course("<img src=x onerror=alert(1)>", "additional", "SoSe24", "completed", "1.0"), course("wir876", "economics", "SoSe26", "completed", "1.0", { hypothetical: true })]);
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
    // It may still be suggested in the plan, but never appears in the record.
    const record = h.slice(h.indexOf("Courses by semester"), h.indexOf("Suggested schedule") > 0 ? h.indexOf("Suggested schedule") : undefined);
    expect(record).not.toContain("wir876");
    expect(record).toContain("&lt;img");
  });

  it("works for an empty tracker", () => {
    const h = report([], { targetGrade: "", graduationDate: "" });
    expect(h).toContain("No courses yet.");
    expect(h).not.toContain("Target GPA");
  });
});
