import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, mockCustomerRest, shopId, signInAsCustomer } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";
const ownerUserId = "77777777-7777-4777-8777-777777777777";

async function signIn(page: Page, userId: string) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
}

async function mockStaffRest(page: Page, role: "barber" | "owner", userId: string) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Staff", role, user_id: userId }]);
    if (path.endsWith("/rpc/export_my_data")) return json(route, { appointments: [], barbers: [] });
    if (path.endsWith("/rpc/get_my_barber_profile")) return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Staff", shop_id: shopId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, []);
    await route.abort();
  });
}

const settingsRoutes = { barber: "/my-profile/settings", customer: "/me/settings", owner: "/owner-profile/settings" } as const;
const privacyRoutes = { barber: "/my-profile/privacy", customer: "/me/privacy", owner: "/owner-profile/privacy" } as const;

async function open(page: Page, role: "barber" | "customer" | "owner") {
  if (role === "customer") {
    await signInAsCustomer(page);
    await mockCustomerRest(page, async (route, url) => {
      if (url.pathname.endsWith("/rpc/export_my_data")) {
        await json(route, { appointments: [] });
        return true;
      }
    });
  } else {
    await signIn(page, role === "barber" ? barberUserId : ownerUserId);
    await mockStaffRest(page, role, role === "barber" ? barberUserId : ownerUserId);
  }
}

for (const role of ["customer", "barber", "owner"] as const) {
  test(`${role}: Settings holds only the language`, async ({ page }) => {
    await open(page, role);
    await page.goto(settingsRoutes[role]);

    await expect(page.getByTestId("menu-language")).toBeVisible();
    await expect(page.getByTestId("profile-export")).toHaveCount(0);
  });

  test(`${role}: Privacy and data has the terms and the data download`, async ({ page }) => {
    await open(page, role);
    await page.goto(privacyRoutes[role]);

    await expect(page.getByTestId("privacy-terms")).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("profile-export").click()]);

    expect(download.suggestedFilename()).toMatch(/^barberschedule-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    if (role === "owner") {
      await expect(page.getByTestId("profile-delete")).toHaveCount(0);
      await expect(page.getByTestId("owner-privacy-note")).toBeVisible();
    } else {
      await expect(page.getByTestId("profile-delete")).toBeVisible();
    }
  });
}
