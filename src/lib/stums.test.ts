import { describe, expect, it } from "vitest";
import { matchStums, parseStums, resolveCatalog } from "./stums";
import { course } from "./testUtils";

// Shape of a copied StuMS achievements table: tab-separated columns with the
// row type glued to the title, then module number, attempt, grade and status.
const PASTE = [
  "1\tmodule International Trade, Production and Change\t2100821\t\t2,3\tBE",
  "2\texamination International Trade, Production and Change\t2100821\t1\t2,3\tBE",
  "3\tmodule Applied Economics\t2100873\t\t\tBE",
  "4\texamination Business Intelligence I\t2200604\t1\t5,0\tNB",
  "5\texamination Business Intelligence I\t2200604\t2\t1,7\tBE",
  "6\tmodule group Economics\t2100000",
  "7\tmodule Something Running\t2100999\t\t\t",
  "8\tmodule Failed Without Grade\t2100998\t\t\tNB",
].join("\n");

describe("parseStums", () => {
  const rows = parseStums(PASTE);

  it("reads finished modules with their grade", () => {
    expect(rows.find((r) => r.number === "2100821")).toMatchObject({ grade: "2.3", status: "passed" });
  });

  it("uses the latest exam attempt when there is no module row", () => {
    expect(rows.find((r) => r.number === "2200604")).toMatchObject({ grade: "1.7", status: "passed" });
  });

  it("treats a failed module without a grade as 5.0 and skips passed ones without a grade", () => {
    expect(rows.find((r) => r.number === "2100998")).toMatchObject({ grade: "5.0", status: "not passed" });
    expect(rows.find((r) => r.number === "2100873")).toBeUndefined();
    expect(rows.find((r) => r.number === "2100999")).toBeUndefined();
  });
});

describe("matchStums", () => {
  it("matches by module number, proposes catalog additions and skips unchanged grades", () => {
    const trade = course("wir821", "economics", "SoSe24", "completed", "3.0");
    const bi = course("inf604", "datascience", "WiSe25/26", "completed", "1.7");
    const m = matchStums(parseStums(PASTE), [trade, bi]);
    expect(m.updates).toEqual([{ course: trade, newGrade: "2.3" }]);
    expect(m.unchanged).toEqual(["Business Intelligence I"]);
    expect(m.review.map((r) => r.number)).toContain("2100998");
  });

  it("resolves unknown numbers through the catalog", () => {
    expect(resolveCatalog("2100821")).toMatchObject({ category: "economics" });
    const m = matchStums(parseStums(PASTE), []);
    expect(m.additions.find((a) => a.row.number === "2100821")?.name).toMatch(/^wir821 - /);
  });
});
