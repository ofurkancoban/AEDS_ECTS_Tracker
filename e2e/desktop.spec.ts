import { expect, test } from "@playwright/test";
import { LATEST_CHANGELOG, byCode, courses, importFixture, isolate, open } from "./helpers";

test.beforeEach(async ({ page }) => {
  await open(page);
  await importFixture(page);
});

test("overview reflects the imported transcript", async ({ page }) => {
  // 7 counted completed courses: 42 ECTS (the Additional one does not count).
  await expect(page.getByText("78 ECTS to go")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where your credits go" })).toBeVisible();
  for (const name of ["Economics", "Empirical Methods", "Data Science", "Specialization", "Thesis"]) {
    await expect(page.locator("button.card", { hasText: name }).first()).toBeVisible();
  }
});

test("sidebar and number keys switch between all six views", async ({ page }) => {
  for (const [key, name] of [["2", "Courses"], ["3", "Timeline"], ["4", "Planner"], ["5", "Catalog"], ["6", "Checklist"], ["1", "Overview"]]) {
    await page.keyboard.press(key);
    await expect(page.locator("header h1")).toHaveText(name);
  }
  await page.getByRole("button", { name: "Planner" }).first().click();
  await expect(page.locator("header h1")).toHaveText("Planner");
});

test("adds a course from the palette and undoes it", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Search by code/).fill("wir901");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Add a course" }).getByRole("button", { name: /Add course/ }).click();
  await expect.poll(async () => !!(await byCode(page, "wir901"))).toBe(true);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect.poll(async () => !!(await byCode(page, "wir901"))).toBe(false);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => !!(await byCode(page, "wir901"))).toBe(true);
});

test("edits a grade, cycles a status and moves a course", async ({ page }) => {
  await page.keyboard.press("2");
  const econ = page.locator("#cat-economics");
  await econ.locator('select[aria-label="Grade"]').first().selectOption("1.0");
  await expect.poll(async () => (await byCode(page, "wir821"))?.grade).toBe("1.0");

  const row = econ.locator(".group", { hasText: "Advanced Microeconomics" });
  await row.getByTitle("Click to change status").click();
  await expect.poll(async () => (await byCode(page, "wir874"))?.status).toBe("in-progress");

  await row.getByLabel("Course actions").click();
  await page.getByRole("button", { name: "Move to semester" }).click();
  const sheet = page.getByRole("dialog", { name: "Advanced Microeconomics" });
  // wir874 only runs in winter terms, so only WiSe options are offered.
  const options = sheet.getByRole("button", { name: /^(WiSe|SoSe)\d\d/ });
  const labels = (await options.allTextContents()).map((t) => t.slice(0, t.startsWith("WiSe") ? 9 : 6));
  expect(labels.every((l) => l.startsWith("WiSe"))).toBe(true);
  const target = labels.find((l) => l !== "WiSe26/27")!;
  await sheet.getByRole("button", { name: new RegExp("^" + target.replace("/", "\\/")) }).click();
  await expect.poll(async () => (await byCode(page, "wir874"))?.semester).toBe(target);
});

test("drags a course to Specialization and back", async ({ page }) => {
  // Tall enough that source and target are both on screen: Playwright would
  // otherwise scroll mid-drag and pick up a different row.
  await page.setViewportSize({ width: 1440, height: 2600 });
  await page.keyboard.press("2");
  const card = page.locator("#cat-economics .group", { hasText: "Topics in Economic Research" });
  await card.dragTo(page.locator("#cat-specialization"));
  await expect.poll(async () => (await byCode(page, "wir876"))?.category).toBe("specialization");
  // A moved course can only go back to its home category.
  await page.locator("#cat-specialization .group", { hasText: "Topics in Economic Research" }).dragTo(page.locator("#cat-further"));
  await expect.poll(async () => (await byCode(page, "wir876"))?.category).toBe("specialization");
  await page.locator("#cat-specialization .group", { hasText: "Topics in Economic Research" }).dragTo(page.locator("#cat-economics"));
  await expect.poll(async () => (await byCode(page, "wir876"))?.category).toBe("economics");
});

test("reschedules on the timeline by dragging", async ({ page }) => {
  await page.keyboard.press("3");
  const card = page.locator('[role="button"][draggable="true"]', { hasText: "Advanced Microeconomics" });
  const target = page.locator("section", { has: page.locator("h3", { hasText: /^SoSe27$/ }) });
  await card.dragTo(target);
  await expect.poll(async () => (await byCode(page, "wir874"))?.semester).toBe("SoSe27");
});

test("planner adds a suggestion and the simulator reacts", async ({ page }) => {
  await page.getByLabel("Target GPA").fill("1.7");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("4");
  const before = (await courses(page)).length;
  const add = page.getByRole("button", { name: /Add to my plan/ });
  if (await add.isEnabled()) {
    await add.click();
    await expect.poll(async () => (await courses(page)).length).toBeGreaterThan(before);
  }
  await expect(page.getByText("Projected final GPA")).toBeVisible();
  await page.getByRole("button", { name: /Reach target/ }).click();
  await expect(page.getByText("Target reached")).toBeVisible();
});

