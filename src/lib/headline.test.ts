import { describe, expect, it } from "vitest";
import { codeOf, getCatalog, ownPool } from "./catalog";
import { headline, moduleEcts } from "./headline";
import { computeStats } from "./stats";
import { STATS_OPTS, course } from "./testUtils";
import type { CategoryId, Course } from "./types";

const cat = getCatalog();

/** n completed 6-ECTS modules spread over the four module categories, compulsory first. */
function modules(n: number, status: Course["status"] = "completed"): Course[] {
  const order: [CategoryId, number][] = [["economics", 6], ["empirical", 3], ["datascience", 3], ["specialization", 3]];
  const out: Course[] = [];
  for (const [id, max] of order) {
    const pool = ownPool(id, cat);
    const sorted = [...pool.filter((l) => cat.compulsory.includes(codeOf(l) || "")), ...pool.filter((l) => !cat.compulsory.includes(codeOf(l) || ""))];
    for (const l of sorted.slice(0, max)) if (out.length < n && !out.some((c) => c.name === l)) out.push(course(l, id, "SoSe25", status, status === "completed" ? "2.0" : ""));
  }
  return out;
}
const h = (list: Course[]) => headline(computeStats(list, cat, STATS_OPTS));

describe("stage headline", () => {
  it("climbs every 3 modules (18 ECTS) up to 90", () => {
    const at = (n: number) => h(modules(n)).text;
    expect(h([]).text).toBe("Starting out");
    expect(at(1)).toBe("Good start: 6 / 120 ECTS");
    expect(at(2)).toBe("Good start: 12 / 120 ECTS");
    expect(at(3)).toBe("Getting going: 18 / 120 ECTS");
    expect(at(5)).toBe("Getting going: 30 / 120 ECTS");
    expect(at(6)).toBe("On track: 36 / 120 ECTS");
    expect(at(8)).toBe("On track: 48 / 120 ECTS");
    expect(at(9)).toBe("Past halfway: 54 / 120 ECTS");
    expect(at(10)).toBe("Past halfway: 60 / 120 ECTS");
    expect(at(11)).toBe("Past halfway: 66 / 120 ECTS");
    expect(at(12)).toBe("Final stretch: 72 / 120 ECTS");
    expect(at(14)).toBe("Final stretch: 84 / 120 ECTS");
    expect(at(15)).toBe("Thesis time");
  });

  it("counts completed modules only, not running or planned ones", () => {
    expect(h(modules(10, "in-progress")).stage).toBe("ready");
    expect(h([...modules(5), ...modules(10, "planned").slice(5)]).stage).toBe("rhythm");
  });

  it("doesn't count the thesis or credits beyond a category toward the stage", () => {
    const thesisOnly = [course("mam", "thesis", "SoSe26", "completed", "1.7")];
    expect(moduleEcts(computeStats(thesisOnly, cat, STATS_OPTS))).toBe(0);
    expect(h(thesisOnly).text).toBe("Good start: 30 / 120 ECTS");
    const tooMuchEcon = ["wir821", "wir873", "wir874", "wir876", "wir878", "wir893", "wir901", "wir890"].map((c) => course(c, "economics", "SoSe25", "completed", "2.0"));
    expect(h(tooMuchEcon).text).toBe("On track: 36 / 120 ECTS"); // 48 ECTS of Economics, 36 count
  });

  it("ends with the graduation message", () => {
    const all = [...modules(15), course("mam", "thesis", "SoSe26", "completed", "1.7")];
    expect(h(all)).toMatchObject({ stage: "done", text: "Ready to graduate" });
  });
});
