import { expect, test } from "@playwright/test";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, resolve } from "node:path";
import { stageLayout } from "../scripts/stage-layout.mjs";
import { FIXTURE, LATEST_CHANGELOG, isolate } from "./helpers";

// The preview layout as it will be deployed: classic UI at /, new design at
// /next/, same origin, served by a tiny static server.
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".csv": "text/csv",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};
let server: Server;
let base: string;

test.beforeAll(async ({}, info) => {
  const out = stageLayout(resolve("dist"), resolve(`dist-staged/w${info.workerIndex}`));
  server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url!, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = join(out, path);
    if (!file.startsWith(out) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as { port: number }).port}/`;
});
test.afterAll(() => server?.close());

test("classic UI at the root offers the new design, and both share the data", async ({ page }) => {
  await isolate(page);
  await page.addInitScript((v) => localStorage.setItem("changelog_seen", v), LATEST_CHANGELOG);
  await page.goto(base);
  const tryIt = page.getByRole("region", { name: "New design preview" });
  await expect(tryIt).toBeVisible();

  // Data entered in the new design...
  await tryIt.getByRole("link", { name: /Try the new design/ }).click();
  await expect(page).toHaveURL(base + "next/");
  await expect(page.getByRole("note")).toContainText("You're trying the new design");
  await page.setInputFiles('input[accept*="csv"]', FIXTURE);
  await expect(page.getByText("Imported 13 course(s).")).toBeVisible();

  // ...shows up in the classic UI.
  await page.getByRole("note").getByRole("link", { name: "Back to classic" }).click();
  await expect(page).toHaveURL(base);
  await expect(page.getByText(/International Trade, Production and Change/).first()).toBeVisible();

  // Hiding the button is remembered.
  await page.getByRole("button", { name: "Hide the new design button" }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "New design preview" })).toHaveCount(0);
});

test("the new design works under /next/ with its own data files and offline cache", async ({ page }) => {
  await isolate(page);
  await page.addInitScript((v) => localStorage.setItem("changelog_seen", v), LATEST_CHANGELOG);
  await page.goto(base + "next/");
  await expect(page.locator("h1:visible").first()).toBeVisible();
  // The live catalog is loaded from /next/catalog.csv (not the bundled copy).
  const catalog = await page.evaluate(() => fetch("catalog.csv").then((r) => r.status));
  expect(catalog).toBe(200);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope), { timeout: 10_000 }).toBe(base + "next/");
  await expect(page.getByRole("link", { name: "Classic view" })).toHaveAttribute("href", "../");
});
