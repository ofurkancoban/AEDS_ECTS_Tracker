// Printable progress report ("Print or save as PDF"): a self-contained HTML
// page laid out for A4. What-if courses are left out; it is a record of the
// real plan, e.g. to bring to an advising meeting.
import type { Catalog } from "./catalog";
import { codeOf, labelForCode } from "./catalog";
import { STATUS_LABEL, TOTAL_REQUIRED, categoryById } from "./constants";
import { escapeHtml as e } from "./io";
import type { GraduationPath } from "./planning";
import { compareSemesters } from "./semesters";
import type { Stats } from "./stats";
import { isFail } from "./stats";
import type { Course, TrackerState } from "./types";

export interface ReportInput {
  state: TrackerState;
  stats: Stats;
  catalog: Catalog;
  path: GraduationPath | null;
  now?: Date;
}

function ring(completed: number, inProgress: number, planned: number): string {
  const r = 52;
  const C = 2 * Math.PI * r;
  const f = (v: number) => Math.max(0, Math.min(1, v / TOTAL_REQUIRED));
  const seg = (from: number, frac: number, color: string, dash = "") =>
    frac > 0
      ? `<circle cx="64" cy="64" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-from * C).toFixed(1)}" ${dash}/>`
      : "";
  const fc = f(completed);
  const fi = Math.min(f(inProgress), 1 - fc);
  const fp = Math.min(f(planned), 1 - fc - fi);
  return `<svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true"><g transform="rotate(-90 64 64)">
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="#e8e3d6" stroke-width="14"/>
    ${seg(fc + fi, fp, "#b9b2a2", 'opacity="0.7"')}${seg(fc, fi, "#b5652d")}${seg(0, fc, "#2f6f6d")}
  </g><text x="64" y="62" text-anchor="middle" font-size="26" font-weight="700" fill="#1c2333">${completed}</text>
  <text x="64" y="82" text-anchor="middle" font-size="11" fill="#6b6558">of ${TOTAL_REQUIRED} ECTS</text></svg>`;
}

const bar = (v: number, req: number, color: string) =>
  req > 0 ? `<div class="bar"><div style="width:${Math.min(100, (v / req) * 100).toFixed(1)}%;background:${color}"></div></div>` : "";

