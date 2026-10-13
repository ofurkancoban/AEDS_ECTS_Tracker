// AEDS Assistant client: talks to the AEDS_RAG API and builds the optional
// course-progress context. The context text is parsed on the RAG side (codes
// lines, "Target GPA ... across the next N ECTS"), so its wording must not change.
import type { Passage, SourceRef } from "./citations";
import { codeOf } from "./catalog";
import { CATEGORIES } from "./constants";
import type { Course } from "./types";

export const AEDS_RAG_BASE = "https://aeds-rag-assistant.ofurkan.co";
export const AEDS_RAG_WEB = "https://ofurkancoban.github.io/AEDS_RAG_Assistant/";

export const GREETING =
  "Hey! Think of me as your AEDS know-it-all, ask me about admission, deadlines, courses, or exams, and let's figure it out together.";

export const SUGGESTIONS = ["How many ECTS do I need to graduate?", "Which courses should I take next semester?"];

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
  sources?: SourceRef[];
  retrieval?: Passage[];
  queryLogId?: string | number | null;
  feedbackRating?: 1 | -1;
}

const K = {
  token: "aedsRagToken",
  thread: "aedsRagThreadId",
  messages: "aedsRagMessages",
  include: "aedsRagIncludeCourses",
};

function get(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export function loadMessages(): ChatMessage[] {
  try {
    const raw = get(K.messages);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
export const saveMessages = (m: ChatMessage[]) => set(K.messages, JSON.stringify(m));
export const loadIncludeCourses = () => get(K.include) === "1";
export const saveIncludeCourses = (v: boolean) => set(K.include, v ? "1" : "0");
export const loadThreadId = () => get(K.thread);
export function clearConversation() {
  set(K.messages, null);
  set(K.thread, null);
}

async function ensureToken(): Promise<string> {
  const existing = get(K.token);
  if (existing) return existing;
  const r = await fetch(AEDS_RAG_BASE + "/auth/guest", { method: "POST" });
  if (!r.ok) throw new Error("Could not start a session (" + r.status + ")");
  const data = await r.json();
  set(K.token, data.access_token);
  return data.access_token;
}

export interface ChatResponse {
  answer: string;
  thread_id: string;
  sources?: SourceRef[];
  retrieval?: Passage[];
  query_log_id?: string | number | null;
}

export async function postChat(message: string, retried = false): Promise<ChatResponse> {
  const token = await ensureToken();
  const r = await fetch(AEDS_RAG_BASE + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ message, thread_id: loadThreadId() }),
  });
  if (r.status === 401 && !retried) {
    set(K.token, null);
    return postChat(message, true);
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || "Request failed (" + r.status + ")");
  set(K.thread, body.thread_id);
  return body;
}

export async function sendFeedback(queryLogId: string | number, rating: 1 | -1, retried = false): Promise<void> {
  const token = await ensureToken();
  const r = await fetch(AEDS_RAG_BASE + "/chat/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ query_log_id: queryLogId, rating }),
  });
  if (r.status === 401 && !retried) {
    set(K.token, null);
    return sendFeedback(queryLogId, rating, true);
  }
  if (!r.ok) throw new Error("Feedback request failed (" + r.status + ")");
}

