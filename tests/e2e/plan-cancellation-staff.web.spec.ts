import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const barberUserId = "66666666-6666-4666-8666-666666666666";

async function signIn(page: Page, id: string) {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: id });
}

const cancellation = { barber_name: "Browser Barber", customer_name: "Dani Costa", customer_phone: "11912345678", interval_weeks: 2, requested_at: "2026-10-21T15:00:00Z", series_id: "series-1", service_name: "Browser Cut" };

async function mockStaffRest(page: Page, role: "barber" | "owner") {
  const calls: Record<string, unknown> = {};
  let cancellations: unknown[] = [cancellation];

  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Staff", role, user_id: role === "owner" ? ownerId : barberUserId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_recurrence_requests")) return json(route, []);
    if (path.endsWith("/rpc/list_recurrence_cancellations")) return json(route, cancellations);
    if (path.endsWith("/rpc/decide_series_cancellation")) {
      calls.decide = route.request().postDataJSON();
      cancellations = [];

      return json(route, null);
    }
    if (path.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId }]);
    }
    if (path.endsWith("/rpc/list_my_barber_services")) return json(route, []);
    if (path.endsWith("/rpc/list_owner_recurrence_series")) return json(route, []);
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, []);
    if (path.endsWith("/rpc/list_owner_barber_services") || path.endsWith("/barber_services")) return json(route, []);
    if (path.endsWith("/services") && method === "GET") return json(route, []);
    if (path.endsWith("/customers") && method === "GET") return json(route, []);
    if (path.endsWith("/rpc/barber_search_customers")) return json(route, []);
    await route.abort();
  });

  return calls;
}

for (const role of ["owner", "barber"] as const) {
  test(`${role}: a cancellation request is listed with Accept and Keep plan`, async ({ page }) => {
    await signIn(page, role === "owner" ? ownerId : barberUserId);
    const calls = await mockStaffRest(page, role);

    await page.goto(role === "owner" ? "/monthly-customers" : "/my-profile/recurrence");
    if (role === "owner") await page.getByTestId("recurring-tab-requests").click();

    await expect(page.getByText("Cancellation requests")).toBeVisible();
    await expect(page.getByTestId("cancellation-series-1")).toContainText("Dani Costa");
    await expect(page.getByTestId("cancellation-series-1")).toContainText("Browser Cut");
    await expect(page.getByTestId("cancellation-series-1")).toContainText("Every 2 weeks");
    // With a cancellation to answer, the "no requests" empty state is not shown.
    await expect(page.getByText("No pending requests.")).toHaveCount(0);

    await page.getByTestId("cancellation-accept-series-1").click();
    await expect.poll(() => calls.decide).toEqual({ accept: true, target_series_id: "series-1" });
    await expect(page.getByTestId("cancellation-series-1")).toHaveCount(0);
    await expect(page.getByText("Plan cancelled.")).toBeVisible();
  });

  test(`${role}: Keep plan declines the cancellation request`, async ({ page }) => {
    await signIn(page, role === "owner" ? ownerId : barberUserId);
    const calls = await mockStaffRest(page, role);

    await page.goto(role === "owner" ? "/monthly-customers" : "/my-profile/recurrence");
    if (role === "owner") await page.getByTestId("recurring-tab-requests").click();
    await page.getByTestId("cancellation-decline-series-1").click();

    await expect.poll(() => calls.decide).toEqual({ accept: false, target_series_id: "series-1" });
    await expect(page.getByText("Plan kept.")).toBeVisible();
  });
}
