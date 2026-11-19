import type { Page } from "@playwright/test";

// A Chrome-like install prompt that was captured before the bundle mounted (what the head script leaves on `window`).
export async function stubInstallPrompt(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__zencInstallPromptEvent = {
      preventDefault() {},
      prompt: async () => { (window as unknown as Record<string, unknown>).__installPrompted = true; },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    };
  });
}
