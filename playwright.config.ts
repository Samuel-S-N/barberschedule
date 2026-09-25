import { defineConfig } from "@playwright/test";

import { getE2EWebBaseUrl } from "./src/lib/testing/e2e-web";

export default defineConfig({
  testDir: "./tests/e2e",
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? getE2EWebBaseUrl(),
    // The app follows the browser language; pin English so the existing specs stay deterministic.
    locale: "en-US",
  },
});
