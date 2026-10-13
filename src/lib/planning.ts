// Planning algorithms, ported one-to-one from the classic UI so both give the
// same answers: graduation path simulation, next-semester options, "open now"
// panel, last-chance and no-longer-offered warnings.
import type { Catalog } from "./catalog";
import { codeOf, dataHorizonIndex, ownPool, offeringPattern, resolveCode } from "./catalog";
import { CATEGORIES, MAX_ECTS_PER_SEMESTER } from "./constants";
import { allSemesters, currentSemester } from "./semesters";
import type { Stats } from "./stats";
import { isFail } from "./stats";
import type { CategoryId, Course } from "./types";

export interface PlanItem {
  label: string;
  ects: number;
  compulsory: boolean;
  predicted: boolean; // assumes the usual WiSe/SoSe rhythm, not a confirmed offering
  already?: boolean; // already planned by the student
  category?: CategoryId;
}

export interface PlanTerm {
  semester: string;
  items: PlanItem[];
}

const COURSE_CATS: CategoryId[] = ["economics", "empirical", "datascience", "specialization"];

function takenCodes(courses: Course[], cat: Catalog): Record<string, true> {
  const taken: Record<string, true> = {};
  courses.forEach((c) => {
    if (c.hypothetical) return;
    const rc = resolveCode(c.name, cat) || codeOf(c.name);
    if (rc) taken[rc] = true;
  });
  return taken;
}

function offeringOracle(cat: Catalog) {
  const ds = allSemesters();
  const lastIdx = dataHorizonIndex(cat);
  const offeredIn = (rc: string, label: string): boolean => {
    const L = cat.offered[rc];
    if (!L || !L.length) return false;
    if (L.includes(label)) return true;
    if (ds.indexOf(label) <= lastIdx) return false;
    const term = label.slice(0, 4);
    return L.filter((x) => x.slice(0, 4) === term).length >= 2;
  };
  const isPredicted = (rc: string, label: string) => !(cat.offered[rc] && cat.offered[rc].includes(label));
  return { offeredIn, isPredicted };
}

function homeOf(rc: string, cat: Catalog): CategoryId | null {
  for (const k of ["economics", "empirical", "datascience"] as CategoryId[]) {
    if (ownPool(k, cat).some((x) => codeOf(x) === rc)) return k;
  }
  return null;
}

function poolFor(catk: CategoryId, cat: Catalog): string[] {
  return catk === "specialization"
    ? [...ownPool("specialization", cat), ...ownPool("economics", cat), ...ownPool("empirical", cat), ...ownPool("datascience", cat)]
    : ownPool(catk, cat);
}

function remainingByCategory(stats: Stats): Record<string, number> {
  const rem: Record<string, number> = {};
  stats.categories.forEach((c) => {
    if (!c.excludedFromTotal) rem[c.id] = Math.max(0, c.remaining || 0);
  });
  return rem;
}

function missingCompulsoryCodes(stats: Stats, taken: Record<string, true>): Record<string, string> {
  const missing: Record<string, string> = {};
  stats.missingCompulsory.forEach((lb) => {
    const rc = codeOf(lb);
    if (rc && !taken[rc]) missing[rc] = lb;
  });
  return missing;
}

/** Fill one term: missing compulsory courses first, then electives per category. */
function fillTerm(
  label: string,
  budget: number,
  rem: Record<string, number>,
  missing: Record<string, string>,
  taken: Record<string, true>,
  used: Record<string, true>,
  cat: Catalog,
  oracle: ReturnType<typeof offeringOracle>,
  reverse = false,
): PlanItem[] {
  const items: PlanItem[] = [];
  for (const rc of Object.keys(missing)) {
    if (budget < 6 || !oracle.offeredIn(rc, label)) continue;
    const home = homeOf(rc, cat);
    const tcat = home && rem[home] > 0 ? home : rem.specialization > 0 ? "specialization" : home;
    if (!tcat || (rem[tcat] <= 0 && tcat !== "specialization")) continue;
    items.push({ label: missing[rc], ects: 6, compulsory: true, predicted: oracle.isPredicted(rc, label), category: tcat });
    if (rem[tcat] > 0) rem[tcat] -= 6;
    budget -= 6;
    used[rc] = true;
    delete missing[rc];
  }
  const cats = reverse ? COURSE_CATS.slice().reverse() : COURSE_CATS;
  for (const catk of cats) {
    if (rem[catk] <= 0) continue;
    let pool = poolFor(catk, cat).slice();
    if (reverse) pool = pool.reverse();
    for (const lb of pool) {
      if (budget < 6 || rem[catk] <= 0) break;
      const rc = codeOf(lb);
      if (!rc || taken[rc] || used[rc] || missing[rc]) continue;
      if (cat.compulsory.includes(rc) && catk === "specialization") continue;
      if (!oracle.offeredIn(rc, label)) continue;
      if (items.some((it) => it.label === lb)) continue;
      items.push({ label: lb, ects: 6, compulsory: false, predicted: oracle.isPredicted(rc, label), category: catk });
      rem[catk] -= 6;
      budget -= 6;
      used[rc] = true;
    }
  }
  return items;
}

export interface GraduationPath {
  terms: PlanTerm[];
  finished: boolean;
  anyPredicted: boolean;
}

