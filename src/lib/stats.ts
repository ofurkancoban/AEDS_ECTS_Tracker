import type { Catalog } from "./catalog";
import { codeOf, labelForCode } from "./catalog";
import { BACKUP_REMINDER_DAYS, CATEGORIES, TOTAL_REQUIRED } from "./constants";
import { allSemesters, sortBySemester } from "./semesters";
import type { Category, Course } from "./types";

export function isFail(c: Course): boolean {
  if (!c.grade) return false;
  const g = parseFloat(c.grade);
  return !isNaN(g) && g > 4;
}

function gpaOf(list: Course[]): { points: number; ects: number; gpa: string | null } {
  const points = list.reduce((a, c) => a + c.ects * parseFloat(c.grade), 0);
  const ects = list.reduce((a, c) => a + c.ects, 0);
  return { points, ects, gpa: ects > 0 ? (Math.round((points / ects) * 100) / 100).toFixed(2) : null };
}

const graded = (c: Course) => c.status === "completed" && !!parseFloat(c.grade) && !isFail(c);

export interface CategoryStats extends Category {
  items: Course[];
  completed: number;
  inProgress: number;
  planned: number;
  gpa: string | null;
  compulsoryCodes: string[];
  compulsoryDone: number;
  remaining: number; // after completed + in progress + planned
}

export interface Stats {
  categories: CategoryStats[];
  completed: number;
  inProgress: number;
  planned: number;
  remaining: number;
  gpa: string | null;
  gradePoints: number;
  gradedEcts: number;
  projectedGpa: string | null;
  requiredAverage: number | null; // to reach the target GPA
  remainingGradedEcts: number;
  semesterGpa: { semester: string; avg: number }[];
  gradeBuckets: { label: string; count: number }[];
  daysLeft: number | null;
  compulsoryDone: string[];
  compulsoryAny: string[];
  missingCompulsory: string[]; // labels
  missingGrades: Course[];
  graduationReady: boolean;
  ectsMet: boolean;
  nothingOutstanding: boolean;
  attempts: Map<string, number>;
  backupDaysAgo: number | null;
  needsBackupReminder: boolean;
}

export const GRADE_BUCKETS = ["1.0 - 1.5", "1.6 - 2.0", "2.1 - 2.5", "2.6 - 3.0", "3.1 - 4.0", "Fail"];

function gradeBucket(grade: string): string | null {
  const n = parseFloat(grade);
  if (!n) return null;
  if (n <= 1.5) return "1.0 - 1.5";
  if (n <= 2) return "1.6 - 2.0";
  if (n <= 2.5) return "2.1 - 2.5";
  if (n <= 3) return "2.6 - 3.0";
  if (n <= 4) return "3.1 - 4.0";
  return "Fail";
}

/** Attempt number per course id, for courses added more than once (retakes). */
export function attemptNumbers(courses: Course[]): Map<string, number> {
  const order = allSemesters();
  const byName = new Map<string, { id: string; semester: string; index: number }[]>();
  courses.forEach((c, index) => {
    if (c.hypothetical) return;
    const key = c.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push({ id: c.id, semester: c.semester, index });
  });
  const out = new Map<string, number>();
  byName.forEach((list) => {
    if (list.length < 2) return;
    [...list]
      .sort((a, b) => {
        const ia = order.indexOf(a.semester);
        const ib = order.indexOf(b.semester);
        const pa = ia === -1 ? Infinity : ia;
        const pb = ib === -1 ? Infinity : ib;
        return pa !== pb ? pa - pb : a.index - b.index;
      })
      .forEach((x, i) => out.set(x.id, i + 1));
  });
  return out;
}

