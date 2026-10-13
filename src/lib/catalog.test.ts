import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addablePool,
  allowedSemesters,
  buildCatalog,
  codeOf,
  courseInfo,
  dataHorizonIndex,
  defaultSemesterFor,
  getCatalog,
  isCompulsory,
  migrateCourseNames,
  offeringPattern,
  ownPool,
  parseCSV,
  resolveCode,
  semesterOptionsFor,
} from "./catalog";
import { allSemesters } from "./semesters";
import { course } from "./testUtils";

const HEAD = "category,code,name,ects,compulsory,source,offering,semesters_offered,extra_semesters,language,professor,exam_type,contact_hours,studip_link,skills";
// Five fillers make SoSe23 and WiSe23/24 "real" data semesters (>= 5 modules), so
// anything later is a prediction.
const FILL = ["f1", "f2", "f3", "f4", "f5"].map((c, i) => `further,wir90${i},Filler ${c},6,,studip,,SoSe23;WiSe23/24,,English,,,,,`);
const CSV = [
  HEAD,
  'economics,wir100,"Trade, Growth and ""Policy""",6,x,studip,SoSe,SoSe22;SoSe23,SoSe24,English,Prof A,Written exam,,https://studip/a,Learn trade',
  "economics,wir101,Macro Theory,6,,studip,,WiSe22/23;SoSe23,,German,Prof B,Oral,40,,",
  "empirical,wir200,Econometrics,6,x,studip,,WiSe22/23,,English,,,,,",
  "datascience,inf300,Data Mining,6,,studip,,SoSe23;WiSe23/24,,English,,,,,",
  "specialization,inf400,Databases,6,,studip,,,,,,,,,",
  "thesis,mam,Master’s Degree Module,30,,manual,,,,,,,,,",
  ...FILL,
].join("\r\n");

const cat = buildCatalog(CSV, "Tue, 13 Oct 2026 05:00:00 GMT", "fetched");

afterEach(() => vi.useRealTimers());

