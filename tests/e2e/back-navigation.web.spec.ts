import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, mockCustomerRest, shopId, signInAsCustomer } from "./customer-helpers";

// Earlier screens stay mounted (aria-hidden) in the navigators; click the active screen's back button.
const back = (page: Page) => page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();

const staffUserId = "66666666-6666-4666-8666-666666666666";
const clientId = "44444444-4444-4444-8444-444444444444";

async function signInAs(page: Page, id: string) {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: id });
}

async function mockStaff(page: Page, role: "barber" | "owner", extra?: (path: string, route: import("@playwright/test").Route) => Promise<boolean>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (extra && (await extra(path, route))) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Staff", role, user_id: staffUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId }]);
    }
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_my_barber_agenda") || path.endsWith("/rpc/list_owner_barbers") || path.endsWith("/rpc/list_my_customers")) return json(route, []);
    await route.abort();
  });
}

test.describe("customer", () => {
  test("profile sub-screens go back to the profile, one level at a time", async ({ page }) => {
    await signInAsCustomer(page);
    await mockCustomerRest(page);

    await page.goto("/profile");
    await page.getByTestId("menu-account").click();
    await expect(page).toHaveURL(/\/me\/account/);
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);

    await page.getByTestId("menu-security").click();
    await page.getByTestId("menu-password").click();
    await expect(page).toHaveURL(/\/me\/security\/password/);
    await back(page);
    await expect(page).toHaveURL(/\/me\/security$/);
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);

    await page.getByTestId("menu-settings").click();
    await page.getByTestId("menu-language").click();
    await back(page);
    await expect(page).toHaveURL(/\/me\/settings$/);
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("recurrence and notifications go back to their fixed parents even after a cold start", async ({ page }) => {
    await signInAsCustomer(page);
    await mockCustomerRest(page);

    await page.goto("/me/recurrence");
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);

    await page.goto("/notifications");
    await back(page);
    await expect(page).toHaveURL(/\/home$/);
  });
});

test.describe("barber", () => {
  test("profile sub-screens go back to the hub and nested ones one level", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "barber");

    await page.goto("/my-profile");
    await page.getByTestId("menu-security").click();
    await page.getByTestId("menu-password").click();
    await expect(page).toHaveURL(/\/my-profile\/security\/password/);
    await back(page);
    await expect(page).toHaveURL(/\/my-profile\/security$/);
    await back(page);
    await expect(page).toHaveURL(/\/my-profile$/);
  });

  test("a recurrence request opened from a notification goes back to the profile, not in circles", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "barber", async (path, route) => {
      if (path.endsWith("/rpc/count_unread_notifications")) return json(route, 1).then(() => true);
      if (path.endsWith("/notifications")) {
        return json(route, [{ appointment_id: null, created_at: "2026-10-20T10:00:00Z", id: "n1", kind: "recurrence_requested", params: { customer_name: "Ana", interval_weeks: 1, service_name: "Cut" }, read_at: null }]).then(() => true);
      }
      if (path.endsWith("/rpc/list_recurrence_requests")) return json(route, []).then(() => true);

      return false;
    });

    await page.goto("/my-agenda");
    await page.getByTestId("notification-bell").click();
    await page.getByTestId("notification-n1").click();
    await expect(page).toHaveURL(/\/my-profile\/recurrence/);
    await back(page);
    await expect(page).toHaveURL(/\/my-profile$/);
  });

  test("a client opened from anywhere goes back to the full client list", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "barber");

    await page.goto("/my-agenda");
    await page.goto(`/clients/${clientId}`);
    await back(page);
    await expect(page).toHaveURL(/\/clients$/);
  });
});

test.describe("owner", () => {
  test("notifications, profile, barber profile and conflicts go back to their parents", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "owner");

    await page.goto("/owner-notifications");
    await back(page);
    await expect(page).toHaveURL(/\/agenda$/);

    await page.goto("/owner-profile/security/password");
    await back(page);
    await expect(page).toHaveURL(/\/owner-profile\/security$/);
    await back(page);
    await expect(page).toHaveURL(/\/settings$/);

    await page.goto(`/barber-profile?id=${clientId}`);
    await back(page);
    await expect(page).toHaveURL(/\/barbers$/);

    await page.goto("/recurrence-conflicts");
    await back(page);
    await expect(page).toHaveURL(/\/monthly-customers$/);
  });
});
