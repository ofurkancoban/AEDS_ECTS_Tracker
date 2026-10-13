/// <reference types="node" />
// Release tooling: staged rollout layout, problem reports and the bundle budget.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUDGET, check, measure } from "../../scripts/check-budget.mjs";
import { TRY_BUTTON_MARKER, stageLayout } from "../../scripts/stage-layout.mjs";
import { clearRecentErrors, issueUrl, rememberError, scrub } from "./reportIssue";
import { classicUrl, isPreview } from "./stage";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ects-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeBuild(root: string) {
  const w = (p: string, c = "x") => {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), c);
  };
  w("index.html", "<html><body>new</body></html>");
  w("assets/index-abc.js", "console.log(1)");
  w("sw.js");
  w("catalog.csv");
  w("next/index.html", "redirect");
  w("legacy/index.html", "<html><body>classic</body></html>");
  w("legacy/catalog.csv");
}

describe("staged rollout layout", () => {
  it("puts the classic UI at the root and the new design under /next/", () => {
    const src = join(dir, "dist");
    fakeBuild(src);
    const out = stageLayout(src, join(dir, "staged"));
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain("classic");
    expect(readFileSync(join(out, "next", "index.html"), "utf8")).toContain("new");
    expect(existsSync(join(out, "next", "assets", "index-abc.js"))).toBe(true);
    expect(existsSync(join(out, "next", "sw.js"))).toBe(true);
    expect(existsSync(join(out, "next", "catalog.csv"))).toBe(true);
    expect(existsSync(join(out, "catalog.csv"))).toBe(true);
    expect(existsSync(join(out, "legacy"))).toBe(false);
    // The final layout's /next/ redirect is replaced, not nested.
    expect(existsSync(join(out, "next", "next"))).toBe(false);
    // The source build is untouched.
    expect(readFileSync(join(src, "index.html"), "utf8")).toContain("new");
  });

  it("adds the 'Try the new design' button once, before </body>", () => {
    const src = join(dir, "dist");
    fakeBuild(src);
    stageLayout(src);
    const html = readFileSync(join(src, "index.html"), "utf8");
    expect(html.split(TRY_BUTTON_MARKER)).toHaveLength(2);
    expect(html.indexOf(TRY_BUTTON_MARKER)).toBeLessThan(html.lastIndexOf("</body>"));
    expect(html).toContain('link.href = "next/"');
  });

  it("refuses a build without the classic UI", () => {
    mkdirSync(join(dir, "dist"));
    expect(() => stageLayout(join(dir, "dist"))).toThrow(/no legacy/);
  });

  it("knows which layout a page is in", () => {
    expect(isPreview("/AEDS_ECTS_Tracker/next/")).toBe(true);
    expect(isPreview("/AEDS_ECTS_Tracker/next/index.html")).toBe(true);
    expect(isPreview("/AEDS_ECTS_Tracker/")).toBe(false);
    expect(classicUrl("/AEDS_ECTS_Tracker/next/")).toBe("../");
    expect(classicUrl("/AEDS_ECTS_Tracker/")).toBe("./legacy/");
  });
});

describe("problem reports", () => {
  beforeEach(() => clearRecentErrors());

  it("masks course names, codes, quoted text and long numbers", () => {
    expect(scrub('Cannot read "wir821 - International Trade" at 1234567')).toBe('Cannot read "…" at <n>');
    expect(scrub("failed on inf604 - Business Intelligence I")).toBe("failed on <course>");
    expect(scrub("bad code mam and wir873")).toBe("bad code <code> and <code>");
  });

  it("builds a GitHub issue with technical details only", () => {
    localStorage.setItem("ects-tracker-state", JSON.stringify({ courses: [{ name: "wir821 - Secret Course", grade: "1.3" }] }));
    rememberError("TypeError: x is undefined");
    const url = new URL(issueUrl({ kind: "crash", error: { message: "Boom in 'wir821 - Secret Course'", stack: "Error\n at a (app.js:1:2)" }, componentStack: "at CourseRow\nat Courses" }));
    expect(url.origin + url.pathname).toBe("https://github.com/ofurkancoban/AEDS_ECTS_Tracker/issues/new");
    const title = url.searchParams.get("title")!;
    const body = url.searchParams.get("body")!;
    expect(title).toMatch(/^Crash: Boom in/);
    expect(body).toContain("Version:");
    expect(body).toContain("Browser:");
    expect(body).toContain("at CourseRow");
    expect(body).toContain("TypeError: x is undefined");
    expect(title + body).not.toContain("Secret Course");
    expect(title + body).not.toContain("1.3");
    expect(url.searchParams.get("labels")).toBe("bug,crash-report");
  });

  it("stays within URL limits for huge stacks", () => {
    const url = issueUrl({ kind: "crash", error: { message: "x", stack: "line\n".repeat(5000) + "y".repeat(20000) } });
    expect(url.length).toBeLessThanOrEqual(7000);
  });
});

describe("bundle budget", () => {
  function dist(sizes: Record<string, number>, initial: string[]) {
    const root = join(dir, "dist");
    mkdirSync(join(root, "assets"), { recursive: true });
    // Random bytes so gzip can't shrink them: size on disk ~= gzipped size.
    for (const [f, kb] of Object.entries(sizes)) writeFileSync(join(root, "assets", f), randomBytes(kb * 1024));
    const tags = initial.map((f) => (f.startsWith("react") ? `<link rel="modulepreload" crossorigin href="./assets/${f}">` : `<script type="module" crossorigin src="./assets/${f}"></script>`));
    writeFileSync(join(root, "index.html"), `<html><head>${tags.join("")}</head></html>`);
    return root;
  }

  it("counts entry and preloaded scripts as initial, the rest as lazy", () => {
    const m = measure(dist({ "index-a.js": 40, "react-b.js": 30, "Planner-c.js": 8, "index-d.css": 10 }, ["index-a.js", "react-b.js"]));
    expect(m.initialFiles.sort()).toEqual(["assets/index-a.js", "assets/react-b.js"]);
    expect(m.initialJs).toBeGreaterThan(60);
    expect(m.largestLazy).toBe("Planner-c.js");
    expect(check(m)).toEqual([]);
  });

  it("fails when a dependency blows the budget", () => {
    const m = measure(dist({ "index-a.js": BUDGET.initialJs + 20, "Huge-c.js": BUDGET.lazyChunk + 5, "index-d.css": 5 }, ["index-a.js"]));
    const over = check(m);
    expect(over.some((o: string) => o.startsWith("initialJs"))).toBe(true);
    expect(over.some((o: string) => o.includes("Huge-c.js"))).toBe(true);
  });
});
