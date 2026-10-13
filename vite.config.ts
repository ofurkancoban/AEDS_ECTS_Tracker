import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
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
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), copyRootDataFiles()],
  test: { environment: "happy-dom", include: ["src/**/*.test.ts"] },
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
