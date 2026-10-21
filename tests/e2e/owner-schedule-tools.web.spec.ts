import { expect, test } from "@playwright/test";

import { json } from "./customer-helpers";

const shopId = "11111111-1111-4111-8111-111111111111";
const barberId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";

test("the owner sees a weekly summary with the barber's lunch and copies the shop hours into an empty schedule", async ({ page }) => {
  const periods: Array<Record<string, unknown>> = [];

  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, [{ active: true, archived_at: null, commission_percent: "0.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId, user_id: null }]);
    if (path.endsWith("/rpc/list_shop_lunch_breaks")) return json(route, [{ barber_id: barberId, lunch_end: "13:00:00", lunch_start: "12:00:00" }]);
    if (path.endsWith("/shop_hours")) return json(route, [{ end_time: "18:00:00", start_time: "09:00:00", weekday: 1 }, { end_time: "17:00:00", start_time: "09:00:00", weekday: 2 }]);
    if (path.endsWith("/working_periods") && method === "GET") return json(route, periods);
    if (path.endsWith("/working_periods") && method === "POST") {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      const period = { id: `p${periods.length + 1}`, ...input };
      periods.push(period);

      return json(route, period);
    }
    if (path.endsWith("/schedule_overrides")) return json(route, []);
    await route.abort();
  });

  await page.goto("/schedule");
  await expect(page.getByTestId("schedule-summary-1")).toContainText("Closed");
  await expect(page.getByTestId("schedule-lunch")).toContainText("12:00–13:00");

  await page.getByTestId("schedule-copy-shop-hours").click();
  await expect(page.getByTestId("schedule-summary-1")).toContainText("09:00–18:00");
  await expect(page.getByTestId("schedule-summary-2")).toContainText("09:00–17:00");
  await expect(page.getByTestId("schedule-summary-3")).toContainText("Closed");
  expect(periods).toHaveLength(2);
  await expect(page.getByTestId("schedule-copy-shop-hours")).toHaveCount(0);
});
