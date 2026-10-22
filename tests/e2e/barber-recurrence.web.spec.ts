import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";
import type { RestHandler } from "./customer-helpers";

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

const barberProfile = {
  avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null,
  commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId,
};

async function mockBarberRest(page: Page, handler?: RestHandler) {
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (handler && (await handler(route, url)) === true) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Barber", role: "barber", user_id: barberUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) return json(route, [barberProfile]);
    if (path.endsWith("/rpc/list_my_barber_services")) return json(route, [{ active: true, barber_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
    if (path.endsWith("/rpc/barber_search_customers")) return json(route, [{ email: null, full_name: "Walk In", has_account: false, id: "c-walk", phone: "11999990000" }]);
    if (path.endsWith("/rpc/list_recurrence_plans_for_barber")) {
      return json(route, [
        { barber_service_id: "bs1", interval_weeks: 1, name: "Corte mensal", normal_cents: 4000, plan_id: "plan-w1", price_cents: 3000, service_name: "Browser Cut" },
        { barber_service_id: "bs1", interval_weeks: 3, name: "Trimestral", normal_cents: 4000, plan_id: "plan-w3", price_cents: 3500, service_name: "Browser Cut" },
      ]);
    }
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    if (path.endsWith("/rpc/list_my_barber_agenda")) return json(route, []);
    await route.abort();
  });
}


const request = {
  barber_id: barberId, barber_name: "Browser Barber", customer_name: "Dani Costa", customer_phone: "11912345678", id: "rq1", interval_weeks: 2,
  local_start_date: "2026-11-03", local_start_time: "11:00:00", normal_cents: 4000, recurrence_cents: null, service_name: "Browser Cut",
};

test("a barber answers a recurrence request and sees the customer's WhatsApp", async ({ page }) => {
  const calls: unknown[] = [];

  await signIn(page);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_recurrence_requests")) return json(route, [request]).then(() => true);
    if (url.pathname.endsWith("/rpc/decide_recurrence_request")) {
      calls.push(route.request().postDataJSON());
      return json(route, [{}]).then(() => true);
    }
  });

  await page.goto("/my-profile");
  await page.getByTestId("menu-recurrence").click();
  await expect(page).toHaveURL(/\/my-profile\/recurrence/);
  await expect(page.getByTestId("request-rq1")).toContainText("Dani Costa");
  await expect(page.getByTestId("request-rq1")).toContainText("Every 2 weeks");
  await expect(page.getByTestId("request-whatsapp-rq1")).toHaveAttribute("href", "https://wa.me/5511912345678");

  await page.getByTestId("request-accept-rq1").click();
  await page.getByTestId("request-reject-rq1").click();
  await expect.poll(() => calls).toEqual([{ accept: true, target_request_id: "rq1" }, { accept: false, target_request_id: "rq1" }]);
});

