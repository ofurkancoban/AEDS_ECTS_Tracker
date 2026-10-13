import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the production build (vite preview). Set
// PW_CHROMIUM_PATH to reuse a locally installed Chromium instead of
// `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const PORT = 4179;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    timezoneId: "Europe/Berlin",
    launchOptions: { executablePath },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
