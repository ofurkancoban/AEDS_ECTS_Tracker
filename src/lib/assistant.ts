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

/** What sharing the course list means, shown before it is first turned on and behind the info button. */
export const CONTEXT_PRIVACY = {
  sent: "Sent with each question: your module codes and their status, your grade average per category and your target GPA. Never your name, email or student number.",
  stored:
    "Kept on the assistant's server together with your question: in the chat history for 90 days and in the question log, used to improve answers, for about 13 months.",
  model: "The answer is written by an external AI model, whose provider may keep what it receives.",
};

export const SUGGESTIONS = ["How many ECTS do I need to graduate?", "Which courses should I take next semester?"];

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
  sources?: SourceRef[];
  retrieval?: Passage[];
  queryLogId?: string | number | null;
  feedbackRating?: 1 | -1;
  /** Set while the answer is still arriving (never persisted). */
  streaming?: boolean;
  stage?: string;
  /** The connection dropped before the answer was complete. */
  interrupted?: boolean;
  /** The reader stopped the answer. */
  stopped?: boolean;
}

const K = {
  token: "aedsRagToken",
  thread: "aedsRagThreadId",
  messages: "aedsRagMessages",
  include: "aedsRagIncludeCourses",
  consent: "aedsRagContextConsent",
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
// Answers still arriving are not saved; an interrupted one is kept with its flag.
export const saveMessages = (m: ChatMessage[]) => set(K.messages, JSON.stringify(m.filter((x) => !x.streaming).map(({ stage: _s, ...x }) => x)));
// Sharing the course list needs the student to have seen what that means
// (CONTEXT_PRIVACY). Turned on before that notice existed: off until confirmed.
export const loadIncludeCourses = () => get(K.include) === "1" && hasContextConsent();
export const hasContextConsent = () => get(K.consent) === "1";
export const giveContextConsent = () => set(K.consent, "1");
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

// ---- streaming (POST /chat/stream, Server-Sent Events) -----------------------

export const STAGE_LABELS: Record<string, string> = {
  understanding: "Understanding your question…",
  searching: "Searching the programme documents…",
  ranking: "Picking the most relevant passages…",
  writing: "Writing…",
};

export interface StreamHandlers {
  onStage?: (stage: string) => void;
  onToken?: (text: string) => void;
  /** Aborting it stops the answer (the server then stops generating too). */
  signal?: AbortSignal;
}

/** Thrown when the reader stopped the answer; carries what had arrived. */
export class StreamStopped extends Error {
  constructor(public partial: string) {
    super("Stopped.");
    this.name = "StreamStopped";
  }
}

/** Thrown when the stream breaks after part of the answer arrived. */
export class StreamInterrupted extends Error {
  constructor(public partial: string) {
    super("The connection was interrupted before the answer was complete.");
    this.name = "StreamInterrupted";
  }
}

/** Splits an SSE buffer into complete events; returns them and the unfinished rest. */
export function parseSse(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const text = buffer.replace(/\r\n?/g, "\n");
  const events: { event: string; data: string }[] = [];
  let rest = text;
  let i: number;
  while ((i = rest.indexOf("\n\n")) !== -1) {
    const block = rest.slice(0, i);
    rest = rest.slice(i + 2);
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // comment / keep-alive
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

/**
 * Asks via /chat/stream, reporting stages and tokens as they arrive, and
 * resolves with the same shape as postChat as soon as the 'done' event
 * arrives. The server keeps the stream open a little longer for its
 * contribution check; that rest is read in the background so the answer's
 * sources don't wait for it, and so the check isn't cut short. Falls back to
 * /chat when the server has no streaming endpoint.
 */
export async function streamChat(message: string, handlers: StreamHandlers = {}, retried = false): Promise<ChatResponse> {
  const { signal } = handlers;
  let partial = "";
  const stopped = () => new StreamStopped(partial);
  if (signal?.aborted) throw stopped();
  let r: Response;
  try {
    const token = await ensureToken();
    r = await fetch(AEDS_RAG_BASE + "/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, Accept: "text/event-stream" },
      body: JSON.stringify({ message, thread_id: loadThreadId() }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw stopped();
    throw err;
  }
  if (r.status === 401 && !retried) {
    set(K.token, null);
    return streamChat(message, handlers, true);
  }
  if (r.status === 404 || r.status === 405) return postChat(message);
  if (!r.ok || !r.body) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail || "Request failed (" + r.status + ")");
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  return new Promise<ChatResponse>((resolve, reject) => {
    let settled = false;
    const settle = (f: () => void) => {
      if (!settled) {
        settled = true;
        f();
      }
    };
    const onAbort = () => {
      settle(() => reject(stopped()));
      reader.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    (async () => {
      let buffer = "";
      try {
        for (;;) {
          const { value, done: finished } = await reader.read();
          buffer += finished ? decoder.decode() : decoder.decode(value, { stream: true });
          const parsed = parseSse(finished ? buffer + "\n\n" : buffer);
          buffer = parsed.rest;
          for (const ev of parsed.events) {
            if (settled) continue; // only draining now
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(ev.data);
            } catch {
              continue;
            }
            if (ev.event === "stage" && typeof data.stage === "string") handlers.onStage?.(data.stage);
            else if (ev.event === "token" && typeof data.text === "string") {
              partial += data.text;
              handlers.onToken?.(data.text);
            } else if (ev.event === "done") {
              const res: ChatResponse = {
                answer: String(data.final_answer ?? data.answer ?? partial),
                thread_id: String(data.thread_id || ""),
                sources: (data.sources as ChatResponse["sources"]) || [],
                retrieval: (data.retrieval as ChatResponse["retrieval"]) || [],
                query_log_id: (data.query_log_id as ChatResponse["query_log_id"]) ?? null,
              };
              if (res.thread_id) set(K.thread, res.thread_id);
              settle(() => resolve(res));
            }
          }
          if (finished) break;
        }
      } catch {
        // Reported below: a drop before 'done' is an interruption; after it, nothing is lost.
      }
      signal?.removeEventListener("abort", onAbort);
      settle(() => reject(signal?.aborted ? stopped() : new StreamInterrupted(partial)));
    })();
  });
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
    // As in the tracker: Additional doesn't count toward the 120, and no category
    // counts beyond its own requirement.
    if (!z.excludedFromTotal) totalCompleted += Math.min(g.completedEcts, z.required);
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

// A question that names the student or their studies gets the course list;
// a general one ("What's in the Mensa today?", "When is the application
// deadline?") goes without it. The list is about 1,500 characters the model
// has to read on every question, and on general questions it only gave the
// model something unrelated to latch on to. When in doubt it is sent.
const PERSONAL =
  /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself|ich|mir|mich|mein\w*)\b|gpa|grade|\bnote|ects|credit|cours|modul|elective|wahl|semester|thesis|master ?arbeit|plan|remain|left|still|finish|graduat|abschlie|exam|prüfung|klausur|regist|anmeld|next|nächst|should|eligible|recogni|anerkenn|transfer|requir|voraussetz/i;

export function needsCourseContext(question: string): boolean {
  return PERSONAL.test(question);
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
/** While an answer is still arriving, closes a bold the last line opened so no stray "**" shows. */
export function closeOpenBold(text: string): string {
  const last = text.slice(text.lastIndexOf("\n") + 1);
  return (last.match(/\*\*/g) || []).length % 2 ? text + "**" : text;
}

/**
 * Wraps module codes (wir895, inf530) that `isCode` knows in a chip the chat
 * opens. Only text outside tags is touched, and never inside links, buttons
 * or code spans.
 */
export function linkCourseCodes(html: string, isCode: (code: string) => boolean): string {
  let skip = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<(a|button)[\s>]/i.test(part)) skip++;
        else if (/^<\/(a|button)>/i.test(part)) skip = Math.max(0, skip - 1);
        return part;
      }
      if (skip) return part;
      return part.replace(/\b([A-Za-z]{2,5}\d{2,4})\b/g, (m: string, code: string) =>
        isCode(code.toLowerCase()) ? `<button type="button" class="code-chip" data-code="${code.toLowerCase()}" aria-label="Module ${code}">${m}</button>` : m,
      );
    })
    .join("");
}

export function formatAnswer(text: string, isCode?: (code: string) => boolean): string {
  const html = formatMarkdown(text);
  return isCode ? linkCourseCodes(html, isCode) : html;
}

function formatMarkdown(text: string): string {
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
