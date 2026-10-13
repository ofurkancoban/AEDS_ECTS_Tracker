import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Data files are committed at the repo root by the catalog/ratings bots, so
// they stay there rather than in public/. The app fetches them at runtime, and
// the classic UI in legacy/ needs its own copy next to it.
const ROOT_DATA_FILES = ["catalog.csv", "ratings.json", "CHANGELOG.json", "favicon.ico", "favicon-512.png"];

function copyRootDataFiles(): Plugin {
  return {
    name: "copy-root-data-files",
    apply: "build",
    closeBundle() {
      const out = resolve(import.meta.dirname, "dist");
      for (const file of ROOT_DATA_FILES) {
        const src = resolve(import.meta.dirname, file);
        if (existsSync(src)) copyFileSync(src, resolve(out, file));
      }
      const legacyOut = resolve(out, "legacy");
      mkdirSync(legacyOut, { recursive: true });
      cpSync(resolve(import.meta.dirname, "legacy"), legacyOut, { recursive: true });
      for (const file of ["catalog.csv", "CHANGELOG.json", "favicon.ico", "favicon-512.png"]) {
        copyFileSync(resolve(import.meta.dirname, file), resolve(legacyOut, file));
      }
      // After the preview phase, old /next/ links and bookmarks land on the new
      // root, and the preview's service worker removes itself and its caches.
      const nextOut = resolve(out, "next");
      mkdirSync(nextOut, { recursive: true });
      writeFileSync(
        resolve(nextOut, "index.html"),
        '<!DOCTYPE html><meta charset="utf-8"><title>AEDS Credit Tracker</title><meta http-equiv="refresh" content="0; url=../"><link rel="canonical" href="../"><a href="../">Continue to the AEDS Credit Tracker</a><script>location.replace("../" + location.search + location.hash)</script>',
      );
      writeFileSync(
        resolve(nextOut, "sw.js"),
        "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.map(c=>caches.delete(c)))).then(()=>self.registration.unregister())));",
      );
    },
  };
}

// Version shown in problem reports: package version plus the commit it was built from.
function buildVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")).version;
  let sha = (process.env.GITHUB_SHA || "").slice(0, 7);
  if (!sha) {
    try {
      sha = execSync("git rev-parse --short HEAD", { cwd: import.meta.dirname }).toString().trim();
    } catch {
      sha = "dev";
    }
  }
  return `${pkg}+${sha}`;
}

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react(), tailwindcss(), copyRootDataFiles()],
  test: { environment: "happy-dom", include: ["src/**/*.test.{ts,tsx}"] },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // React rarely changes between deploys, so keep it cacheable on its own.
        manualChunks: (id) => (/node_modules\/(react|react-dom|scheduler)\//.test(id) ? "react" : undefined),
      },
    },
  },
});
