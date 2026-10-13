// "Sync from StudIP": parses a copied StuMS achievements page and matches its
// finished modules to the student's courses by module number (StuMS truncates
// long titles, so titles are only a fallback).
import { allowedSemesters, codeOf, ownPool } from "./catalog";
import { allSemesters, currentSemester } from "./semesters";
import type { CategoryId, Course } from "./types";

export interface StumsRow {
  number: string;
  title: string;
  grade: string;
  status: "passed" | "not passed";
}

export function normalizeTitle(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/^[a-z]+\d+\s*-\s*/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
}

const SYNC_SCRIPT =
  "(function(){var btn=null;document.querySelectorAll('button, a, input[type=button], input[type=submit]').forEach(function(b){if(!btn){var label=(b.value||b.textContent||'').trim();if(/^expand all$/i.test(label))btn=b}});function finish(){try{var sel=window.getSelection();sel.removeAllRanges();var range=document.createRange();range.selectNodeContents(document.body);sel.addRange(range);var copied=document.execCommand('copy');sel.removeAllRanges();if(copied){alert('StuMS sync: page copied. Go back to the ECTS Tracker, click \"Paste from clipboard\", then \"Match\".')}else{alert('Could not copy automatically, please press Ctrl+A / Cmd+A then Ctrl+C / Cmd+C on this page instead.')}}catch(e){alert('Could not copy automatically, please press Ctrl+A / Cmd+A then Ctrl+C / Cmd+C on this page instead.')}}if(btn){btn.click();setTimeout(finish,1500)}else{finish()}})();";

export const BOOKMARKLET = "javascript:" + encodeURIComponent(SYNC_SCRIPT);

export const STUDIP_URL = "https://elearning.uni-oldenburg.de";
export const STUMS_URL =
  "https://stums.uni-oldenburg.de/qisserver/pages/sul/examAssessment/personExamsReadonly.xhtml?_flowId=examsOverviewForPerson-flow&navigationPosition=hisinoneMeinStudium%2CexamAssessmentForStudent&recordRequest=true";

