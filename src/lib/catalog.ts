import { useSyncExternalStore } from "react";
import fallbackCsv from "../../catalog.csv?raw";
import type { CategoryId, Course } from "./types";
import { allSemesters, currentSemester } from "./semesters";

export interface CatalogCourse {
  code: string;
  name: string;
  label: string; // "code - name", the form stored in Course.name
  category: CategoryId;
  ects: number;
  compulsory: boolean;
  offering: string | null; // generic "WiSe" / "SoSe" pattern
  language: string;
  professor: string;
  examType: string;
  contactHours: number | null;
  link: string;
  skills: string;
}

export interface Catalog {
  courses: CatalogCourse[];
  byCode: Map<string, CatalogCourse>;
  /** Labels per catalog category, in catalog order. */
  lists: Partial<Record<CategoryId, string[]>>;
  compulsory: string[];
  compulsoryByCategory: Partial<Record<CategoryId, string[]>>;
  /** Code -> semesters it ran (plus confirmed extra ones), chronological. */
  offered: Record<string, string[]>;
  codeLookup: Record<string, string>;
  lastModified: string;
  newCodes: string[];
  source: "embedded" | "fetched";
}

export function parseCSV(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeKey(x: string): string {
  return x.toLowerCase().replace(/[’´`]/g, "'");
}

// Contact hours that differ from the usual 56h, for modules whose catalog row
// doesn't say (kept from the classic UI's built-in data).
const CONTACT_HOUR_OVERRIDES: Record<string, number> = { inf962: 84, mam: 28, wir751: 0, wir752: 0, wir753: 0 };

export function buildCatalog(csvText: string, lastModified: string, source: Catalog["source"]): Catalog {
  const rows = parseCSV(csvText);
  const head = rows[0] || [];
  const courses: CatalogCourse[] = [];
  const lists: Catalog["lists"] = {};
  const offered: Record<string, string[]> = {};
  const extra: Record<string, string[]> = {};
  const codeLookup: Record<string, string> = {};
  const compulsory: string[] = [];
  const compulsoryByCategory: Catalog["compulsoryByCategory"] = {};

  for (let r = 1; r < rows.length; r++) {
    const rec: Record<string, string> = {};
    head.forEach((h, c) => (rec[h] = rows[r][c] || ""));
    const code = rec.code;
    const category = rec.category as CategoryId;
    if (!code || !category) continue;
    const label = `${code} - ${rec.name}`;
    const contact = rec.contact_hours !== "" ? parseInt(rec.contact_hours, 10) : null;
    const course: CatalogCourse = {
      code,
      name: rec.name,
      label,
      category,
      ects: parseFloat(rec.ects) || (category === "thesis" ? 30 : 6),
      compulsory: !!rec.compulsory,
      offering: rec.offering || null,
      language: rec.language || "",
      professor: rec.professor || "",
      examType: rec.exam_type || "",
      contactHours: contact !== null && !isNaN(contact) ? contact : null,
      link: rec.studip_link || "",
      skills: rec.skills || "",
    };
    courses.push(course);
    (lists[category] = lists[category] || []).push(label);
    if (rec.semesters_offered) offered[code] = rec.semesters_offered.split(";").filter(Boolean);
    if (rec.extra_semesters) extra[code] = rec.extra_semesters.split(";").filter(Boolean);
    codeLookup[normalizeKey(label)] = code;
    codeLookup[normalizeKey(rec.name)] = code;
    codeLookup[code.toLowerCase()] = code;
    if (course.compulsory) {
      compulsory.push(code);
      (compulsoryByCategory[category] = compulsoryByCategory[category] || []).push(code);
    }
  }

  const order = allSemesters();
  for (const code of Object.keys(extra)) {
    const merged = (offered[code] || []).slice();
    for (const s of extra[code]) if (!merged.includes(s)) merged.push(s);
    merged.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    offered[code] = merged;
  }

  return {
    courses,
    byCode: new Map(courses.map((c) => [c.code.toLowerCase(), c])),
    lists,
    compulsory,
    compulsoryByCategory,
    offered,
    codeLookup,
    lastModified,
    newCodes: [],
    source,
  };
}

// ---- store -----------------------------------------------------------------

let current: Catalog = buildCatalog(fallbackCsv, "", "embedded");
const listeners = new Set<() => void>();

function setCatalog(next: Catalog) {
  current = next;
  listeners.forEach((l) => l());
}

export function getCatalog(): Catalog {
  return current;
}

export function useCatalog(): Catalog {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

function computeNewCodes(cat: Catalog): string[] {
  try {
    const codes = cat.courses.map((c) => c.code);
    const seen = JSON.parse(localStorage.getItem("catalogCodesSeen") || "null");
    localStorage.setItem("catalogCodesSeen", JSON.stringify(codes));
    return Array.isArray(seen) ? codes.filter((c) => !seen.includes(c)) : [];
  } catch {
    return [];
  }
}

/** Fetches the live catalog.csv, falling back to the copy bundled at build time. */
export async function loadCatalog(): Promise<void> {
  try {
    const res = await fetch("catalog.csv", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    const cat = buildCatalog(text, res.headers.get("Last-Modified") || "", "fetched");
    if (!cat.courses.length) throw new Error("empty catalog");
    cat.newCodes = computeNewCodes(cat);
    setCatalog(cat);
  } catch {
    const cat = { ...current, newCodes: computeNewCodes(current) };
    setCatalog(cat);
  }
}

// ---- lookups ---------------------------------------------------------------

/** "wir821 - Title" -> "wir821" (lowercase), else null. */
export function codeOf(name: string | undefined | null): string | null {
  const m = /^([A-Za-z]+\d+)\s*-\s*/.exec(name || "");
  return m ? m[1].toLowerCase() : null;
}

/** Code from a label, a bare code, or an exact catalog title. */
export function resolveCode(name: string, cat = current): string | null {
  const x = normalizeKey((name || "").trim());
  if (!x) return null;
  const m = /^([a-z]+\d+)\s*-\s*/.exec(x);
  if (m) return m[1];
  const hit = cat.codeLookup[x];
  return hit ? hit.toLowerCase() : null;
}

export function catalogCourse(code: string | null, cat = current): CatalogCourse | null {
  return code ? cat.byCode.get(code.toLowerCase()) || null : null;
}

export function labelForCode(code: string, cat = current): string {
  return catalogCourse(code, cat)?.label || code;
}

export function isCompulsory(code: string | null, cat = current): boolean {
  return !!code && cat.compulsory.includes(code);
}

/** Autocomplete pool for adding to a category (Specialization accepts the other electives too). */
export function addablePool(category: CategoryId, cat = current): string[] {
  const l = cat.lists;
  if (category === "specialization")
    return [...(l.specialization || []), ...(l.economics || []), ...(l.empirical || []), ...(l.datascience || [])];
  if (category === "thesis") return l.thesis && l.thesis.length ? l.thesis : ["mam - Master's Degree Module"];
  if (category === "additional")
    return Object.values(l).flatMap((x) => x || []);
  return l[category] || [];
}

/** A category's own modules (no cross-listing), used for planning. */
export function ownPool(category: CategoryId, cat = current): string[] {
  if (category === "thesis") return cat.lists.thesis && cat.lists.thesis.length ? cat.lists.thesis : ["mam - Master's Degree Module"];
  return cat.lists[category] || [];
}

/** Metadata stored on a newly added course (the classic UI's _s()). */
export function courseInfo(name: string, ects: number, cat = current): Partial<Course> | null {
  const code = codeOf(name) || resolveCode(name, cat);
  if (!code) return null;
  const c = catalogCourse(code, cat);
  const contact = c?.contactHours ?? CONTACT_HOUR_OVERRIDES[code] ?? 56;
  return {
    language: c?.language || "English",
    contactHours: contact,
    workloadHours: ects * 30,
    professor: c?.professor || "",
    examType: c?.examType || "",
    skills: c?.skills || "",
    studipLink: c?.link || "",
    offeringType: c?.offering || null,
    compulsory: cat.compulsory.includes(code),
  };
}

/**
 * Index of the latest semester the catalog actually has data for (the one
 * with >= 5 modules recorded) - offerings after it are predictions.
 */
export function dataHorizonIndex(cat = current): number {
  const ds = allSemesters();
  const count: Record<string, number> = {};
  Object.values(cat.offered).forEach((list) => list.forEach((s) => (count[s] = (count[s] || 0) + 1)));
  let last = -1;
  for (const s of Object.keys(count)) if (count[s] >= 5) last = Math.max(last, ds.indexOf(s));
  return last;
}

/** Semesters a course can be scheduled in: its real offerings plus up to 3 predicted ones. */
export function allowedSemesters(code: string | null, cat = current): string[] | null {
  if (!code) return null;
  const list = cat.offered[code];
  if (!list || !list.length) return null;
  const ds = allSemesters();
  const lastIdx = dataHorizonIndex(cat);
  const wn = list.filter((x) => x.startsWith("WiSe")).length;
  const sn = list.length - wn;
  const out = list.slice();
  let added = 0;
  for (let i = lastIdx + 1; i < ds.length && added < 3; i++) {
    const t = ds[i].slice(0, 4);
    const fits = (t === "WiSe" && wn >= 2) || (t === "SoSe" && sn >= 2) || (wn > 0 && sn > 0);
    if (fits && !out.includes(ds[i])) {
      out.push(ds[i]);
      added++;
    }
  }
  return out;
}

export interface OfferingPattern {
  pattern: "both" | "WiSe" | "SoSe";
  count: number;
  last: string;
}

export function offeringPattern(code: string | null, cat = current): OfferingPattern | null {
  if (!code) return null;
  const list = cat.offered[code];
  if (!list || !list.length) return null;
  const wn = list.filter((x) => x.startsWith("WiSe")).length;
  const sn = list.length - wn;
  return { pattern: wn && sn ? "both" : wn ? "WiSe" : "SoSe", count: list.length, last: list[list.length - 1] };
}

/** Semester dropdown options for a course name, as the classic add-course form offered them. */
export function semesterOptionsFor(name: string, cat = current): string[] {
  const code = resolveCode(name, cat) || codeOf(name);
  const allowed = allowedSemesters(code, cat);
  if (allowed) return allSemesters().filter((s) => allowed.includes(s));
  const pattern = code ? catalogCourse(code, cat)?.offering : null;
  return pattern ? allSemesters().filter((s) => s.startsWith(pattern)) : allSemesters();
}

/** Default semester when picking a catalog course: today's if it runs then, else the next run. */
export function defaultSemesterFor(name: string, cat = current): string {
  const code = resolveCode(name, cat) || codeOf(name);
  const allowed = allowedSemesters(code, cat);
  const cur = currentSemester();
  if (!allowed || !allowed.length) return cur;
  if (allowed.includes(cur)) return cur;
  const ds = allSemesters();
  const ci = ds.indexOf(cur);
  const next = allowed.filter((s) => ds.indexOf(s) >= ci);
  return next.length ? next[0] : allowed[allowed.length - 1];
}

/** Classic UI's catalog-rename migration: stored names follow the catalog's current title by code. */
export function migrateCourseNames(courses: Course[], cat = current): Course[] {
  if (cat.source !== "fetched" && !cat.courses.length) return courses;
  return courses.map((c) => {
    const code = codeOf(c.name);
    if (!code) return c;
    const label = catalogCourse(code, cat)?.label;
    return label && label !== c.name ? { ...c, name: label } : c;
  });
}
