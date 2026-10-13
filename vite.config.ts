import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
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
      const out = resolve(__dirname, "dist");
      for (const file of ROOT_DATA_FILES) {
        const src = resolve(__dirname, file);
        if (existsSync(src)) copyFileSync(src, resolve(out, file));
      }
      const legacyOut = resolve(out, "legacy");
      mkdirSync(legacyOut, { recursive: true });
      cpSync(resolve(__dirname, "legacy"), legacyOut, { recursive: true });
      for (const file of ["catalog.csv", "CHANGELOG.json", "favicon.ico", "favicon-512.png"]) {
        copyFileSync(resolve(__dirname, file), resolve(legacyOut, file));
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), copyRootDataFiles()],
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