test("catalog search, filters and add", async ({ page }) => {
  await page.keyboard.press("5");
  const count = page.getByText(/^\d+ of \d+ modules$/);
  await page.getByPlaceholder(/Search code, title, lecturer/).fill("Business Intelligence");
  await expect(count).toHaveText(/^2 of/);
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByLabel("Hide modules I already have").check();
  await expect(count).toHaveText(/^0 of/);
  await page.getByLabel("Hide modules I already have").uncheck();
  await page.getByPlaceholder(/Search code, title, lecturer/).fill("");
  await page.getByLabel("Compulsory only").check();
  await expect(page.locator("article")).toHaveCount(await page.locator("article").count());
  expect(await page.locator("article").count()).toBeGreaterThan(0);
  for (const a of await page.locator("article").all()) await expect(a.getByText("compulsory")).toBeVisible();
});

test("StudIP sync updates grades and adds modules", async ({ page }) => {
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: /Sync from StudIP/ }).click();
  const dlg = page.getByRole("dialog", { name: "Sync grades from StudIP" });
  await dlg.getByPlaceholder(/Paste the copied text/).fill(
    ["1\tmodule Advanced Microeconomics\t2100874\t\t1,3\tBE", "2\tmodule Environmental Economics\t2100901\t\t2,0\tBE"].join("\n"),
  );
  await dlg.getByRole("button", { name: /Match/ }).click();
  await dlg.getByLabel(/Semester for wir901/).selectOption({ index: 1 });
  await dlg.getByRole("button", { name: "Apply updates" }).click();
  await expect.poll(async () => (await byCode(page, "wir874"))?.grade).toBe("1.3");
  await expect.poll(async () => (await byCode(page, "wir901"))?.status).toBe("completed");
});

test("assistant sends the course context only when asked", async ({ page }) => {
  const sent: string[] = [];
  await isolate(page, (m) => {
    sent.push(m);
    return { status: 200, body: { answer: "Noted.", thread_id: "t", query_log_id: 3 } };
  });
  await page.getByRole("button", { name: "Open AEDS AI Assistant chat" }).click();
  const panel = page.getByRole("dialog", { name: "AEDS AI Assistant" });
  const box = panel.getByPlaceholder(/Ask about the AEDS programme/);
  await box.fill("Plain question");
  await box.press("Enter");
  await expect(panel.getByText("Noted.")).toBeVisible();
  await panel.getByLabel("Consider my course list").check();
  await box.fill("With context");
  await box.press("Enter");
  await expect(panel.getByText("Noted.")).toHaveCount(2);
  expect(sent[0]).toBe("Plain question");
  // Additional courses are listed but not counted toward the 120 (42, not 48).
  expect(sent[1]).toMatch(/^My ECTS Tracker progress \(42\/120 ECTS completed\):/);
  expect(sent[1]).toContain("Additional (6 ECTS) - completed: wir890");
  expect(sent[1]).toMatch(/Question: With context$/);
});

test("exports CSV and JSON backups", async ({ page }) => {
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect(csv.suggestedFilename()).toBe("ects-transcript.csv");
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download JSON backup/ }).click()]);
  expect(json.suggestedFilename()).toBe("ects-tracker-backup.json");
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("ects-tracker-state")!).lastBackupAt)).not.toBeNull();
});

test("QR share produces a link that imports on another device", async ({ page, browser }) => {
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: /Share via QR code/ }).click();
  const link = await page.getByRole("dialog", { name: "Share your plan" }).locator("input").inputValue();
  expect(link).toContain("#qrimport=");

  const other = await browser.newPage();
  await isolate(other);
  await other.addInitScript((v) => localStorage.setItem("changelog_seen", v), LATEST_CHANGELOG);
  await other.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await other.getByRole("button", { name: "Import" }).click();
  await expect.poll(async () => (await courses(other)).length).toBe(13);
  await other.close();
});

test("works offline after the first visit", async ({ page, context }) => {
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1").first()).toBeVisible();
  expect((await courses(page)).length).toBe(13);
  await context.setOffline(false);
});

test("the classic view still opens with the same data", async ({ page }) => {
  await page.goto("legacy/");
  await expect(page.getByText(/Applied Economics/i).first()).toBeVisible();
  expect((await courses(page)).length).toBe(13);
});

test("keeps an edit made right before the tab closes", async ({ page }) => {
  await page.keyboard.press("2");
  await page.locator("#cat-economics").locator('select[aria-label="Grade"]').first().selectOption("4.0");
  // Reload immediately, inside the save debounce window.
  await page.reload();
  expect((await byCode(page, "wir821"))?.grade).toBe("4.0");
});

test("keyboard users can expand a course row", async ({ page }) => {
  await page.keyboard.press("2");
  const toggle = page.locator("#cat-economics [aria-expanded]").first();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Learning outcomes").first()).toBeVisible();
  await page.keyboard.press(" ");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("rating a completed course sends one anonymous vote", async ({ page }) => {
  const votes: unknown[] = [];
  await page.route("https://api.github.com/**", async (r) => {
    votes.push(r.request().postDataJSON());
    await r.fulfill({ status: 204 });
  });
  await page.keyboard.press("2");
  await page.locator("#cat-economics [aria-expanded]").first().click();
  await page.getByRole("button", { name: "Rate difficulty 4 of 5" }).click();
  await expect.poll(() => votes.length).toBe(1);
  expect(votes[0]).toMatchObject({ event_type: "course-rating", client_payload: { course: "wir821", rating: 4 } });
});
