import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "allow" });

test("the export serves the manifest, the icons and a service worker that registers", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ body: "[]", contentType: "application/json" }));
  const manifest = await page.request.get("/manifest.json");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe("Zenc");
  for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
    expect((await page.request.get(`/icons/${icon}`)).ok(), icon).toBe(true);
  }

  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.json");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Zenc");
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
});
