import { describe, expect, it } from "vitest";
import { buildCourseContext, formatAnswer, needsCourseContext, withContext } from "./assistant";
import { course } from "./testUtils";

describe("buildCourseContext", () => {
  it("produces the exact format the AEDS_RAG API parses", () => {
    const a = course("wir821 - International Trade, Production and Change", "economics", "SoSe24", "completed", "3.0");
    const b = course("wir873 - Applied Economics", "economics", "WiSe25/26", "completed", "1.0");
    const c = course("inf604 - Business Intelligence I", "datascience", "WiSe25/26", "in-progress");
    const d = course("wir874 - Advanced Microeconomics", "economics", "WiSe26/27", "planned");
    const e = course("wir893 - Development Economics", "economics", "SoSe26", "completed", "5.0");
    const f = course("wir876 - Topics in Economic Research", "economics", "SoSe26", "completed", "1.0", { hypothetical: true });
    expect(buildCourseContext([a, b, c, d, e, f], "1.9")).toBe(
      [
        "My ECTS Tracker progress (12/120 ECTS completed):",
        "Economics (12/36 ECTS) - completed: wir821 - International Trade, Production and Change; wir873 - Applied Economics | planned: wir874 - Advanced Microeconomics | GPA: 2.00",
        "Data Science (0/18 ECTS) - in progress: inf604 - Business Intelligence I",
        "Overall GPA: 2.00 (German scale, 1.0 best - 5.0 fail)",
        "Target GPA: 1.90 (need average 1.89 across the next 108 ECTS to reach this)",
        "Codes already completed or in progress: wir821, wir873, inf604",
        "Codes by category: economics: wir821, wir873; datascience: inf604",
        "Planned codes by category: economics: wir874",
      ].join("\n"),
    );
  });

  it("does not count Additional courses toward the 120 ECTS total", () => {
    const ctx = buildCourseContext(
      [course("wir821", "economics", "SoSe24", "completed", "2.0"), course("wir890", "additional", "SoSe25", "completed", "1.0")],
      "",
    )!;
    expect(ctx.split("\n")[0]).toBe("My ECTS Tracker progress (6/120 ECTS completed):");
    expect(ctx).toContain("Additional (6 ECTS) - completed: " + course("wir890", "additional", "SoSe25", "completed").name);
    // Additional grades stay out of the overall GPA too.
    expect(ctx).toContain("Overall GPA: 2.00");
  });

  it("returns null without real courses", () => {
    expect(buildCourseContext([], "")).toBeNull();
    expect(buildCourseContext([course("wir821", "economics", "SoSe24", "completed", "1.0", { hypothetical: true })], "")).toBeNull();
  });

  it("prefixes the question only when there is context", () => {
    expect(withContext("Hi?", null)).toBe("Hi?");
    expect(withContext("Hi?", "CTX")).toBe("CTX\n\nQuestion: Hi?");
  });
});

describe("needsCourseContext", () => {
  it("sends the course list with questions about the student's studies", () => {
    for (const q of [
      "Which elective should I take next semester?",
      "How many ECTS do I still need?",
      "Can I write my thesis now?",
      "Was fehlt mir noch?",
      "Welche Module sollte ich als Nächstes belegen?",
      "What is my GPA?",
    ])
      expect(needsCourseContext(q)).toBe(true);
  });

  it("leaves it out of general questions", () => {
    for (const q of ["What's in the Mensa today?", "Who created you?", "When does the library open?", "How much is the broadcast fee?"])
      expect(needsCourseContext(q)).toBe(false);
  });
});

describe("formatAnswer", () => {
  it("escapes HTML from the model before formatting", () => {
    const html = formatAnswer('<img src=x onerror="alert(1)"> **bold**');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("<b>bold</b>");
  });

  it("only links http(s) URLs", () => {
    expect(formatAnswer("[x](javascript:alert(1))")).not.toContain("<a");
    expect(formatAnswer("[Stud.IP](https://elearning.uni-oldenburg.de)")).toContain('href="https://elearning.uni-oldenburg.de"');
  });

  it("renders lists, headings and tables", () => {
    const html = formatAnswer("## Plan\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('<div class="md-h md-h2">Plan</div>');
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<td>1</td><td>2</td>");
  });
});
