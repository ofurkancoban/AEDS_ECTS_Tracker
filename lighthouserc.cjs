// Lighthouse CI: scores the production build (served from dist/) and fails
// when a category drops below its threshold. Mobile emulation with
// Lighthouse's default throttling, three runs, median taken.
module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      url: ["http://localhost/index.html"],
      numberOfRuns: 3,
      settings: { chromeFlags: "--no-sandbox --headless=new" },
    },
    assert: {
      assertions: {
        // Measured 2026-10-13 (median of 3): performance 95, the rest 100.
        "categories:performance": ["error", { minScore: 0.85, aggregationMethod: "median-run" }],
        "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
        "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
        "categories:seo": ["error", { minScore: 0.9, aggregationMethod: "median-run" }],
      },
    },
    upload: { target: "filesystem", outputDir: "./lighthouse-report" },
  },
};
