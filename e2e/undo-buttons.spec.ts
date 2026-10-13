import { expect, test } from "@playwright/test";
import { byCode, courses, importFixture, open } from "./helpers";

test("the top-bar undo and redo buttons step through edits", async ({ page }) => {
  await open(page);
  const undo = page.getByRole("button", { name: /^Undo \(/ });
  const redo = page.getByRole("button", { name: /^Redo \(/ });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await importFixture(page);
  await expect(undo).toBeEnabled();

  // Two separate edits: a grade and a status.
  await page.keyboard.press("2");
  const econ = page.locator("#cat-economics");
  await econ.locator('select[aria-label="Grade"]').first().selectOption("1.0");
  await expect.poll(async () => (await byCode(page, "wir821"))?.grade).toBe("1.0");
  await econ.locator(".group", { hasText: "Advanced Microeconomics" }).getByTitle("Click to change status").click();
  await expect.poll(async () => (await byCode(page, "wir874"))?.status).toBe("in-progress");

  await undo.click();
  await expect.poll(async () => (await byCode(page, "wir874"))?.status).toBe("planned");
  expect((await byCode(page, "wir821"))?.grade).toBe("1.0");
  await expect(redo).toBeEnabled();

  await undo.click();
  await expect.poll(async () => (await byCode(page, "wir821"))?.grade).toBe("2.7");

  await redo.click();
  await expect.poll(async () => (await byCode(page, "wir821"))?.grade).toBe("1.0");
  await redo.click();
  await expect.poll(async () => (await byCode(page, "wir874"))?.status).toBe("in-progress");
  await expect(redo).toBeDisabled();

  // Undo all the way back to before the import.
  for (let i = 0; i < 3; i++) await undo.click();
  await expect.poll(async () => (await courses(page)).length).toBe(0);
  await expect(undo).toBeDisabled();
});
