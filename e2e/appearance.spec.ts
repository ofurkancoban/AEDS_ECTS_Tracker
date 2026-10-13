import { expect, test } from "@playwright/test";
import { importFixture, open } from "./helpers";

const PALETTES = ["classic", "ocean", "forest", "plum", "sunset", "graphite"];

function lum(hex: string) {
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

for (const palette of PALETTES) {
  for (const theme of ["light", "dark"] as const) {
    test(`${palette} / ${theme} renders readable`, async ({ page }, info) => {
      await open(page, { palette, theme });
      await importFixture(page);
      await page.reload();
      const tokens = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const v = (n: string) => cs.getPropertyValue(n).trim();
        return { ink: v("--ink"), paper: v("--paper"), panel: v("--panel"), muted: v("--muted"), accent: v("--accent"), accentSoft: v("--accent-soft"), warn: v("--warn"), warnSoft: v("--warn-soft"), dark: document.documentElement.classList.contains("dark"), attr: document.documentElement.getAttribute("data-palette") };
      });
      expect(tokens.dark).toBe(theme === "dark");
      expect(tokens.attr).toBe(palette === "classic" ? null : palette);
      expect(contrast(tokens.ink, tokens.paper)).toBeGreaterThanOrEqual(7);
      expect(contrast(tokens.muted, tokens.panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.accent, tokens.accentSoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.warn, tokens.warnSoft)).toBeGreaterThanOrEqual(4.5);
      // The page background really uses the palette (not a stale default).
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g)!.map(Number);
      expect("#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")).toBe(tokens.paper.length === 4 ? "#" + [...tokens.paper.slice(1)].map((c) => c + c).join("") : tokens.paper);
      await info.attach(`${palette}-${theme}`, { body: await page.screenshot(), contentType: "image/png" });
    });
  }
}

test("appearance dialog switches palette and mode live", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Appearance" }).click();
  const dlg = page.getByRole("dialog", { name: "Appearance" });
  for (const name of ["Ocean", "Forest", "Plum", "Sunset", "Graphite", "Classic"]) {
    await dlg.getByRole("button", { name: new RegExp("^" + name) }).click();
    await expect(dlg.getByRole("button", { name: new RegExp("^" + name) })).toHaveAttribute("aria-pressed", "true");
  }
  await dlg.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("What's new lists each change as a bullet point", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "What's new" }).click();
  const dlg = page.getByRole("dialog", { name: "What's new" });
  const items = dlg.locator("li");
  expect(await items.count()).toBeGreaterThan(3);
  const style = await items.first().evaluate((li) => {
    const cs = getComputedStyle(li);
    return { display: cs.display, marker: getComputedStyle(li.parentElement!).listStyleType };
  });
  expect(style).toEqual({ display: "list-item", marker: "disc" });
  await test.info().attach("whats-new", { body: await dlg.screenshot(), contentType: "image/png" });
  await dlg.screenshot({ path: "test-results/whats-new.png" });
});
