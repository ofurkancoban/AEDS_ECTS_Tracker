#!/usr/bin/env node
// Staged rollout layout. `vite build` produces the final layout:
//   /          new design        /legacy/   classic UI
// During the preview phase this script rearranges it to:
//   /          classic UI (+ a "Try the new design" button)
//   /next/     new design (+ a note with "Back to classic")
// Both live on the same origin, so they share localStorage: switching between
// them never loses data. Switching to the final layout = skip this script.
//
// Usage: node scripts/stage-layout.mjs <dist> [outDir]   (in place if outDir omitted)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TRY_BUTTON_MARKER = "<!-- try-new-design -->";

// Plain DOM so it works inside the classic bundle; dismissible, remembered.
export const TRY_BUTTON = `${TRY_BUTTON_MARKER}
<script>
(function () {
  try { if (localStorage.getItem("ects-try-new-hidden") === "1") return; } catch (e) {}
  var wrap = document.createElement("div");
  wrap.id = "try-new-design";
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "New design preview");
  wrap.style.cssText = "position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:9400;display:flex;align-items:center;gap:4px;padding:4px 4px 4px 14px;border-radius:999px;background:#1C2333;color:#F6F3EC;font:600 13px/1.2 -apple-system,'Segoe UI',Inter,Helvetica,Arial,sans-serif;box-shadow:0 10px 28px -10px rgba(0,0,0,.45)";
  var link = document.createElement("a");
  link.href = "next/";
  link.textContent = "Try the new design";
  link.style.cssText = "color:inherit;text-decoration:none;padding:6px 4px";
  var badge = document.createElement("span");
  badge.textContent = "Preview";
  badge.style.cssText = "background:#2F6F6D;color:#fff;border-radius:999px;padding:3px 8px;font-size:11px;margin-left:4px";
  link.appendChild(badge);
  var close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Hide the new design button");
  close.textContent = "\\u00d7";
  close.style.cssText = "border:0;background:transparent;color:inherit;font-size:18px;line-height:1;width:30px;height:30px;border-radius:999px;cursor:pointer;opacity:.8";
  close.onclick = function () {
    try { localStorage.setItem("ects-try-new-hidden", "1"); } catch (e) {}
    wrap.remove();
  };
  wrap.appendChild(link);
  wrap.appendChild(close);
  document.body.appendChild(wrap);
})();
</script>
`;

export function stageLayout(src, out = src) {
  src = resolve(src);
  out = resolve(out);
  if (!existsSync(join(src, "legacy", "index.html"))) throw new Error(`${src} has no legacy/ build to promote`);
  if (out !== src) {
    rmSync(out, { recursive: true, force: true });
    cpSync(src, out, { recursive: true });
  }
  // New design -> /next/ (everything except the classic UI and the old /next/ redirect).
  const next = join(out, "next");
  rmSync(next, { recursive: true, force: true });
  const tmp = join(out, ".next-tmp");
  rmSync(tmp, { recursive: true, force: true }); // left over from an interrupted run
  mkdirSync(tmp);
  for (const entry of readdirSync(out)) {
    if (entry === "legacy" || entry === ".next-tmp") continue;
    renameSync(join(out, entry), join(tmp, entry));
  }
  renameSync(tmp, next);
  // Classic UI -> root.
  for (const entry of readdirSync(join(out, "legacy"))) renameSync(join(out, "legacy", entry), join(out, entry));
  rmSync(join(out, "legacy"), { recursive: true, force: true });
  // "Try the new design" on the classic UI.
  const index = join(out, "index.html");
  const html = readFileSync(index, "utf8");
  if (!html.includes(TRY_BUTTON_MARKER)) writeFileSync(index, html.replace(/<\/body>(?![\s\S]*<\/body>)/, TRY_BUTTON + "</body>"));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src = "dist", out] = process.argv.slice(2);
  const done = stageLayout(src, out || src);
  console.log(`Staged layout in ${done}: classic UI at /, new design at /next/`);
}
