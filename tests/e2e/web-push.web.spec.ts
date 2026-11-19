import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

import { json, mockCustomerRest, professionalId, shopId, signInAsCustomer } from "./customer-helpers";
import { stubPushSubscription } from "./web-push-helpers";

test.use({ serviceWorkers: "allow" });

test("the Settings switch turns notifications on (registering this origin) and off (deactivating the subscription)", async ({ context, page }) => {
  let registered: Record<string, unknown> | null = null;
  let deactivated: Record<string, unknown> | null = null;

  await context.grantPermissions(["notifications"]);
  await stubPushSubscription(page);
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/register_web_push_subscription")) {
      registered = route.request().postDataJSON() as Record<string, unknown>;
      await page.evaluate(() => { (window as unknown as { __subscribed?: boolean }).__subscribed = true; });

      return json(route, [{ active: true }]), true;
    }
    if (url.pathname.endsWith("/rpc/deactivate_my_web_subscription")) {
      deactivated = route.request().postDataJSON() as Record<string, unknown>;

      return json(route, null), true;
    }
  });

  await page.goto("/me/settings");
  const toggle = page.getByRole("switch", { name: "Notifications" });

  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.click();

  await expect(toggle).toBeChecked();
  expect(registered).toMatchObject({
    target_origin: new URL(page.url()).origin,
    target_subscription: { endpoint: "https://push.example/e2e", keys: { auth: "e2e-auth", p256dh: "e2e-p256dh" } },
  });

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(deactivated).toEqual({ target_endpoint: "https://push.example/e2e" });
});

test("blocked notifications disable the switch and explain how to turn them back on", async ({ context, page }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "denied" });
  });
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/settings");
  await expect(page.getByRole("switch", { name: "Notifications" })).toBeDisabled();
  await expect(page.getByText("Allow notifications for this site in your browser settings, then reload the page.")).toBeVisible();
});

test("on an iPhone without the installed app the row opens the install guide", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
  });
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/settings");
  await page.getByTestId("notifications-switch-install").click();
  await expect(page.getByTestId("install-guide")).toBeVisible();
});

async function signInAs(page: Page, role: "owner" | "professional") {
  const userId = "55555555-5555-4555-8555-555555555555";

  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Staff", role, user_id: userId }]);
    if (path.endsWith("/rpc/count_unread_notifications")) return json(route, 0);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/get_my_professional_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: professionalId, name: "Staff", shop_id: shopId }]);
    }

    return json(route, []);
  });
}

test("the owner's Settings have the switch", async ({ page }) => {
  await signInAs(page, "owner");
  await page.goto("/owner-profile/settings");
  await expect(page.getByRole("switch", { name: "Notifications" })).toBeVisible();
});

test("the professional's Settings have the switch", async ({ page }) => {
  await signInAs(page, "professional");
  await page.goto("/my-profile/settings");
  await expect(page.getByRole("switch", { name: "Notifications" })).toBeVisible();
});
