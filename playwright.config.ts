import { defineConfig, devices } from "@playwright/test";

import { getE2EWebBaseUrl } from "./src/lib/testing/e2e-web";

// PLAYWRIGHT_ENGINES=all runs the suite on the three engines (a manual pre-deploy check, not part of CI); the default stays one project.
// Needs the engines: `npx playwright install firefox webkit`.
const engines = process.env.PLAYWRIGHT_ENGINES === "all";

export default defineConfig({
  projects: engines
    ? [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
      ]
    : undefined,
  testDir: "./tests/e2e",
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? getE2EWebBaseUrl(),
    // The app follows the browser language; pin English so the existing specs stay deterministic.
    locale: "en-US",
    // A registered service worker can interfere with the page.route mocks every spec relies on; only pwa.web.spec.ts opts in.
    serviceWorkers: "block",
  },
});
