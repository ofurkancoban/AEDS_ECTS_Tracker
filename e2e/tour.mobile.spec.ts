import { expect, test } from "@playwright/test";
import { isolate, noHorizontalScroll } from "./helpers";

test("the tour works on a phone: docked card, folded while adding, views under More", async ({ page }) => {
  await isolate(page);
  await page.goto("/");
  const tour = page.getByTestId("tour");
  const title = tour.locator("#tour-title");
  await expect(title).toHaveText(/Welcome/);
  const vw = page.viewportSize()!.width;
  // Settles inside the screen with a 16px gutter on both sides.
  await expect
    .poll(async () => {
      const card = (await tour.getByRole("dialog").boundingBox())!;
      return Math.round(card.x) >= 15 && Math.round(card.x + card.width) <= vw - 15;
    })
    .toBe(true);
  await noHorizontalScroll(page);

  await tour.getByRole("button", { name: /Start the tour/ }).click();
  await expect(title).toHaveText("Six views, one plan");
  await expect(tour.getByText("Timeline, Catalog and Checklist are under More.")).toBeVisible();
  await tour.getByRole("button", { name: /^Next/ }).click();
  await page.locator('[data-tour="add"]:visible').click();

  // The palette fills the screen, so the card folds into a pill that stays out of the way.
  const pill = tour.getByRole("button", { name: /Show tour step 4: Find a module/ });
  await expect(pill).toBeVisible();
  const palette = page.getByRole("dialog", { name: "Add a course" });
  await palette.getByRole("textbox").first().fill("wir821");
  await page.keyboard.press("Enter");
  await palette.getByRole("button", { name: /^Add/ }).last().click();
  await expect(title).toHaveText(/Already have grades/);

  // Timeline has no tab of its own on a phone: the tour opens it.
  for (let i = 0; i < 12 && (await title.textContent()) !== "Semester by semester"; i++) {
    const t = (await title.textContent()) || "";
    if (t === "All your courses") await page.locator('[data-tour="nav-courses"]:visible').click();
    else await tour.getByRole("button", { name: /^(Next|Skip this step)/ }).click();
    // A finished task lingers on "Nicely done" for a moment: wait for the next step.
    await expect(title).not.toHaveText(t);
  }
  await expect(title).toHaveText("Semester by semester");
  await tour.getByRole("button", { name: /^Next/ }).click();
  await expect(title).toHaveText("Drag to reschedule");
  await expect(page.locator("main h1:visible").first()).toHaveText("Timeline");
  await noHorizontalScroll(page);
  await tour.getByRole("button", { name: "Close the tour" }).click();
  await expect(tour).toHaveCount(0);
});
