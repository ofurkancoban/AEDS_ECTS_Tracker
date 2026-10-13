#!/usr/bin/env node
// Performance budget for the production build (run after `vite build`).
// Fails when the JavaScript or CSS a visitor downloads grows past the limits
// below, so a heavy new dependency is noticed in CI instead of by users.
//
// Usage: node scripts/check-budget.mjs [distDir]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

// Gzipped kilobytes. Measured on 2026-10-13: initial JS 112.5, CSS 26.3,
// largest lazy chunk 7.9, all JS 140.
export const BUDGET = {
  initialJs: 125, // entry script + modulepreloads: what blocks the first paint
  css: 32,
  lazyChunk: 15, // any view or widget loaded on demand
  totalJs: 160,
};

const kb = (n) => Math.round((n / 1024) * 10) / 10;

export function measure(dist) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const initial = new Set(
    [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
  );
  const assets = readdirSync(join(dist, "assets"));
  const size = (f) => gzipSync(readFileSync(join(dist, "assets", f)), { level: 9 }).length;
  const js = assets.filter((f) => f.endsWith(".js")).map((f) => ({ file: f, gz: size(f), initial: initial.has("assets/" + f) }));
  const css = assets.filter((f) => f.endsWith(".css")).reduce((a, f) => a + size(f), 0);
  const lazy = js.filter((f) => !f.initial).sort((a, b) => b.gz - a.gz);
  return {
    initialJs: kb(js.filter((f) => f.initial).reduce((a, f) => a + f.gz, 0)),
    css: kb(css),
    lazyChunk: kb(lazy[0]?.gz ?? 0),
    largestLazy: lazy[0]?.file ?? "-",
    totalJs: kb(js.reduce((a, f) => a + f.gz, 0)),
    initialFiles: [...initial],
  };
}

export function check(m, budget = BUDGET) {
  return Object.entries(budget)
    .filter(([k, limit]) => m[k] > limit)
    .map(([k, limit]) => `${k}: ${m[k]} KB gzip > budget ${limit} KB${k === "lazyChunk" ? ` (${m.largestLazy})` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] || "dist";
  const m = measure(dist);
  const rows = Object.keys(BUDGET).map((k) => `  ${k.padEnd(10)} ${String(m[k]).padStart(6)} / ${BUDGET[k]} KB gzip`);
  console.log(`Bundle budget (${dist}):\n${rows.join("\n")}`);
  const over = check(m);
  if (over.length) {
    console.error("\nOver budget:\n  " + over.join("\n  "));
    console.error("If the increase is intended, raise the limit in scripts/check-budget.mjs and say why in the commit.");
    process.exit(1);
  }
  console.log("Within budget.");
}
