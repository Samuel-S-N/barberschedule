import { expect, test } from "./fixtures";

import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";
import { stubPushSubscription } from "./web-push-helpers";

test.use({ notificationsPrompt: true, serviceWorkers: "allow" });
// Playwright's WebKit (a Linux port) cannot run these: (1) context.grantPermissions(["notifications"]) is a silent no-op, so the permission
// stays "default"; (2) the real PushManager.getSubscription() never settles and wedges the page (no push service on Linux); (3) once the
// service worker controls the page, requests bypass page.route. Chromium and Firefox run them. Push on real Safari is a manual check.
test.skip(({ browserName }) => browserName === "webkit", "push and service worker are not testable on Playwright's WebKit (Linux)");

test("the first sign-in on a device asks once to turn notifications on", async ({ page }) => {
  let registered: Record<string, unknown> | null = null;

  await stubPushSubscription(page);
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/register_web_push_subscription")) {
      registered = route.request().postDataJSON() as Record<string, unknown>;

      return json(route, [{ active: true }]), true;
    }
  });
  await page.addInitScript(() => {
    // Chrome in automation answers the permission prompt itself: grant it when asked so Turn on completes.
    Object.defineProperty(Notification, "requestPermission", { configurable: true, value: async () => "granted" });
  });

  await page.goto("/profile");
  await expect(page.getByTestId("notifications-prompt")).toBeVisible();
  await page.getByTestId("notifications-prompt-enable").click();

  await expect(page.getByTestId("notifications-prompt")).toHaveCount(0);
  await expect.poll(() => registered).toMatchObject({ target_subscription: { endpoint: "https://push.example/e2e" } });
});

test("Not now closes it and a reload does not bring it back", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/profile");
  await page.getByTestId("notifications-prompt-later").click();
  await expect(page.getByTestId("notifications-prompt")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("profile-avatar")).toBeVisible();
  await expect(page.getByTestId("notifications-prompt")).toHaveCount(0);
});

test("it never asks when the permission is already decided", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "denied" });
  });
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/profile");
  await expect(page.getByTestId("profile-avatar")).toBeVisible();
  await expect(page.getByTestId("notifications-prompt")).toHaveCount(0);
});

test("an iPhone that has not installed the app is pointed to the install guide", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
  });
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/profile");
  await expect(page.getByTestId("notifications-prompt-install")).toBeVisible();
  await expect(page.getByTestId("notifications-prompt-enable")).toHaveCount(0);
  await page.getByTestId("notifications-prompt-install").click();
  await expect(page.getByTestId("install-guide")).toBeVisible();
});
