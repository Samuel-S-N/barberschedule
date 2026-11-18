import { expect, test } from "./fixtures";

import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";
import { stubPushSubscription } from "./web-push-helpers";

test.use({ serviceWorkers: "allow" });

test("turning notifications on registers the subscription with this origin and shows it is on", async ({ context, page }) => {
  let registered: Record<string, unknown> | null = null;

  await context.grantPermissions(["notifications"]);
  await stubPushSubscription(page);
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/register_web_push_subscription")) {
      registered = route.request().postDataJSON() as Record<string, unknown>;

      return json(route, [{ active: true }]), true;
    }
  });

  await page.goto("/profile");
  await expect(page.getByText("Turn on notifications")).toBeVisible();
  await page.getByTestId("notify-button").click();

  await expect(page.getByText("Notifications are on")).toBeVisible();
  expect(registered).toMatchObject({
    target_origin: new URL(page.url()).origin,
    target_subscription: { endpoint: "https://push.example/e2e", keys: { auth: "e2e-auth", p256dh: "e2e-p256dh" } },
  });
});

test("blocked notifications explain how to turn them back on", async ({ context, page }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "denied" });
  });
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/profile");
  await expect(page.getByText("Notifications are blocked")).toBeVisible();
});
