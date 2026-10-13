import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { byCode, courses, importFixture, isolate, open } from "./helpers";

const SAMPLE = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "src", "lib", "fixtures", "rag-answer.json"), "utf8"));

test("assistant answers show clickable citations and their sources", async ({ page }) => {
  await open(page);
  await isolate(page, () => ({ status: 200, body: SAMPLE }));
  await page.getByRole("button", { name: "Open AEDS AI Assistant chat" }).click();
  const panel = page.getByRole("dialog", { name: "AEDS AI Assistant" });
  await panel.getByPlaceholder(/Ask about the AEDS programme/).fill("How many times can I retake a failed exam?");
  await panel.getByPlaceholder(/Ask about the AEDS programme/).press("Enter");
  const chip = panel.getByRole("button", { name: "Show source 1" }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  const card = panel.getByRole("region", { name: "Source 1" });
  await expect(card).toContainText("Examination regulations (2026)");
  await expect(card).toContainText("Section 8");
  await expect(card.getByRole("link", { name: /Open document/ })).toHaveAttribute("target", "_blank");
  await panel.getByRole("button", { name: /Sources \(1\)/ }).click();
  await expect(panel.getByText(/p\. 5, 8, 11/)).toBeVisible();
  await test.info().attach("citations", { body: await panel.screenshot(), contentType: "image/png" });
  await panel.screenshot({ path: "test-results/citations.png" });
});

test("planner suggests and applies a workload move", async ({ page }) => {
  await open(page);
  await importFixture(page);
  // Make WiSe26/27 overloaded with extra planned electives.
  await page.keyboard.press("Control+k");
  for (const code of ["wir901", "wir890", "inf007"]) {
    await page.getByPlaceholder(/Search by code/).fill(code);
    await page.keyboard.press("Enter");
    const dlg = page.getByRole("dialog", { name: "Add a course" });
    await dlg.getByRole("combobox").first().selectOption("WiSe26/27").catch(() => {});
    await dlg.getByRole("button", { name: /Add course/ }).click();
    await page.keyboard.press("Control+k");
  }
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("4");
  const card = page.getByRole("region", { name: "Workload by semester" }).or(page.locator("section", { has: page.getByText("Workload by semester") })).first();
  await expect(card).toBeVisible();
  await card.screenshot({ path: "test-results/workload.png" });
  const load = card.getByTestId("load-WiSe26/27");
  await expect(load).toContainText("42");
  const move = card.getByRole("button", { name: /^Move to / });
  await expect(move.first()).toBeVisible();
  const target = (await move.first().textContent())!.replace("Move to ", "").trim();
  const before = (await courses(page)).filter((c) => c.semester === "WiSe26/27").length;
  await move.first().click();
  await expect.poll(async () => (await courses(page)).filter((c) => c.semester === "WiSe26/27").length).toBe(before - 1);
  expect((await courses(page)).some((c) => c.semester === target)).toBe(true);
  await expect(load).toContainText("36");
});

test("print opens an A4 progress report without what-if courses", async ({ page }) => {
  await open(page);
  await importFixture(page);
  await page.getByLabel("Target GPA").fill("1.8");
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("ects-tracker-state")!);
    s.courses.push({ id: "w1", name: "wir901 - Environmental Economics", category: "economics", ects: 6, semester: "SoSe26", status: "completed", grade: "1.0", hypothetical: true });
    localStorage.setItem("ects-tracker-state", JSON.stringify(s));
  });
  await page.reload();
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const [report] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: /Print or save as PDF/ }).click()]);
  await report.waitForLoadState();
  await expect(report).toHaveTitle(/AEDS progress report/);
  await expect(report.locator("h2")).toContainText(["Requirements", "Compulsory modules", "Courses by semester"]);
  await expect(report.getByText(/Target GPA/)).toBeVisible();
  const record = await report.locator("body").innerText();
  expect(record).toContain("International Trade, Production and Change");
  expect(record.split("Suggested schedule")[0]).not.toContain("Environmental Economics");
  await report.setViewportSize({ width: 794, height: 1123 });
  await report.screenshot({ path: "test-results/report.png", fullPage: true });
  const pdf = await report.pdf({ format: "A4" }).catch(() => null);
  if (pdf) expect(pdf.length).toBeGreaterThan(10_000);
});