/** Finished modules (passed or not passed, with a grade) from pasted StuMS text. */
export function parseStums(text: string): StumsRow[] {
  const TYPE_PREFIXES = ["examination regulations", "module group", "examination", "module"];
  const GRADE_RE = /^[1-5][.,]\d$/;
  const STATUS_MAP: Record<string, StumsRow["status"]> = { BE: "passed", NB: "not passed" };
  type Raw = { title: string; grade: string; status: StumsRow["status"] | null; attempt: number };
  const groups: Record<string, { moduleRow: Raw | null; examRows: Raw[] }> = {};

  (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .forEach((line) => {
      const t = line.trim();
      if (!t) return;
      const fields = t
        .split(/\t+| {2,}/)
        .map((f) => f.trim())
        .filter((f) => f !== "");
      if (fields.length < 3) return;
      const typeField = fields[1] || "";
      let type: string | null = null;
      let title = "";
      for (const p of TYPE_PREFIXES) {
        if (typeField.indexOf(p) === 0) {
          type = p;
          title = typeField.slice(p.length).trim();
          break;
        }
      }
      if ((type !== "module" && type !== "examination") || !title) return;
      const number = /^\d+$/.test(fields[2]) ? fields[2] : null;
      if (!number) return;
      const attempt = fields[3] && /^\d+$/.test(fields[3]) ? parseInt(fields[3], 10) : 0;
      let grade = "";
      let status: StumsRow["status"] | null = null;
      for (let j = 2; j < fields.length; j++) {
        if (!grade && GRADE_RE.test(fields[j])) grade = fields[j].replace(",", ".");
        if (!status && Object.prototype.hasOwnProperty.call(STATUS_MAP, fields[j])) status = STATUS_MAP[fields[j]];
      }
      const row: Raw = { title, grade, status, attempt };
      if (!groups[number]) groups[number] = { moduleRow: null, examRows: [] };
      if (type === "module") {
        if (!groups[number].moduleRow) groups[number].moduleRow = row;
      } else groups[number].examRows.push(row);
    });

  const out: StumsRow[] = [];
  Object.keys(groups).forEach((number) => {
    const g = groups[number];
    let chosen = g.moduleRow;
    if (!chosen && g.examRows.length) chosen = g.examRows.reduce<Raw | null>((best, r) => (!best || r.attempt >= best.attempt ? r : best), null);
    if (!chosen) return;
    const status = chosen.status;
    if (status !== "passed" && status !== "not passed") return;
    const grade = chosen.grade ? chosen.grade : status === "not passed" ? "5.0" : "";
    if (!grade) return;
    out.push({ number, title: chosen.title, grade, status });
  });
  return out;
}

const POOL_CATEGORIES: CategoryId[] = ["economics", "empirical", "datascience", "specialization", "thesis", "further"];

/** Catalog module whose code digits match the end of a StuMS module number. */
export function resolveCatalog(number: string): { category: CategoryId; name: string } | null {
  if (!number) return null;
  for (const cat of POOL_CATEGORIES) {
    for (const full of ownPool(cat)) {
      const code = codeOf(full);
      const d = code ? (/\d+$/.exec(code) || [])[0] : null;
      if (d && number.length >= d.length && number.slice(-d.length) === d) return { category: cat, name: full };
    }
  }
  return null;
}

export interface StumsMatch {
  updates: { course: Course; newGrade: string }[];
  additions: { row: StumsRow; category: CategoryId; name: string }[];
  review: StumsRow[];
  unchanged: string[];
}

export function matchStums(rows: StumsRow[], courses: Course[]): StumsMatch {
  const byNorm: Record<string, Course[]> = {};
  const byDigits: Record<string, Course[]> = {};
  courses.forEach((c) => {
    const key = normalizeTitle(c.name);
    if (key) (byNorm[key] = byNorm[key] || []).push(c);
    const code = codeOf(c.name);
    const d = code ? (/\d+$/.exec(code) || [])[0] : null;
    if (d) (byDigits[d] = byDigits[d] || []).push(c);
  });
  const res: StumsMatch = { updates: [], additions: [], review: [], unchanged: [] };
  rows.forEach((row) => {
    let candidates: Course[] = [];
    if (row.number) {
      Object.keys(byDigits).forEach((d) => {
        if (row.number.length >= d.length && row.number.slice(-d.length) === d) candidates = candidates.concat(byDigits[d]);
      });
    }
    if (!candidates.length) {
      const key = normalizeTitle(row.title);
      candidates = (byNorm[key] || []).slice();
      if (!candidates.length && key) {
        courses.forEach((c) => {
          const cn = normalizeTitle(c.name);
          if (cn && (cn.indexOf(key) === 0 || key.indexOf(cn) === 0)) candidates.push(c);
        });
      }
    }
    if (candidates.length === 1) {
      const c = candidates[0];
      if ((c.grade || "") === row.grade) res.unchanged.push(row.title);
      else res.updates.push({ course: c, newGrade: row.grade });
    } else if (!candidates.length) {
      const resolved = resolveCatalog(row.number);
      if (resolved) res.additions.push({ row, ...resolved });
      else res.review.push(row);
    } else res.review.push(row);
  });
  return res;
}

/** Semesters a synced (already finished) module can be dated to: past offerings up to now. */
export function pastSemestersFor(name: string): string[] {
  const ds = allSemesters();
  const cur = ds.indexOf(currentSemester());
  const code = codeOf(name);
  const allowed = code ? allowedSemesters(code) : null;
  const pool = allowed && allowed.length ? allowed : ds;
  const upToNow = (s: string) => {
    const i = ds.indexOf(s);
    return i >= 0 && (cur < 0 || i <= cur);
  };
  const opts = pool.filter(upToNow);
  return opts.length ? opts : ds.filter(upToNow);
}