describe("parseCSV", () => {
  it("handles quoted commas, escaped quotes, CRLF and blank lines", () => {
    expect(parseCSV('a,"b, c","d ""e"""\r\n\r\n1,2,3')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a last line without a trailing newline", () => {
    expect(parseCSV("x,y\n1,2")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });
});

describe("buildCatalog", () => {
  it("groups labels by category and flags compulsory modules", () => {
    expect(cat.lists.economics).toEqual(['wir100 - Trade, Growth and "Policy"', "wir101 - Macro Theory"]);
    expect(cat.compulsory).toEqual(["wir100", "wir200"]);
    expect(cat.compulsoryByCategory.empirical).toEqual(["wir200"]);
    expect(isCompulsory("wir100", cat)).toBe(true);
    expect(isCompulsory("wir101", cat)).toBe(false);
  });

  it("merges confirmed extra semesters in chronological order", () => {
    expect(cat.offered.wir100).toEqual(["SoSe22", "SoSe23", "SoSe24"]);
  });

  it("reads contact hours and leaves blanks empty", () => {
    expect(cat.byCode.get("wir101")!.contactHours).toBe(40);
    expect(cat.byCode.get("wir100")!.contactHours).toBeNull();
    expect(cat.byCode.get("mam")!.ects).toBe(30);
  });
});

describe("lookups", () => {
  it("extracts lowercase codes from labels only", () => {
    expect(codeOf("WIR821 - Something")).toBe("wir821");
    expect(codeOf("wir821-Something")).toBe("wir821");
    expect(codeOf("Macro Theory")).toBeNull();
    expect(codeOf(undefined)).toBeNull();
  });

  it("resolves codes from labels, bare codes and exact titles", () => {
    expect(resolveCode("wir101 - Anything", cat)).toBe("wir101");
    expect(resolveCode("macro theory", cat)).toBe("wir101");
    expect(resolveCode("INF300", cat)).toBe("inf300");
    expect(resolveCode("Master's Degree Module", cat)).toBe("mam");
    expect(resolveCode("Unknown course", cat)).toBeNull();
  });

  it("lets Specialization accept the other electives and Additional accept everything", () => {
    const spec = addablePool("specialization", cat);
    expect(spec).toContain("inf400 - Databases");
    expect(spec).toContain("wir101 - Macro Theory");
    expect(spec).toContain("inf300 - Data Mining");
    expect(addablePool("additional", cat).length).toBe(cat.courses.length);
    expect(ownPool("specialization", cat)).toEqual(["inf400 - Databases"]);
  });

  it("falls back to the default thesis module", () => {
    const empty = buildCatalog(HEAD, "", "fetched");
    expect(addablePool("thesis", empty)).toEqual(["mam - Master's Degree Module"]);
  });
});

describe("courseInfo", () => {
  it("fills catalog details and derives workload from ECTS", () => {
    const info = courseInfo("wir101 - Macro Theory", 6, cat)!;
    expect(info).toMatchObject({ language: "German", professor: "Prof B", examType: "Oral", contactHours: 40, workloadHours: 180, compulsory: false });
  });

  it("uses known contact-hour overrides and English as default language", () => {
    const real = getCatalog();
    expect(courseInfo("inf962 - Anything", 6, real)!.contactHours).toBe(real.byCode.get("inf962")?.contactHours ?? 84);
    expect(courseInfo("inf400 - Databases", 6, cat)).toMatchObject({ language: "English", contactHours: 56 });
  });

  it("returns null for unknown names", () => {
    expect(courseInfo("Some seminar", 6, cat)).toBeNull();
  });
});

describe("offering predictions", () => {
  it("finds the last semester with real data", () => {
    expect(allSemesters()[dataHorizonIndex(cat)]).toBe("WiSe23/24");
  });

  it("predicts up to three future runs of the same term for summer-only modules", () => {
    // SoSe24 is a confirmed extra run, so the three predictions come after it.
    expect(allowedSemesters("wir100", cat)).toEqual(["SoSe22", "SoSe23", "SoSe24", "SoSe25", "SoSe26", "SoSe27"]);
  });

  it("predicts every term for modules seen in both terms", () => {
    expect(allowedSemesters("inf300", cat)).toEqual(["SoSe23", "WiSe23/24", "SoSe24", "WiSe24/25", "SoSe25"]);
  });

  it("does not predict from a single run", () => {
    expect(allowedSemesters("wir200", cat)).toEqual(["WiSe22/23"]);
    expect(allowedSemesters("inf400", cat)).toBeNull();
  });

  it("describes the offering pattern", () => {
    expect(offeringPattern("wir100", cat)).toEqual({ pattern: "SoSe", count: 3, last: "SoSe24" });
    expect(offeringPattern("inf300", cat)?.pattern).toBe("both");
    expect(offeringPattern("inf400", cat)).toBeNull();
  });

  it("limits semester options to allowed ones, then to the catalog's term", () => {
    expect(semesterOptionsFor("wir200 - Econometrics", cat)).toEqual(["WiSe22/23"]);
    const anyTerm = semesterOptionsFor("inf400 - Databases", cat);
    expect(anyTerm.length).toBe(allSemesters().length);
  });

  it("defaults to the next allowed semester", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-10T12:00:00"));
    expect(defaultSemesterFor("wir100 - x", cat)).toBe("SoSe24");
    expect(defaultSemesterFor("inf300 - x", cat)).toBe("WiSe23/24");
  });
});

describe("migrateCourseNames", () => {
  it("follows catalog renames by code and leaves others alone", () => {
    const old = course("wir101 - Old Macro Title", "economics", "SoSe23", "completed", "2.0");
    const custom = course("My own seminar", "additional", "SoSe23", "planned");
    const [a, b] = migrateCourseNames([old, custom], cat);
    expect(a.name).toBe("wir101 - Macro Theory");
    expect(a.id).toBe(old.id);
    expect(b).toBe(custom);
  });
});
