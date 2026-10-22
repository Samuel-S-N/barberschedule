import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";

async function signIn(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: barberUserId });
}

const series = (id: string, overrides: Record<string, unknown> = {}) => ({
  active: true, barber_service_id: "bs1", cancel_requested_at: null, customer_id: "c1", customer_name: "Ana Souza", customer_phone: "11912345678", ended_at: null, id,
  interval_weeks: 1, local_start_date: "2026-11-02", local_start_time: "10:00:00", service_name: "Browser Cut", special_price_cents: 2500, ...overrides,
});

async function openPlans(page: Page, rows: unknown[]) {
  const calls: { ended: unknown[] } = { ended: [] };
  let current = rows;

  await signIn(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Barber", role: "barber", user_id: barberUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId }]);
    }
    if (path.endsWith("/rpc/list_my_recurrence_series")) return json(route, current);
    if (path.endsWith("/rpc/end_recurrence_series")) {
      const body = route.request().postDataJSON() as { target_series_id: string };

      calls.ended.push(body);
      current = current.map((row) => ((row as { id: string }).id === body.target_series_id ? { ...(row as object), active: false, ended_at: "2026-10-21T12:00:00Z" } : row));

      return json(route, current.filter((row) => (row as { id: string }).id === body.target_series_id));
    }
    if (path.endsWith("/rpc/list_recurrence_requests") || path.endsWith("/rpc/list_recurrence_cancellations") || path.endsWith("/rpc/list_my_barber_agenda")) return json(route, []);
    if (path.endsWith("/schedule_overrides")) return json(route, []);
    await route.abort();
  });
  await page.goto("/my-profile/recurrence");

  return calls;
}

test("the barber sees the active plans of their customers, with no end date, and ends one after confirming", async ({ page }) => {
  const calls = await openPlans(page, [series("s1"), series("s2", { customer_name: "Caio Lima", interval_weeks: 2 }), series("s3", { active: false, customer_name: "Old Customer", ended_at: "2026-09-01T12:00:00Z" })]);

  await expect(page.getByRole("heading", { name: "Active plans" })).toBeVisible();
  await expect(page.getByText("No end date: it stays active until cancelled.").first()).toBeVisible();
  await expect(page.getByTestId("my-series-s1")).toContainText("Ana Souza");
  await expect(page.getByTestId("my-series-s1")).toContainText("Browser Cut");
  await expect(page.getByTestId("my-series-s2")).toContainText("Every 2 weeks");
  // Ended plans are not listed here.
  await expect(page.getByTestId("my-series-s3")).toHaveCount(0);

  await page.getByTestId("my-series-end-s1").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-cancel").click();
  expect(calls.ended).toEqual([]);

  await page.getByTestId("my-series-end-s1").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => calls.ended).toEqual([{ target_series_id: "s1" }]);
  await expect(page.getByText("Plan ended.")).toBeVisible();
  await expect(page.getByTestId("my-series-s1")).toHaveCount(0);
  await expect(page.getByTestId("my-series-s2")).toBeVisible();
});

test("with no active plans the section is not shown", async ({ page }) => {
  await openPlans(page, []);

  await expect(page.getByRole("heading", { name: "Active plans" })).toHaveCount(0);
});
