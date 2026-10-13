import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

export const FIXTURE = path.join(import.meta.dirname, "fixtures", "transcript.csv");
export const FIXTURE_COUNT = 13;
// The "What's new" popup opens unless this exact version was seen.
export const LATEST_CHANGELOG: string = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "CHANGELOG.json"), "utf8"))[0].version;

export interface Course {
  id: string;
  name: string;
  category: string;
  semester: string;
  status: string;
  grade: string;
  hypothetical?: boolean;
}

/** Blocks every third-party call (assistant API, visit counter, ratings) so tests are offline and send nothing real. */
export async function isolate(page: Page, chat?: (message: string) => { status: number; body: unknown }) {
  await page.route("https://abacus.jasoncameron.dev/**", (r) => r.fulfill({ json: { value: 1234 } }));
  await page.route("https://raw.githubusercontent.com/**", (r) => r.fulfill({ json: { wir821: { sum: 7, count: 2 } } }));
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 204 }));
  await page.route("https://aeds-rag-assistant.ofurkan.co/**", async (r) => {
    const url = r.request().url();
    if (url.endsWith("/auth/guest")) return r.fulfill({ json: { access_token: "test-token" } });
    if (url.endsWith("/chat/feedback")) return r.fulfill({ json: {} });
    const body = r.request().postDataJSON() as { message: string };
    const res = chat ? chat(body.message) : { status: 200, body: { answer: "**Sure.** Take:\n- wir895\n- wir894", thread_id: "t1", query_log_id: 1 } };
    return r.fulfill({ status: res.status, json: res.body });
  });
}

/** Fresh app with the changelog popup already seen. */
export async function open(page: Page, opts: { palette?: string; theme?: "light" | "dark" } = {}) {
  await isolate(page);
  await page.addInitScript((o) => {
    if (sessionStorage.getItem("init")) return;
    sessionStorage.setItem("init", "1");
    localStorage.setItem("changelog_seen", o.seen);
    if (o.palette) localStorage.setItem("ects-tracker-palette", o.palette);
    if (o.theme) localStorage.setItem("ects-tracker-state", JSON.stringify({ courses: [], theme: o.theme }));
  }, { ...opts, seen: LATEST_CHANGELOG });
  await page.goto("/");
  await expect(page.locator("h1:visible").first()).toBeVisible();
}

export async function importFixture(page: Page) {
  await page.setInputFiles('input[accept*="csv"]', FIXTURE);
  await expect(page.getByText(`Imported ${FIXTURE_COUNT} course(s).`)).toBeVisible();
  await expect.poll(async () => (await courses(page)).length).toBe(FIXTURE_COUNT);
}

export async function courses(page: Page): Promise<Course[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("ects-tracker-state") || '{"courses":[]}').courses);
}

export async function byCode(page: Page, code: string): Promise<Course | undefined> {
  return (await courses(page)).find((c) => c.name.startsWith(code + " "));
}

export async function noHorizontalScroll(page: Page) {
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scroll).toBeLessThanOrEqual(client);
}
