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

test("the e-mail logo is a static PNG, served on a shop address and on the bare domain (not caught by the shop routing)", async ({ baseURL, request }) => {
  const shop = await request.get("/email/zenc-logo.png");
  const bare = await request.get(`${new URL(baseURL ?? "http://shop-a.localhost:4173").protocol}//localhost:${new URL(baseURL ?? "http://shop-a.localhost:4173").port}/email/zenc-logo.png`);

  for (const response of [shop, bare]) {
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).subarray(1, 4).toString()).toBe("PNG");
  }
});
