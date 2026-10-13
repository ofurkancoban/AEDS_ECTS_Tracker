import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { byCode, importFixture, noHorizontalScroll, open } from "./helpers";

test.beforeEach(async ({ page }) => {
  await open(page);
  await importFixture(page);
});

test("every view fits the phone width", async ({ page }) => {
  const nav = page.locator("nav.fixed");
  await noHorizontalScroll(page);
  for (const tab of ["Courses", "Planner"]) {
    await nav.getByRole("button", { name: tab }).click();
    await expect(page.locator("main h1")).toHaveText(tab);
    await noHorizontalScroll(page);
  }
  for (const item of ["Timeline", "Catalog", "Checklist"]) {
    await nav.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: item }).click();
    await expect(page.locator("main h1")).toHaveText(item);
    if (item !== "Timeline") await noHorizontalScroll(page);
  }
});

test("long-press drag reaches an off-screen semester by edge scrolling", async ({ page }) => {
  await page.locator("nav.fixed").getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Timeline" }).click();
  const card = page.locator('[aria-label^="SoSe"] [draggable="true"], [aria-label^="WiSe"] [draggable="true"]', { hasText: "International Trade" });
  await card.scrollIntoViewIfNeeded();
  const start = (await card.boundingBox())!;
  const vw = page.viewportSize()!.width;
  const column = page.locator("section", { has: page.locator("h3", { hasText: /^SoSe25$/ }) });
  expect((await column.boundingBox())!.x).toBeGreaterThan(vw);

  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  let x = start.x + start.width / 2;
  const y = start.y + 20;
  await touch("touchStart", x, y);
  await page.waitForTimeout(450);
  // Slide to the right edge and hold there; the board scrolls until SoSe25 is in view.
  for (; x < vw - 12; x += 25) await touch("touchMove", Math.min(x, vw - 12), y);
  let box = (await column.boundingBox())!;
  for (let i = 0; i < 80 && box.x > vw - 120; i++) {
    await touch("touchMove", vw - 12, y);
    await page.waitForTimeout(40);
    box = (await column.boundingBox())!;
  }
  await touch("touchMove", box.x + Math.min(60, box.width / 2), y + 60);
  await touch("touchEnd", 0, 0);
  await expect.poll(async () => (await byCode(page, "wir821"))?.semester).toBe("SoSe25");
});

test("a short tap opens the move sheet instead of dragging", async ({ page }) => {
  await page.locator("nav.fixed").getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Timeline" }).click();
  await page.locator('[aria-label^="SoSe"] [draggable="true"], [aria-label^="WiSe"] [draggable="true"]', { hasText: "Advanced Microeconomics" }).tap();
  const sheet = page.getByRole("dialog", { name: "Advanced Microeconomics" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "In progress" }).tap();
  await expect.poll(async () => (await byCode(page, "wir874"))?.status).toBe("in-progress");
});

test("scrolling the timeline does not start a drag", async ({ page }) => {
  await page.locator("nav.fixed").getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Timeline" }).click();
  const card = page.locator('[aria-label^="SoSe"] [draggable="true"], [aria-label^="WiSe"] [draggable="true"]').first();
  const box = (await card.boundingBox())!;
  const before = await byCode(page, "wir821");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 20, y: box.y + 20 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 20, y: box.y + 120 }] });
  await page.waitForTimeout(450);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".touch-drag-ghost")).toHaveCount(0);
  expect((await byCode(page, "wir821"))?.semester).toBe(before?.semester);
});

test("the add button opens the full-screen palette", async ({ page }) => {
  await page.locator("nav.fixed").getByRole("button", { name: "Add course" }).click();
  const pal = page.getByRole("dialog", { name: "Add a course" });
  await expect(pal).toBeVisible();
  // Measure after the opening animation (it scales from 98%).
  await expect.poll(async () => (await pal.boundingBox())!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  await pal.getByRole("button", { name: "Thesis", exact: true }).click();
  const thesis = pal.locator("button[data-idx]");
  await expect(thesis).toHaveCount(1);
  await expect(thesis).toContainText("mam");
  await expect(thesis).toContainText("Degree Module");
  await expect(thesis).not.toContainText("·");
});

test("the assistant opens full screen above the navigation", async ({ page }) => {
  await page.getByRole("button", { name: "Open AEDS AI Assistant chat" }).click();
  const panel = page.getByRole("dialog", { name: "AEDS AI Assistant" });
  const box = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBe(vp.width);
  expect(box.height).toBeGreaterThan(vp.height - 2);
  await expect(panel.getByPlaceholder(/Ask about the AEDS programme/)).toBeInViewport();
  await panel.getByRole("button", { name: "Close chat" }).click();
  await expect(page.getByRole("button", { name: "Open AEDS AI Assistant chat" })).toBeVisible();
});

test("the page content starts near the top on a phone", async ({ page }, info) => {
  const first = page.locator("main section").first();
  const box = (await first.boundingBox())!;
  expect(box.y).toBeLessThan(page.viewportSize()!.height * 0.3);
  await expect(page.getByRole("switch", { name: /What-if mode/ }).first()).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `test-results/${info.project.name}-top.png` });
});

test("no serious accessibility issues on the phone layout", async ({ page }) => {
  const issues: string[] = [];
  const scan = async (where: string) => {
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    res.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .forEach((v) => issues.push(`${where}: ${v.id} x${v.nodes.length} ${v.nodes[0]?.target.join(" ")}`));
  };
  await page.waitForTimeout(500);
  await scan("overview");
  await page.locator("nav.fixed").getByRole("button", { name: "More" }).click();
  await page.waitForTimeout(300);
  await scan("more sheet");
  await page.keyboard.press("Escape");
  await page.locator("nav.fixed").getByRole("button", { name: "Add course" }).click();
  await page.waitForTimeout(300);
  await scan("add palette");
  expect(issues, issues.join("\n")).toEqual([]);
});