/** Semester-by-semester schedule for everything still required (30 ECTS cap). */
export function graduationPath(courses: Course[], stats: Stats, cat: Catalog): GraduationPath | null {
  if (!Object.keys(cat.offered).length) return null;
  const ds = allSemesters();
  const start = ds.indexOf(currentSemester());
  if (start < 0) return null;
  const taken = takenCodes(courses, cat);
  const rem = remainingByCategory(stats);
  const total = Object.values(rem).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const missing = missingCompulsoryCodes(stats, taken);
  let latestCommitted = -1;
  courses.forEach((c) => {
    if (c.hypothetical || (c.status !== "planned" && c.status !== "in-progress")) return;
    latestCommitted = Math.max(latestCommitted, ds.indexOf(c.semester));
  });
  const oracle = offeringOracle(cat);
  const terms: PlanTerm[] = [];
  const used: Record<string, true> = {};
  let finished = false;
  let idx = Math.max(start, latestCommitted + 1);
  for (let step = 0; step < 12 && !finished; step++, idx++) {
    const label = ds[idx];
    if (!label) break;
    const otherRem = Object.keys(rem).filter((k) => k !== "thesis").reduce((a, k) => a + rem[k], 0);
    if (otherRem <= 0 && Object.keys(missing).length === 0) {
      const items: PlanItem[] = [];
      if (rem.thesis > 0) {
        items.push({ label: "mam - Master's Degree Module", ects: rem.thesis, compulsory: false, predicted: false, category: "thesis" });
        rem.thesis = 0;
      }
      terms.push({ semester: label, items });
      finished = true;
      break;
    }
    const items = fillTerm(label, MAX_ECTS_PER_SEMESTER, rem, missing, taken, used, cat, oracle);
    if (items.length) terms.push({ semester: label, items });
  }
  return { terms, finished, anyPredicted: terms.some((t) => t.items.some((i) => i.predicted)) };
}

export interface NextSemesterPlan {
  semester: string;
  optionA: PlanItem[];
  optionB: PlanItem[];
}

/** Two alternative selections for the upcoming semester, starting from what's already planned. */
export function nextSemesterPlans(courses: Course[], stats: Stats, cat: Catalog): NextSemesterPlan | null {
  if (!Object.keys(cat.offered).length) return null;
  const ds = allSemesters();
  const si = ds.indexOf(currentSemester());
  if (si < 0) return null;
  const label = ds[si + 1];
  if (!label) return null;
  const taken = takenCodes(courses, cat);
  const rem = remainingByCategory(stats);
  const missing = missingCompulsoryCodes(stats, taken);
  const labelIdx = ds.indexOf(label);
  const already = courses.filter((c) => {
    if (c.hypothetical || c.status !== "planned") return false;
    if (c.semester === label || c.semester === "Unscheduled") return true;
    const i = ds.indexOf(c.semester);
    return i >= 0 && i <= labelIdx;
  });
  const alreadyEcts = already.reduce((a, c) => a + (c.ects || 0), 0);
  const alreadyItems: PlanItem[] = already.map((c) => {
    const rc = resolveCode(c.name, cat) || codeOf(c.name);
    return {
      label: c.name,
      ects: c.ects || 0,
      compulsory: rc ? stats.missingCompulsory.some((h) => codeOf(h) === rc) : false,
      already: true,
      predicted: false,
      category: c.category,
    };
  });
  const oracle = offeringOracle(cat);
  const build = (reverse: boolean) =>
    alreadyItems.concat(
      fillTerm(label, MAX_ECTS_PER_SEMESTER - alreadyEcts, { ...rem }, { ...missing }, taken, {}, cat, oracle, reverse),
    );
  return { semester: label, optionA: build(false), optionB: build(true) };
}

export interface OpenGroup {
  id: CategoryId;
  name: string;
  open: { label: string; compulsory: boolean }[];
}

/** Catalog modules offered in `semester` that the student hasn't added yet. */
export function openInSemester(courses: Course[], semester: string, cat: Catalog): OpenGroup[] {
  const taken = takenCodes(courses, cat);
  const groups: OpenGroup[] = [];
  for (const c of CATEGORIES) {
    const pool = cat.lists[c.id];
    if (!pool) continue;
    const open = pool
      .filter((lb) => {
        const rc = codeOf(lb);
        return !!rc && !!cat.offered[rc] && cat.offered[rc].includes(semester) && !taken[rc];
      })
      .map((lb) => ({ label: lb, compulsory: cat.compulsory.includes(codeOf(lb) || "") }));
    if (open.length) groups.push({ id: c.id, name: c.name, open });
  }
  return groups;
}

/** Missing compulsory courses that run now but usually only once a year. */
export function lastChanceCourses(stats: Stats, cat: Catalog): { label: string; pattern: string }[] {
  const cur = currentSemester();
  return stats.missingCompulsory
    .map((lb) => {
      const rc = codeOf(lb);
      if (!rc || !cat.offered[rc] || !cat.offered[rc].includes(cur)) return null;
      const p = offeringPattern(rc, cat);
      return p && p.pattern !== "both" ? { label: lb, pattern: p.pattern as string } : null;
    })
    .filter((x): x is { label: string; pattern: string } => !!x);
}

/** Planned/in-progress electives whose last known offering is already in the past. */
export function notOfferedAnymore(courses: Course[], cat: Catalog): { course: Course; last: string }[] {
  const ds = allSemesters();
  const ci = ds.indexOf(currentSemester());
  return courses
    .map((c) => {
      if (c.hypothetical || c.status === "completed") return null;
      const rc = resolveCode(c.name, cat) || codeOf(c.name);
      if (!rc || cat.compulsory.includes(rc) || !cat.offered[rc] || !cat.offered[rc].length) return null;
      const last = cat.offered[rc][cat.offered[rc].length - 1];
      const li = ds.indexOf(last);
      return li > -1 && li < ci ? { course: c, last } : null;
    })
    .filter((x): x is { course: Course; last: string } => !!x);
}

export { isFail };
