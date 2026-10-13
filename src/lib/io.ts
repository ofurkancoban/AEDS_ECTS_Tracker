import { codeOf, courseInfo, labelForCode, parseCSV } from "./catalog";
import { CATEGORY_IDS, STATUSES, defaultEctsFor } from "./constants";
import { normalizeGrade } from "./sanitize";
import { newId } from "./storage";
import type { CategoryId, Course, Status } from "./types";

const CSV_FIELDS = ["category", "name", "ects", "semester", "status", "grade", "professor", "examType", "notes"] as const;

export function coursesToCsv(courses: Course[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = courses.map((c) => CSV_FIELDS.map((f) => esc(c[f])).join(","));
  return [CSV_FIELDS.join(","), ...rows].join("\n");
}

export function newCourse(fields: Pick<Course, "category" | "name" | "ects" | "semester"> & Partial<Course>): Course {
  const info = courseInfo(fields.name, fields.ects);
  return {
    id: newId(),
    homeCategory: fields.category,
    status: "planned",
    grade: "",
    notes: "",
    professor: info?.professor || "",
    examType: info?.examType || "",
    language: info?.language || "",
    contactHours: info?.contactHours ?? null,
    workloadHours: info?.workloadHours ?? null,
    skills: info?.skills || "",
    studipLink: info?.studipLink || "",
    offeringType: info?.offeringType ?? null,
    compulsory: info ? !!info.compulsory : null,
    hypothetical: false,
    ...fields,
  };
}

export function coursesFromCsv(text: string): { courses: Course[]; skipped: number } {
  // Excel in German locales saves CSV with ";" and decimal commas.
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = parseCSV(text.replace(/^\uFEFF/, ""), delimiter).filter((r) => r.some((f) => f.trim() !== ""));
  if (!rows.length) return { courses: [], skipped: 0 };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (k: string) => head.indexOf(k.toLowerCase());
  const [ci, ni, ei, si, sti, gi, pi, xi, noi] = ["category", "name", "ects", "semester", "status", "grade", "professor", "examtype", "notes"].map(col);
  const courses: Course[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const category = (ci >= 0 ? r[ci] || "" : "").trim() as CategoryId;
    const name = (ni >= 0 ? r[ni] || "" : "").trim();
    const ects = ei >= 0 ? parseFloat((r[ei] || "").replace(",", ".")) : NaN;
    if (!CATEGORY_IDS.includes(category) || !name || !ects) {
      skipped++;
      continue;
    }
    const rawStatus = (sti >= 0 ? r[sti] || "" : "planned").trim();
    const status: Status = (STATUSES as string[]).includes(rawStatus) ? (rawStatus as Status) : "planned";
    const c = newCourse({
      category,
      name,
      ects,
      semester: si >= 0 && r[si] ? r[si].trim() : "Unscheduled",
      status,
      grade: gi >= 0 ? normalizeGrade(r[gi]) : "",
      notes: noi >= 0 ? (r[noi] || "").trim() : "",
    });
    if (pi >= 0 && r[pi]) c.professor = r[pi].trim();
    if (xi >= 0 && r[xi]) c.examType = r[xi].trim();
    courses.push(c);
  }
  return { courses, skipped };
}

// Compact share format (one course per line: cat~code~ects~semester~status~grade),
// identical to the classic UI so its QR codes / #qrimport links keep working.
const CAT_TO_CHAR: Record<string, string> = {
  economics: "e",
  empirical: "m",
  datascience: "d",
  specialization: "s",
  thesis: "t",
  further: "f",
  additional: "a",
};
const CHAR_TO_CAT = Object.fromEntries(Object.entries(CAT_TO_CHAR).map(([k, v]) => [v, k])) as Record<string, CategoryId>;
const STATUS_TO_CHAR: Record<Status, string> = { planned: "p", "in-progress": "i", completed: "c" };
const CHAR_TO_STATUS = Object.fromEntries(Object.entries(STATUS_TO_CHAR).map(([k, v]) => [v, k])) as Record<string, Status>;

export function encodeShare(courses: Course[]): string {
  return courses
    .map((c) =>
      [CAT_TO_CHAR[c.category] || "s", codeOf(c.name) || c.name, c.ects, c.semester, STATUS_TO_CHAR[c.status] || "p", c.grade || ""].join("~"),
    )
    .join("\n");
}

export function decodeShare(text: string): Course[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("~");
      if (parts.length < 6) return null;
      const [cc, ref, ects, semester, st, grade] = parts;
      const category = CHAR_TO_CAT[cc] || "specialization";
      const name = /^[a-z]+\d+$/i.test(ref) ? labelForCode(ref.toLowerCase()) : ref;
      return newCourse({
        category,
        name,
        ects: parseFloat(ects) || defaultEctsFor(category),
        semester,
        status: CHAR_TO_STATUS[st] || "planned",
        grade,
      });
    })
    .filter((c): c is Course => !!c);
}

export function shareUrl(payload: string): string | null {
  try {
    const base = window.location.origin + window.location.pathname;
    if (base && !base.startsWith("null")) return base + "#qrimport=" + encodeURIComponent(payload);
  } catch {
    /* ignore */
  }
  return null;
}

export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
}