export function computeStats(
  courses: Course[],
  catalog: Catalog,
  opts: { targetGrade: string; graduationDate: string; lastBackupAt: string | null; backupReminderDismissed: boolean },
): Stats {
  const real = courses.filter((c) => !c.hypothetical);
  const doneCode = (code: string) => real.some((c) => c.status === "completed" && !isFail(c) && codeOf(c.name) === code);

  const categories: CategoryStats[] = CATEGORIES.map((cat) => {
    const items = sortBySemester(courses.filter((c) => c.category === cat.id));
    const own = items.filter((c) => !c.hypothetical);
    const completed = own.filter((c) => c.status === "completed" && !isFail(c)).reduce((a, c) => a + c.ects, 0);
    const inProgress = own.filter((c) => c.status === "in-progress").reduce((a, c) => a + c.ects, 0);
    const planned = own.filter((c) => c.status === "planned").reduce((a, c) => a + c.ects, 0);
    const compulsoryCodes = catalog.compulsoryByCategory[cat.id] || [];
    return {
      ...cat,
      items,
      completed,
      inProgress,
      planned,
      gpa: gpaOf(own.filter(graded)).gpa,
      compulsoryCodes,
      compulsoryDone: compulsoryCodes.filter(doneCode).length,
      remaining: Math.max(0, cat.required - completed - inProgress - planned),
    };
  });

  const counted = categories.filter((c) => !c.excludedFromTotal);
  const completed = counted.reduce((a, c) => a + c.completed, 0);
  const inProgress = counted.reduce((a, c) => a + c.inProgress, 0);
  const planned = counted.reduce((a, c) => a + c.planned, 0);

  const realGraded = real.filter((c) => graded(c) && c.category !== "additional");
  const overall = gpaOf(realGraded);
  const hypoGraded = courses.filter((c) => c.hypothetical && graded(c) && c.category !== "additional");
  let projectedGpa: string | null = null;
  if (hypoGraded.length) {
    const all = [...realGraded, ...hypoGraded];
    const pts = all.reduce((a, c) => a + c.ects * parseFloat(c.grade), 0);
    const e = all.reduce((a, c) => a + c.ects, 0);
    projectedGpa = e > 0 ? (pts / e).toFixed(2) : null;
  }

  const remainingGradedEcts = TOTAL_REQUIRED - overall.ects;
  const target = parseFloat(opts.targetGrade);
  const requiredAverage = target && remainingGradedEcts > 0 ? (target * TOTAL_REQUIRED - overall.points) / remainingGradedEcts : null;

  const order = allSemesters();
  const bySem: Record<string, Course[]> = {};
  courses.forEach((c) => (bySem[c.semester] = bySem[c.semester] || []).push(c));
  const semesterGpa = Object.keys(bySem)
    .map((sem) => {
      const g = bySem[sem].filter((c) => graded(c) && !c.hypothetical && c.category !== "additional");
      if (!g.length) return null;
      const r = gpaOf(g);
      return r.ects > 0 ? { semester: sem, avg: r.points / r.ects } : null;
    })
    .filter((x): x is { semester: string; avg: number } => !!x)
    .sort((a, b) => {
      const ia = order.indexOf(a.semester);
      const ib = order.indexOf(b.semester);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });

  const counts: Record<string, number> = Object.fromEntries(GRADE_BUCKETS.map((b) => [b, 0]));
  real
    .filter((c) => c.category !== "additional" && c.status === "completed")
    .forEach((c) => {
      const b = gradeBucket(c.grade);
      if (b) counts[b] += 1;
    });

  let daysLeft: number | null = null;
  if (opts.graduationDate) {
    // "YYYY-MM-DD" would parse as UTC midnight; compare local calendar days instead
    // so the count isn't a day off east of UTC (and across DST changes).
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(opts.graduationDate);
    const target = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(opts.graduationDate);
    target.setHours(0, 0, 0, 0);
    const diff = target.getTime() - new Date().setHours(0, 0, 0, 0);
    daysLeft = isNaN(diff) ? null : Math.round(diff / 86400000);
  }

  const compulsoryDone = catalog.compulsory.filter(doneCode);
  const compulsoryAny = catalog.compulsory.filter((code) => real.some((c) => !isFail(c) && codeOf(c.name) === code));
  const missingCompulsory = catalog.compulsory.filter((c) => !compulsoryDone.includes(c)).map((c) => labelForCode(c, catalog));
  const missingGrades = real.filter((c) => c.status === "completed" && (!c.grade || !c.grade.trim()));
  const ectsMet = completed >= TOTAL_REQUIRED;
  const allCompulsory = compulsoryDone.length === catalog.compulsory.length;

  const backupDaysAgo = opts.lastBackupAt ? Math.floor((Date.now() - new Date(opts.lastBackupAt).getTime()) / 86400000) : null;

  return {
    categories,
    completed,
    inProgress,
    planned,
    remaining: Math.max(0, TOTAL_REQUIRED - completed - inProgress - planned),
    gpa: overall.gpa,
    gradePoints: overall.points,
    gradedEcts: overall.ects,
    projectedGpa,
    requiredAverage,
    remainingGradedEcts,
    semesterGpa,
    gradeBuckets: GRADE_BUCKETS.map((label) => ({ label, count: counts[label] })),
    daysLeft,
    compulsoryDone,
    compulsoryAny,
    missingCompulsory,
    missingGrades,
    graduationReady: ectsMet && allCompulsory,
    ectsMet,
    nothingOutstanding:
      missingCompulsory.length === 0 && missingGrades.length === 0 && counted.every((c) => c.remaining <= 0),
    attempts: attemptNumbers(courses),
    backupDaysAgo,
    needsBackupReminder:
      !opts.backupReminderDismissed && courses.length > 0 && (backupDaysAgo === null || backupDaysAgo >= BACKUP_REMINDER_DAYS),
  };
}
