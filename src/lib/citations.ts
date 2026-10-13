// Citations in AEDS Assistant answers. The model writes "[2]" after a fact;
// passage n is retrieval[n - 1] of the same response, and `sources` carries
// the document links (and PDF pages). Titles follow the AEDS_RAG web UI
// (frontend/src/config/programme.ts) so both show the same names.

export interface SourceRef {
  source_id: string;
  page?: number | null;
  url?: string | null;
  expired_since?: string | null;
}

export interface Passage {
  source_id: string;
  snippet: string;
  rerank_score?: number | null;
  expired_since?: string | null;
}

const KIND = {
  programmeWebsite: "Programme website",
  universityWebsite: "University website",
  programmeDocument: "Programme document",
  regulations: "Regulations",
  accreditation: "Accreditation",
  studierendenwerk: "Studierendenwerk",
};

const SOURCES: Record<string, { title: string; kind: string }> = {
  AEDS_website_programme_overview: { title: "Programme overview", kind: KIND.programmeWebsite },
  AEDS_website_how_to_apply: { title: "How to apply", kind: KIND.programmeWebsite },
  AEDS_website_application_deadlines_table: { title: "Application deadlines", kind: KIND.programmeWebsite },
  AEDS_website_language_requirements: { title: "Language requirements", kind: KIND.programmeWebsite },
  AEDS_website_exams_faq: { title: "Examinations FAQ", kind: KIND.programmeWebsite },
  AEDS_website_exams_regulations: { title: "Examination rules", kind: KIND.programmeWebsite },
  AEDS_website_theses_faq: { title: "Master thesis FAQ", kind: KIND.programmeWebsite },
  AEDS_accreditation_summary: { title: "Accreditation summary", kind: KIND.accreditation },
  MPO_AEDS_2023_EN: { title: "Examination regulations (2023)", kind: KIND.regulations },
  MPO_AEDS_2026_EN: { title: "Examination regulations (2026)", kind: KIND.regulations },
  ZO_FMa_AEDS_EN: { title: "Admission regulations", kind: KIND.regulations },
  SP_MSc_Applied_Economics_and_Data_Science: { title: "Study plan", kind: KIND.programmeDocument },
  semester_planning_rules: { title: "Semester planning rules", kind: KIND.programmeDocument },
  AEDS_website_enrolment_affairs: { title: "Enrolment affairs", kind: KIND.universityWebsite },
  AEDS_website_semester_contribution: { title: "Semester contribution", kind: KIND.universityWebsite },
  AEDS_website_residence_permit: { title: "Residence permit", kind: KIND.universityWebsite },
  AEDS_website_health_insurance: { title: "Health insurance", kind: KIND.universityWebsite },
  AEDS_website_accommodation: { title: "Accommodation & living", kind: KIND.universityWebsite },
  AEDS_website_stw_accommodation: { title: "Student accommodation", kind: KIND.studierendenwerk },
  AEDS_website_stw_faq: { title: "Student housing FAQ", kind: KIND.studierendenwerk },
  AEDS_website_stw_changes_2026: { title: "Changes in 2026", kind: KIND.studierendenwerk },
};

const humanize = (s: string) => {
  const words = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Readable title and kind for a source id (a file stem such as "MPO_AEDS_2026_EN"). */
export function describeSource(id: string): { title: string; kind: string } {
  const known = SOURCES[id];
  if (known) return known;
  if (id.startsWith("AEDS_website_")) return { title: humanize(id.slice("AEDS_website_".length)), kind: KIND.programmeWebsite };
  if (/^MPO_/i.test(id)) return { title: "Examination regulations", kind: humanize(id) };
  if (/flyer/i.test(id)) return { title: "Programme flyer", kind: "Brochure" };
  if (/handbook|modul/i.test(id)) return { title: humanize(id), kind: "Module handbook" };
  return { title: humanize(id), kind: "Document" };
}

// "[2]" not followed by "(" (that would be a Markdown link).
const MARKER_RE = /\[(\d+)\](?!\()/g;

/** For copying an answer elsewhere, where the numbers would point nowhere. */
export function stripCitations(text: string): string {
  return text.replace(/[ \t]*(?:\[\d+\](?!\())+/g, "");
}

export function citedNumbers(text: string): number[] {
  return [...new Set([...text.matchAll(MARKER_RE)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/**
 * A passage starts with "[Document title | Section 8 Resitting ...]"; returns
 * that section label (if any) and the passage as plain prose.
 */
export function readPassage(snippet: string): { section: string | null; text: string } {
  let text = snippet || "";
  let section: string | null = null;
  const head = /^\s*\[([^\]\n]+)\]\s*\n?/.exec(text);
  if (head) {
    const parts = head[1].split("|").map((p) => p.trim());
    section = parts.length > 1 ? parts.slice(1).join(" · ") : null;
    text = text.slice(head[0].length);
  }
  text = text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\|/g, " ")
    // PDF extraction breaks lines mid-sentence; rejoin them but keep
    // paragraphs and bullet points.
    .replace(/[ \t]*\n[ \t]*-(?=\w)/g, "-")
    .replace(/([^\n])[ \t]*\n(?!\n|• |\(\d+\)|\d+\.)[ \t]*/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { section, text };
}

export interface SourceGroup {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  pages: number[];
  expiredSince: string | null;
}

/** Sources of an answer, one entry per document, with every cited page. */
export function groupSources(sources: SourceRef[] | undefined): SourceGroup[] {
  const by = new Map<string, SourceGroup>();
  (sources || []).forEach((s) => {
    if (!s || !s.source_id) return;
    let g = by.get(s.source_id);
    if (!g) {
      g = { id: s.source_id, ...describeSource(s.source_id), url: null, pages: [], expiredSince: null };
      by.set(s.source_id, g);
    }
    if (!g.url && s.url && /^https?:\/\//.test(s.url)) g.url = s.url;
    if (typeof s.page === "number" && !g.pages.includes(s.page)) g.pages.push(s.page);
    if (s.expired_since) g.expiredSince = s.expired_since;
  });
  return [...by.values()].map((g) => ({ ...g, pages: g.pages.sort((a, b) => a - b) }));
}

/** What a "[n]" chip opens: the passage, its document and a link to it. */
export function citation(n: number, retrieval: Passage[] | undefined, sources: SourceRef[] | undefined) {
  const p = retrieval?.[n - 1];
  if (!p) return null;
  const doc = groupSources(sources).find((g) => g.id === p.source_id);
  return { n, ...describeSource(p.source_id), ...readPassage(p.snippet), url: doc?.url ?? null, expiredSince: p.expired_since || doc?.expiredSince || null };
}
