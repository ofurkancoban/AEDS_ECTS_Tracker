/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PALETTES, PALETTE_KEY, applyPalette, loadPalette } from "./palettes";

type Tokens = Record<string, string>;

// Read the stylesheets as text (Vitest does not load CSS by default).
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const baseCss = read("../styles.css");
const paletteCss = read("../palettes.css");

function block(css: string, selector: string): Tokens {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error("missing block " + selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out: Tokens = {};
  body.replace(/(--[\w-]+):\s*([^;]+);/g, (_, k, v) => ((out[k] = v.trim()), ""));
  return out;
}

const classicLight = block(baseCss, ":root");
const classicDark = { ...classicLight, ...block(baseCss, ".dark") };

function tokens(id: string, mode: "light" | "dark"): Tokens {
  if (id === "classic") return mode === "light" ? classicLight : classicDark;
  const light = { ...classicLight, ...block(paletteCss, `[data-palette="${id}"]`) };
  return mode === "light" ? light : { ...light, ...block(paletteCss, `[data-palette="${id}"].dark`) };
}

function lum(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TOKENS = ["--ink", "--paper", "--panel", "--panel-2", "--accent", "--accent-soft", "--warn", "--warn-soft", "--line", "--line-strong", "--muted", "--faint"];

describe("palettes", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-palette");
  });

  it("has unique ids, with Classic first", () => {
    expect(PALETTES[0].id).toBe("classic");
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
  });

  for (const p of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      describe(`${p.name} / ${mode}`, () => {
        const t = tokens(p.id, mode);

        it("defines every colour token as a hex value", () => {
          TOKENS.forEach((k) => expect(t[k], k).toMatch(/^#[0-9a-f]{3,6}$/i));
        });

        it("matches the picker swatches", () => {
          const s = p[mode];
          expect([s.paper, s.panel, s.ink, s.accent, s.warn]).toEqual([t["--paper"], t["--panel"], t["--ink"], t["--accent"], t["--warn"]]);
        });

        // WCAG 2.1 AA: 4.5:1 for normal text. Body text aims for AAA (7:1).
        it("keeps body text at AAA contrast", () => {
          expect(contrast(t["--ink"], t["--paper"])).toBeGreaterThanOrEqual(7);
          expect(contrast(t["--ink"], t["--panel"])).toBeGreaterThanOrEqual(7);
        });

        it("keeps secondary text, links and badges at AA contrast", () => {
          expect(contrast(t["--muted"], t["--panel"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(t["--accent"], t["--panel"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(t["--accent"], t["--accent-soft"])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(t["--warn"], t["--warn-soft"])).toBeGreaterThanOrEqual(4.5);
        });

        it("keeps button labels readable on the accent colour", () => {
          const onAccent = mode === "dark" ? t["--paper"] : "#ffffff";
          expect(contrast(onAccent, t["--accent"])).toBeGreaterThanOrEqual(4.5);
        });
      });
    }
  }

  it("loads the saved palette and falls back to Classic", () => {
    expect(loadPalette()).toBe("classic");
    localStorage.setItem(PALETTE_KEY, "forest");
    expect(loadPalette()).toBe("forest");
    localStorage.setItem(PALETTE_KEY, "does-not-exist");
    expect(loadPalette()).toBe("classic");
  });

  it("applies the palette as a data attribute, none for Classic", () => {
    applyPalette("plum");
    expect(document.documentElement.getAttribute("data-palette")).toBe("plum");
    applyPalette("classic");
    expect(document.documentElement.hasAttribute("data-palette")).toBe(false);
  });
});
