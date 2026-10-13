import { expect, test, type Page } from "@playwright/test";
import { courses, importFixture, open } from "./helpers";

// The OS save dialog can't be automated, so the picker returns a real
// FileSystemFileHandle from the browser's private file system (OPFS). Writing,
// permissions and keeping the handle across reloads all use the real APIs.
async function withPicker(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { showSaveFilePicker: () => Promise<FileSystemFileHandle> }).showSaveFilePicker = async () =>
      (await navigator.storage.getDirectory()).getFileHandle("ects-tracker-backup.json", { create: true });
  });
}

async function fileCourses(page: Page): Promise<{ name: string; status: string }[] | null> {
  return page.evaluate(async () => {
    try {
      const h = await (await navigator.storage.getDirectory()).getFileHandle("ects-tracker-backup.json");
      const text = await (await h.getFile()).text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  });
}

test("automatic file backup: choose once, updated after edits, kept across reloads", async ({ page }) => {
  await withPicker(page);
  await open(page);
  await importFixture(page);

  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: /Automatic file backup/ }).click();
  const dlg = page.getByRole("dialog", { name: "Automatic file backup" });
  await dlg.getByRole("button", { name: /Choose backup file/ }).click();
  await expect(dlg.getByRole("status")).toContainText("On · ects-tracker-backup.json");
  await expect.poll(async () => (await fileCourses(page))?.length).toBe(13);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Backed up · just now/ })).toBeVisible();

  // An edit reaches the file a few seconds later.
  await page.keyboard.press("2");
  await page.locator("#cat-economics .group", { hasText: "Advanced Microeconomics" }).getByTitle("Click to change status").click();
  await expect.poll(async () => (await fileCourses(page))?.find((c) => c.name.startsWith("wir874"))?.status, { timeout: 8000 }).toBe("in-progress");

  // The chosen file is remembered in IndexedDB for the next visit. (Reading an
  // OPFS handle back after a reload closes the page in automated Chromium, even
  // without this app, so the read-back is covered by fileBackup.idb.test.ts.)
  const stored = await page.evaluate(
    () =>
      new Promise<string>((res) => {
        const q = indexedDB.open("ects-tracker");
        q.onsuccess = () => {
          const g = q.result.transaction("handles").objectStore("handles").getAllKeys();
          g.onsuccess = () => res(JSON.stringify(g.result));
        };
        q.onerror = () => res("error");
      }),
  );
  expect(stored).toBe('["backup-file"]');

  // Resetting does not silently empty the file.
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: "Reset tracker" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  const ask = page.getByRole("dialog", { name: "Empty the backup file too?" });
  await expect(ask).toBeVisible({ timeout: 8000 });
  await ask.getByRole("button", { name: "Cancel" }).click();
  expect((await courses(page)).length).toBe(0);
  expect((await fileCourses(page))?.length).toBe(13);

  // ... and the file restores everything.
  const text = await page.evaluate(async () => {
    const h = await (await navigator.storage.getDirectory()).getFileHandle("ects-tracker-backup.json");
    return (await h.getFile()).text();
  });
  await page.setInputFiles('input[accept*="json"]', { name: "ects-tracker-backup.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect.poll(async () => (await courses(page)).length).toBe(13);
});

test("turning it off stops updates and keeps the file", async ({ page }) => {
  await withPicker(page);
  await open(page);
  await importFixture(page);
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: /Automatic file backup/ }).click();
  const dlg = page.getByRole("dialog", { name: "Automatic file backup" });
  await dlg.getByRole("button", { name: /Choose backup file/ }).click();
  await expect.poll(async () => (await fileCourses(page))?.length).toBe(13);
  await dlg.getByRole("button", { name: "Turn off" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Backed up ·/ })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Search by code/).fill("wir901");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Add a course" }).getByRole("button", { name: /Add course/ }).click();
  await page.waitForTimeout(3500);
  expect((await fileCourses(page))?.length).toBe(13);
});
