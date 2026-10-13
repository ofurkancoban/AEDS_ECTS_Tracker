import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { courses, isolate, open } from "./helpers";

const title = (page: Page) => page.getByTestId("tour").locator("#tour-title");
const next = (page: Page) => page.getByTestId("tour").getByRole("button", { name: /^(Start the tour|Next|Finish)/ });

/** Clicks Next until the step with this title shows. */
async function nextUntil(page: Page, text: RegExp) {
  for (let i = 0; i < 25 && !text.test((await title(page).textContent()) || ""); i++) await next(page).click();
  await expect(title(page)).toHaveText(text);
}

test("a first visit starts the tour instead of What's new, and the Try it steps wait for the student", async ({ page }) => {
  await isolate(page);
  await page.goto("/");
  await expect(title(page)).toHaveText(/Welcome to your AEDS Credit Tracker/);
  await expect(page.getByRole("dialog", { name: /What's new/i })).toHaveCount(0);
  await next(page).click();

  // The spotlight sits on the navigation and an arrow points at it.
  await expect(title(page)).toHaveText("Six views, one plan");
  const nav = (await page.locator('aside [data-tour="nav"]').boundingBox())!;
  await expect
    .poll(async () => {
      const spot = (await page.locator(".tour-spot").boundingBox())!;
      return spot.x <= nav.x && spot.y <= nav.y && spot.x + spot.width >= nav.x + nav.width;
    })
    .toBe(true);
  await expect(page.locator(".tour-arrow")).toHaveCount(1);
  // Outside the spotlight the page is paused: clicking does nothing.
  await page.mouse.click(700, 500);
  await expect(title(page)).toHaveText("Six views, one plan");

  await next(page).click();
  await expect(title(page)).toHaveText("Every course starts here");
  await expect(page.getByTestId("tour").getByText("Try it")).toBeVisible();
  await page.locator('[data-tour="add"]:visible').click();

  // Opening the palette completes the task and moves on to it.
  await expect(title(page)).toHaveText("Find a module and add it");
  const palette = page.getByRole("dialog", { name: "Add a course" });
  await palette.getByRole("textbox").first().fill("wir821");
  await page.keyboard.press("Enter");
  await palette.getByRole("button", { name: /^Add/ }).last().click();
  await expect(page.getByTestId("tour").getByText("Nicely done")).toBeVisible();
  await expect(title(page)).toHaveText(/Already have grades/);
  expect((await courses(page)).map((c) => c.name)).toEqual([expect.stringMatching(/^wir821 /)]);

  // What-if is switched on to try it and back off on the next step.
  await nextUntil(page, /What-if mode/);
  await page.locator('[data-tour="whatif"]:visible').click();
  await expect(title(page)).toHaveText("All your courses");
  await expect(page.locator('[data-tour="whatif"]:visible')).toHaveAttribute("aria-checked", "false");

  await page.locator('[data-tour="nav-courses"]:visible').click();
  await expect(title(page)).toHaveText("Edit, grade and move");
  await expect(page.locator("main h1:visible, header h1:visible").first()).toHaveText("Courses");

  await next(page).click();
  await page.locator('[data-tour="nav-timeline"]:visible').click();
  await expect(title(page)).toHaveText("Drag to reschedule");

  await nextUntil(page, /Ask the AEDS AI Assistant/);
  await page.locator('[data-tour="assistant"]:visible').click();
  await expect(title(page)).toHaveText("Answers that know your plan");
  await next(page).click();
  // Leaving the chat steps closes the chat again.
  await expect(title(page)).toHaveText("Help is always here");
  await expect(page.getByRole("button", { name: "Open AEDS AI Assistant chat" })).toBeVisible();

  await next(page).click();
  await expect(title(page)).toHaveText("You're all set");
  await next(page).click();
  await expect(page.getByTestId("tour")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("ects-tour"))).toBe("done");

  await page.reload();
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await expect(page.getByTestId("tour")).toHaveCount(0);
});

test("steps can be skipped, and the keyboard moves through the tour", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("tour")).toHaveCount(0);
  await page.getByRole("button", { name: "Guided tour" }).click();
  await expect(title(page)).toHaveText(/Welcome/);
  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Six views, one plan");
  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Every course starts here");
  // Skipping the Try it step also skips the palette step that depends on it.
  await page.getByTestId("tour").getByRole("button", { name: /Skip this step/ }).click();
  await expect(title(page)).toHaveText(/Already have grades/);
  // With no courses, the dashboard-only steps are left out.
  await next(page).click();
  await expect(title(page)).toHaveText("Your progress toward 120 ECTS");
  await next(page).click();
  await expect(title(page)).toHaveText("Changed your mind?");
  await page.getByTestId("tour").getByRole("button", { name: "Previous step" }).click();
  await expect(title(page)).toHaveText("Your progress toward 120 ECTS");
  await page.getByTestId("tour").getByRole("dialog").press("Escape");
  await expect(page.getByTestId("tour")).toHaveCount(0);
});

test("How it works can replay the tour", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "How it works" }).click();
  await page.getByRole("button", { name: /Take the guided tour/ }).click();
  await expect(page.getByRole("dialog", { name: "How ECTS Tracker works" })).toHaveCount(0);
  await expect(title(page)).toHaveText(/Welcome/);
  await page.getByTestId("tour").getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("tour")).toHaveCount(0);
});

test("the tour card has no serious accessibility issues, in light and dark", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await open(page, { theme });
    await page.getByRole("button", { name: "Guided tour" }).click();
    for (const step of [/Welcome/, "Six views, one plan", "Every course starts here"]) {
      await nextUntil(page, step instanceof RegExp ? step : new RegExp(step));
      await page.waitForTimeout(700); // let the entry animation finish before checking contrast
      const { violations } = await new AxeBuilder({ page }).include('[data-testid="tour"]').analyze();
      expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    }
    await page.getByTestId("tour").getByRole("button", { name: "Close the tour" }).click();
    await page.evaluate(() => sessionStorage.clear());
  }
});