export function buildReport({ state, stats, catalog, path, now = new Date() }: ReportInput): string {
  const real = state.courses.filter((c) => !c.hypothetical);
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const target = parseFloat(state.targetGrade);
  const req = stats.requiredAverage;
  const reqText = req === null ? "" : req < 1 ? "already on track" : req > 5 ? "not reachable" : `needs ${req.toFixed(2)} on the remaining ${stats.remainingGradedEcts} ECTS`;

  const kpis = [
    ["Completed", `${stats.completed} ECTS`],
    ["In progress", `${stats.inProgress} ECTS`],
    ["Planned", `${stats.planned} ECTS`],
    ["Not yet planned", `${stats.remaining} ECTS`],
    ["GPA", stats.gpa || "-"],
    ...(target ? [["Target GPA", `${target.toFixed(2)}${reqText ? ` (${reqText})` : ""}`]] : []),
    ...(state.graduationDate && stats.daysLeft !== null
      ? [["Graduation", `${e(state.graduationDate)} (${stats.daysLeft >= 0 ? `${stats.daysLeft} days left` : `${-stats.daysLeft} days ago`})`]]
      : []),
    ["Compulsory modules", `${stats.compulsoryDone.length} of ${catalog.compulsory.length} completed`],
  ];

  const reqRows = stats.categories
    .filter((c) => c.required > 0 || c.items.some((i) => !i.hypothetical))
    .map(
      (c) => `<tr>
        <td><span class="dot" style="background:var(--cat-${c.id})"></span>${e(c.name)}${c.excludedFromTotal ? ' <span class="muted">(not counted)</span>' : ""}</td>
        <td class="n">${c.required || "-"}</td><td class="n">${c.completed}${c.overflow && c.required ? ` <span class="muted">(+${c.overflow} over)</span>` : ""}</td><td class="n">${c.inProgress}</td><td class="n">${c.planned}</td>
        <td class="n">${c.required ? c.remaining : "-"}</td><td class="n">${c.gpa || "-"}</td>
        <td class="w">${bar(c.completed, c.required, "#2f6f6d")}</td></tr>`,
    )
    .join("");

  const compRows = catalog.compulsory
    .map((code) => {
      const done = stats.compulsoryDone.includes(code);
      const covered = !done && real.some((c) => !isFail(c) && codeOf(c.name) === code);
      const mark = done ? "✓" : covered ? "◐" : "○";
      const label = done ? "done" : covered ? "planned or running" : "open";
      return `<li><span class="mark ${done ? "ok" : covered ? "half" : ""}">${mark}</span>${e(labelForCode(code, catalog))} <span class="muted">· ${label}</span></li>`;
    })
    .join("");

  const bySem = new Map<string, Course[]>();
  real.forEach((c) => bySem.set(c.semester, [...(bySem.get(c.semester) || []), c]));
  const semGpa = new Map(stats.semesterGpa.map((s) => [s.semester, s.avg]));
  const semesters = [...bySem.keys()].sort(compareSemesters);
  const record = semesters
    .map((s) => {
      const list = bySem.get(s)!;
      const ects = list.reduce((a, c) => a + c.ects, 0);
      const rows = list
        .map(
          (c) => `<tr><td>${e(c.name)}</td><td>${e(categoryById(c.category).short)}</td><td class="n">${c.ects}</td><td>${e(STATUS_LABEL[c.status])}</td>
            <td class="n">${c.status === "completed" ? e(c.grade || "-") : ""}${isFail(c) ? ' <span class="fail">fail</span>' : ""}</td></tr>`,
        )
        .join("");
      const g = semGpa.get(s);
      return `<section class="sem"><h3>${e(s)} <span class="muted">· ${ects} ECTS${g !== undefined ? ` · average ${g.toFixed(2)}` : ""}</span></h3>
        <table><thead><tr><th>Course</th><th>Category</th><th class="n">ECTS</th><th>Status</th><th class="n">Grade</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join("");

  const plan =
    path && path.terms.length
      ? `<h2>Suggested schedule for what is not planned yet</h2>
        <p class="muted small">A simulation based on when modules ran before${path.anyPredicted ? "; modules marked * are predicted, not confirmed" : ""}. Not a commitment.</p>
        ${path.terms
          .map(
            (t) => `<section class="sem"><h3>${e(t.semester)} <span class="muted">· ${t.items.reduce((a, i) => a + i.ects, 0)} ECTS</span></h3><ul class="plan">${t.items
              .map((i) => `<li>${e(i.label)}${i.predicted ? " *" : ""} <span class="muted">· ${i.category ? e(categoryById(i.category).short) : ""} · ${i.ects} ECTS${i.compulsory ? " · compulsory" : ""}</span></li>`)
              .join("")}</ul></section>`,
          )
          .join("")}`
      : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<title>AEDS progress report ${e(date)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  :root { --cat-economics:#2f6f6d; --cat-empirical:#3f5c8c; --cat-datascience:#a87b1e; --cat-specialization:#7a4a7e; --cat-thesis:#1c2333; --cat-further:#5e7a5a; --cat-additional:#8a8578; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.45 -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif; color: #1c2333; margin: 0; padding: 18px; }
  h1, h2, h3 { font-family: Georgia, "Iowan Old Style", serif; margin: 0; }
  h1 { font-size: 20pt; } h2 { font-size: 13pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #dcd6c7; }
  h3 { font-size: 11pt; margin: 12px 0 4px; }
  .muted { color: #6b6558; font-weight: normal; } .small { font-size: 9pt; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2f6f6d; padding-bottom: 8px; }
  .summary { display: flex; gap: 22px; align-items: center; margin-top: 14px; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 22px; flex: 1; }
  .kpis div { display: flex; justify-content: space-between; border-bottom: 1px dotted #dcd6c7; padding: 3px 0; }
  .kpis b { font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ebe6da; vertical-align: top; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; color: #6b6558; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } .w { width: 22%; }
  .bar { height: 7px; background: #ece8dc; border-radius: 4px; overflow: hidden; margin-top: 4px; } .bar div { height: 100%; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  ul { margin: 0; padding: 0; list-style: none; } li { padding: 2px 0; }
  .mark { display: inline-block; width: 18px; color: #9a9385; } .mark.ok { color: #2f6f6d; font-weight: 700; } .mark.half { color: #b5652d; }
  .fail { color: #a33a32; font-size: 8pt; text-transform: uppercase; }
  .plan li::before { content: "• "; color: #2f6f6d; }
  .sem { break-inside: avoid; }
  footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #dcd6c7; font-size: 8.5pt; color: #6b6558; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
<header><div><h1>Applied Economics and Data Science</h1><div class="muted">M.Sc. progress report · University of Oldenburg</div></div>
<div class="muted small">${e(date)}</div></header>
<div class="summary">${ring(stats.completed, stats.inProgress, stats.planned)}
<div class="kpis">${kpis.map(([k, v]) => `<div><span>${e(k)}</span><b>${v}</b></div>`).join("")}</div></div>
<h2>Requirements</h2>
<table><thead><tr><th>Category</th><th class="n">Required</th><th class="n">Done</th><th class="n">Running</th><th class="n">Planned</th><th class="n">Open</th><th class="n">GPA</th><th></th></tr></thead><tbody>${reqRows}</tbody></table>
<h2>Compulsory modules</h2><ul>${compRows}</ul>
<h2>Courses by semester</h2>${record || '<p class="muted">No courses yet.</p>'}
${plan}
<footer>Made with the AEDS Credit Tracker (unofficial). GPA is ECTS-weighted, German scale, failed and Additional courses excluded. Always confirm requirements with the examination office.${
    catalog.lastModified ? ` Module catalog as of ${e(new Date(catalog.lastModified).toLocaleDateString("en-GB"))}.` : ""
  }</footer>
</body></html>`;
}
