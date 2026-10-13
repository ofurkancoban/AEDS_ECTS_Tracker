import { expect, test } from "@playwright/test";
import { importFixture, open } from "./helpers";

test.describe("visual", () => {
  test("tab icon follows the palette", async ({ page }) => {
    await open(page, { palette: "plum" });
    const href = await page.locator('link[rel="icon"][data-dynamic]').getAttribute("href");
    expect(decodeURIComponent(href!)).toContain('fill="#7a3e6e"');
    await expect(page.getByRole("img", { name: "AEDS Credit Tracker" }).first()).toBeVisible();
  });

  test("welcome card for a new user, dashboard afterwards", async ({ page }, info) => {
    await open(page);
    await expect(page.getByRole("region", { name: "Let's map out your master's" })).toBeVisible();
    await page.screenshot({ path: `test-results/${info.project.name}-welcome.png` });
    await importFixture(page);
    await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Credits and GPA by semester" })).toBeVisible();
    await page.waitForTimeout(900); // count-up and ring animation
    await page.screenshot({ path: `test-results/${info.project.name}-overview.png`, fullPage: true });
  });

  test("timeline strip and grade colours", async ({ page }, info) => {
    await open(page);
    await importFixture(page);
    await page.keyboard.press("3");
    await expect(page.getByRole("navigation", { name: "Semesters" })).toBeVisible();
    await page.waitForTimeout(400); // let the view transition finish
    await page.screenshot({ path: `test-results/${info.project.name}-timeline.png` });
  });

  test("with reduced motion the progress number shows at once", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await open(page);
    await importFixture(page);
    await expect(page.getByLabel("42 ECTS completed")).toHaveText("42", { timeout: 200 });
    await ctx.close();
  });
});