/** Summary of the student's courses that prefixes a question when "Consider my course list" is on. */
export function buildCourseContext(courses: Course[], targetGradeRaw: string): string | null {
  if (!courses.length) return null;
  type Group = { completedEcts: number; completed: string[]; inProgress: string[]; planned: string[]; gradeSum: number; gradeEcts: number };
  const byCat: Record<string, Group> = {};
  const codes: Record<string, true> = {};
  const codesByCat: Record<string, Record<string, true>> = {};
  const plannedByCat: Record<string, Record<string, true>> = {};
  let overallGradeSum = 0;
  let overallGradeEcts = 0;

  courses.forEach((c) => {
    if (c.hypothetical) return;
    const isFail = c.status === "completed" && parseFloat(c.grade) > 4;
    const cat = c.category || "additional";
    if (!byCat[cat]) byCat[cat] = { completedEcts: 0, completed: [], inProgress: [], planned: [], gradeSum: 0, gradeEcts: 0 };
    const code = codeOf(c.name);
    const addCode = () => {
      if (!code) return;
      codes[code] = true;
      (codesByCat[cat] = codesByCat[cat] || {})[code] = true;
    };
    if (c.status === "completed" && !isFail) {
      byCat[cat].completedEcts += c.ects || 0;
      byCat[cat].completed.push(c.name);
      addCode();
      const grade = parseFloat(c.grade);
      if (grade) {
        byCat[cat].gradeSum += (c.ects || 0) * grade;
        byCat[cat].gradeEcts += c.ects || 0;
        if (cat !== "additional") {
          overallGradeSum += (c.ects || 0) * grade;
          overallGradeEcts += c.ects || 0;
        }
      }
    } else if (c.status === "in-progress") {
      byCat[cat].inProgress.push(c.name);
      addCode();
    } else if (c.status === "planned") {
      byCat[cat].planned.push(c.name);
      if (code) (plannedByCat[cat] = plannedByCat[cat] || {})[code] = true;
    }
  });

  const lines: string[] = [];
  let totalCompleted = 0;
  CATEGORIES.forEach((z) => {
    const g = byCat[z.id];
    if (!g) return;
    // Additional courses are listed but, as in the tracker, don't count toward the 120.
    if (!z.excludedFromTotal) totalCompleted += g.completedEcts;
    const parts: string[] = [];
    if (g.completed.length) parts.push("completed: " + g.completed.join("; "));
    if (g.inProgress.length) parts.push("in progress: " + g.inProgress.join("; "));
    if (g.planned.length) parts.push("planned: " + g.planned.join("; "));
    if (g.gradeEcts > 0) parts.push("GPA: " + (Math.round((g.gradeSum / g.gradeEcts) * 100) / 100).toFixed(2));
    if (parts.length) lines.push(z.name + " (" + g.completedEcts + (z.required ? "/" + z.required : "") + " ECTS) - " + parts.join(" | "));
  });
  if (!lines.length) return null;

  let result = "My ECTS Tracker progress (" + totalCompleted + "/120 ECTS completed):\n" + lines.join("\n");
  if (overallGradeEcts > 0)
    result += "\nOverall GPA: " + (Math.round((overallGradeSum / overallGradeEcts) * 100) / 100).toFixed(2) + " (German scale, 1.0 best - 5.0 fail)";
  const targetGrade = parseFloat(targetGradeRaw);
  const remainingEctsForGpa = 120 - overallGradeEcts;
  if (targetGrade && remainingEctsForGpa > 0) {
    const requiredAvg = (targetGrade * 120 - overallGradeSum) / remainingEctsForGpa;
    result +=
      "\nTarget GPA: " +
      targetGrade.toFixed(2) +
      " (need average " +
      requiredAvg.toFixed(2) +
      " across the next " +
      remainingEctsForGpa +
      " ECTS to reach this)";
  }
  const codeList = Object.keys(codes);
  if (codeList.length) {
    result += "\nCodes already completed or in progress: " + codeList.join(", ");
    const catParts = Object.keys(codesByCat)
      .map((cat) => {
        const cc = Object.keys(codesByCat[cat]);
        return cc.length ? cat + ": " + cc.join(", ") : null;
      })
      .filter(Boolean);
    if (catParts.length) result += "\nCodes by category: " + catParts.join("; ");
  }
  const plannedParts = Object.keys(plannedByCat)
    .map((cat) => {
      const pc = Object.keys(plannedByCat[cat]);
      return pc.length ? cat + ": " + pc.join(", ") : null;
    })
    .filter(Boolean);
  if (plannedParts.length) result += "\nPlanned codes by category: " + plannedParts.join("; ");
  return result;
}

export function withContext(question: string, context: string | null): string {
  return context ? context + "\n\nQuestion: " + question : question;
}

// ---- answer formatting: a tiny markdown subset, escaped first ---------------

export function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url.replace(/"/g, "%22")}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    // "[2]" citation markers (not Markdown links) become chips the chat opens.
    .replace(/\[(\d+)\](?!\()/g, '<button type="button" class="cite" data-cite="$1" aria-label="Show source $1">$1</button>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Markdown subset (headings, lists, tables, bold/italic/code/links) to HTML; input is escaped first. */
export function formatAnswer(text: string): string {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const isTableSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
  const splitRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const cell = (c: string) => inline(escapeHtml(c));
  let html = "";
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(splitRow(lines[i++]));
      html += `<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${cell(c)}</th>`).join("")}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      html += `<div class="md-h md-h${h[1].length}">${cell(h[2])}</div>`;
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^[-*]\s+/, ""));
      html += `<ul>${items.map((x) => `<li>${cell(x)}</li>`).join("")}</ul>`;
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^\d+\.\s+/, ""));
      html += `<ol>${items.map((x) => `<li>${cell(x)}</li>`).join("")}</ol>`;
      continue;
    }
    html += `<p>${cell(raw)}</p>`;
    i++;
  }
  return html;
}

/** Keeps what the chat needs from a response without bloating localStorage. */
export function compactPassages(retrieval: Passage[] | undefined): Passage[] {
  return (retrieval || []).slice(0, 12).map((p) => ({
    source_id: String(p.source_id || ""),
    snippet: String(p.snippet || "").slice(0, 1500),
    rerank_score: typeof p.rerank_score === "number" ? p.rerank_score : null,
    expired_since: p.expired_since || null,
  }));
}
