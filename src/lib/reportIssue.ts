// "Report a problem": opens a pre-filled GitHub issue. There is no server, so
// this is the only way crashes reach the maintainer. The report carries
// technical context only - never course names, grades or any other data.

export const ISSUES_URL = "https://github.com/ofurkancoban/AEDS_ECTS_Tracker/issues/new";
const MAX_URL = 7000; // stay well under browser and GitHub URL limits

export interface IssueContext {
  kind: "crash" | "feedback";
  error?: { message: string; stack?: string } | null;
  componentStack?: string | null;
}

// Errors seen this session (also outside React render), newest last.
const recent: string[] = [];
export function rememberError(message: string): void {
  recent.push(`${new Date().toISOString().slice(11, 19)} ${message}`.slice(0, 300));
  if (recent.length > 5) recent.shift();
}
export function recentErrors(): string[] {
  return [...recent];
}
export function clearRecentErrors(): void {
  recent.length = 0;
}

/** Catches errors outside React rendering (event handlers, promises) for later reports. */
export function installErrorCapture(): void {
  window.addEventListener("error", (e) => rememberError(e.message || String(e.error)));
  window.addEventListener("unhandledrejection", (e) => rememberError("Unhandled: " + (e.reason instanceof Error ? e.reason.message : String(e.reason))));
}

/**
 * Error text can quote data it failed on; mask anything that looks like a
 * module label or code, quoted text and long numbers before it leaves the browser.
 */
export function scrub(text: string): string {
  return text
    .replace(/\b[a-z]{2,4}\d{2,4}\s*-\s*[^\n"'`]{2,80}/gi, "<course>")
    .replace(/\b(wir|inf|mam)\d*\b/gi, "<code>")
    .replace(/(["'`])(?:(?!\1).){1,120}\1/g, "$1…$1")
    .replace(/\b\d{5,}\b/g, "<n>");
}

function stackLines(stack: string | undefined | null, n: number): string {
  return (stack || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n)
    .join("\n");
}

export function diagnostics(): Record<string, string> {
  const root = document.documentElement;
  return {
    Version: `${typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"} (${typeof __BUILD_DATE__ !== "undefined" ? __BUILD_DATE__ : "-"})`,
    Page: location.pathname.includes("/next/") ? "new design preview (/next/)" : "main",
    View: (() => {
      try {
        return localStorage.getItem("ects-tracker-view") || "overview";
      } catch {
        return "-";
      }
    })(),
    Browser: navigator.userAgent,
    Screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    Theme: `${root.classList.contains("dark") ? "dark" : "light"}, palette ${root.getAttribute("data-palette") || "classic"}, ${root.getAttribute("data-density") || "comfortable"}`,
  };
}

export function issueUrl(ctx: IssueContext): string {
  const d = diagnostics();
  const title = ctx.kind === "crash" ? `Crash: ${scrub(ctx.error?.message || "unknown error").slice(0, 80)}` : "Problem report";
  const parts = [
    "**What happened?**",
    ctx.kind === "crash" ? "_The app showed \"Something went wrong\". What were you doing just before?_" : "_Describe the problem and how to reproduce it._",
    "",
    "",
    "**Technical details** (added automatically, no course data)",
    "```",
    ...Object.entries(d).map(([k, v]) => `${k}: ${v}`),
    "```",
  ];
  if (ctx.error) parts.push("", "**Error**", "```", scrub(`${ctx.error.message}\n${stackLines(ctx.error.stack, 8)}`), "```");
  if (ctx.componentStack) parts.push("", "**Component**", "```", scrub(stackLines(ctx.componentStack, 6)), "```");
  const rec = recentErrors();
  if (rec.length) parts.push("", "**Recent errors**", "```", ...rec.map(scrub), "```");
  let body = parts.join("\n");
  const make = (b: string) => `${ISSUES_URL}?${new URLSearchParams({ title, body: b, labels: ctx.kind === "crash" ? "bug,crash-report" : "bug" })}`;
  let url = make(body);
  while (url.length > MAX_URL && body.length > 200) {
    body = body.slice(0, Math.floor(body.length * 0.85)) + "\n```\n(truncated)";
    url = make(body);
  }
  return url;
}
