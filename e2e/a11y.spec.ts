import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { importFixture, open } from "./helpers";

const VIEWS: [string, string][] = [
  ["1", "Overview"],
  ["2", "Courses"],
  ["3", "Timeline"],
  ["4", "Planner"],
  ["5", "Catalog"],
  ["6", "Checklist"],
];

for (const theme of ["light", "dark"] as const) {
  test(`no serious accessibility issues on any view (${theme})`, async ({ page }) => {
    await open(page, { theme });
    await importFixture(page);
    const report: string[] = [];
    for (const [key, name] of VIEWS) {
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press(key);
      await expect(page.locator("header h1")).toHaveText(name);
      await page.waitForTimeout(400);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      res.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .forEach((v) => report.push(`${name}: ${v.id} (${v.impact}) x${v.nodes.length} - ${v.nodes[0]?.target.join(" ")} - ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`));
    }
    expect(report, report.join("\n")).toEqual([]);
  });
}

// Every palette, light and dark, on the views with the most colour (tags, grades, chips).
for (const palette of ["ocean", "forest", "plum", "sunset", "graphite"]) {
  for (const theme of ["light", "dark"] as const) {
    test(`readable colours in ${palette} / ${theme}`, async ({ page }) => {
      await open(page, { palette, theme });
      await importFixture(page);
      const issues: string[] = [];
      for (const [key, name] of [["1", "Overview"], ["2", "Courses"], ["3", "Timeline"], ["5", "Catalog"]]) {
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.keyboard.press(key);
        await expect(page.locator("header h1")).toHaveText(name);
        await page.waitForTimeout(400);
        const res = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
        res.violations.forEach((v) => issues.push(`${name}: x${v.nodes.length} ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`));
      }
      expect(issues, issues.join("\n")).toEqual([]);
    });
  }
}
