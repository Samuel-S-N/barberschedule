import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const barberUserId = "66666666-6666-4666-8666-666666666666";
const slot = { ends_at: "2099-01-04T12:30:00Z", local_date: "2099-01-04", local_time: "09:00:00", starts_at: "2099-01-04T12:00:00Z" };

type Role = "barber" | "owner";

async function signIn(page: Page, role: Role) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: role === "owner" ? ownerId : barberUserId });
}

const plan = (planId: string, name: string, serviceId: string, weeks: number, price: number) => ({
  barber_service_id: serviceId, interval_weeks: weeks, name, normal_cents: 3500, plan_id: planId, price_cents: price, service_name: "Browser Cut",
});

// Two barbers offer "Corte mensal"; only the first offers "Quinzenal".
const plansByBarber: Record<string, unknown[]> = {
  [barberId]: [plan("p-month", "Corte mensal", "bs1", 1, 2500), plan("p-biweekly", "Quinzenal", "bs1b", 2, 3000)],
  "barber-2": [plan("p-month", "Corte mensal", "bs2", 1, 2500)],
};

async function mockStaffRest(page: Page, role: Role, calls: { created: unknown[]; fail?: boolean }) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body = method === "POST" ? (route.request().postDataJSON() as Record<string, unknown>) : {};

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Staff", role, user_id: role === "owner" ? ownerId : barberUserId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_barbers")) {
      return json(route, [
        { active: true, archived_at: null, id: barberId, name: "Bruno Barber", shop_id: shopId, user_id: null },
        { active: true, archived_at: null, id: "barber-2", name: "Caio Cutter", shop_id: shopId, user_id: null },
      ]);
    }
    if (path.endsWith("/customers") && method === "GET") {
      return json(route, [
        { active: true, archived_at: null, email: null, full_name: "Ana Souza", id: "c1", phone: null, shop_id: shopId, user_id: null },
        { active: true, archived_at: null, email: null, full_name: "Dani Costa", id: "c2", phone: null, shop_id: shopId, user_id: null },
      ]);
    }
    if (path.endsWith("/rpc/barber_search_customers")) return json(route, [{ email: null, full_name: "Walk In", has_account: false, id: "c-walk", phone: "11999990000" }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId }]);
    }
    if (path.endsWith("/rpc/list_recurrence_plans_for_barber")) return json(route, plansByBarber[String(body.target_barber_id)] ?? []);
    if (path.endsWith("/rpc/get_available_slots")) {
      // Wednesdays have no free time.
      const weekday = new Date(`${String(body.local_date)}T12:00:00Z`).getUTCDay();

      return json(route, weekday === 3 ? [] : [slot]);
    }
    if (path.endsWith("/rpc/create_recurrence_for_customer")) {
      calls.created.push(body);
      if (calls.fail) return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400);

      return json(route, [{}]);
    }
    if (path.endsWith("/rpc/list_recurrence_requests") || path.endsWith("/rpc/list_recurrence_cancellations") || path.endsWith("/rpc/list_owner_recurrence_series")) return json(route, []);
    if (path.endsWith("/rpc/list_my_barber_services")) return json(route, []);
    if (path.endsWith("/barber_services") || path.endsWith("/services")) return json(route, []);
    if (path.endsWith("/rpc/list_my_barber_agenda") || path.endsWith("/schedule_overrides")) return json(route, []);
    await route.abort();
  });
}

async function openFlow(page: Page, role: Role, options: { fail?: boolean } = {}) {
  const calls = { created: [] as unknown[], fail: options.fail };

  await signIn(page, role);
  await mockStaffRest(page, role, calls);
  if (role === "owner") {
    await page.goto("/monthly-customers");
    await page.getByTestId("recurring-tab-active").click();
  } else {
    await page.goto("/my-profile/recurrence");
  }
  await page.getByTestId("recurring-manual").click();

  return calls;
}

for (const role of ["owner", "barber"] as const) {
  const total = role === "owner" ? 7 : 6;
  const routeEnd = role === "owner" ? "/recurrence-manual" : "/my-profile/recurrence-manual";
  const list = role === "owner" ? /\/monthly-customers/ : /\/my-profile\/recurrence/;
  const customerId = role === "owner" ? "c1" : "c-walk";

  test.describe(`${role} manual recurrence steps`, () => {
    test("Customer › Plan › (Barber) › Day › Time › Review, then create", async ({ page }) => {
      const calls = await openFlow(page, role);

      await expect(page).toHaveURL(new RegExp(`${routeEnd}$`));
      await expect(page.getByTestId("step-label")).toHaveText(`Step 1 of ${total} · Customer`);
      await expect(page.getByTestId("manual-customer-search")).toBeVisible();
      await page.getByTestId(`option-${customerId}`).click();

      await expect(page.getByTestId("step-label")).toHaveText(`Step 2 of ${total} · Plan`);
      await expect(page.getByTestId("offer-p-month").getByTestId("plan-amount")).toHaveText("R$ 100,00");
      await expect(page.getByTestId("offer-p-month")).toContainText("4 sessions per month");
      await page.getByTestId("offer-p-month").click();

      let step = 3;

      if (role === "owner") {
        await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 7 · Barber");
        await expect(page.getByTestId(`offer-barber-${barberId}`)).toBeVisible();
        await expect(page.getByTestId("offer-barber-barber-2")).toBeVisible();
        await page.getByTestId(`offer-barber-${barberId}`).click();
        step = 4;
      }

      await expect(page.getByTestId("step-label")).toHaveText(`Step ${step} of ${total} · Day`);
      await expect(page.getByTestId("weekday-3")).toBeDisabled();
      await expect(page.getByTestId("weekday-1")).toBeEnabled();
      await page.getByTestId("weekday-1").click();

      await expect(page.getByTestId("step-label")).toHaveText(`Step ${step + 1} of ${total} · Time`);
      await expect(page.getByTestId("manual-continue")).toBeDisabled();
      await page.getByRole("button", { name: "09:00" }).click();
      await page.getByTestId("manual-continue").click();

      await expect(page.getByTestId("step-label")).toHaveText(`Step ${step + 2} of ${total} · Review`);
      const summary = page.getByTestId("manual-summary");

      await expect(summary).toContainText("Corte mensal");
      await expect(summary).toContainText("Every Monday");
      await expect(summary).toContainText("R$ 100,00");
      await page.getByTestId("manual-recurrence-save").click();

      await expect.poll(() => calls.created).toEqual([{
        target_barber_service_id: "bs1", target_customer_id: customerId, target_interval_weeks: 1, target_start_date: "2099-01-04", target_start_time: "09:00",
      }]);
      await expect(page).toHaveURL(list);
      await expect(page.getByText("Recurring booking saved.")).toBeVisible();
    });

    test("back steps back, a finished step is tappable, the first step leaves", async ({ page }) => {
      await openFlow(page, role);
      const back = () => page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();

      await page.getByTestId(`option-${customerId}`).click();
      await page.getByTestId("offer-p-month").click();
      await back();
      await expect(page.getByTestId("step-label")).toHaveText(`Step 2 of ${total} · Plan`);
      await page.getByTestId("step-customer").click();
      await expect(page.getByTestId("step-label")).toHaveText(`Step 1 of ${total} · Customer`);
      await back();
      await expect(page).toHaveURL(list);
    });

    test("a refused time returns to the Time step with the error", async ({ page }) => {
      await openFlow(page, role, { fail: true });

      await page.getByTestId(`option-${customerId}`).click();
      await page.getByTestId("offer-p-month").click();
      if (role === "owner") await page.getByTestId(`offer-barber-${barberId}`).click();
      await page.getByTestId("weekday-1").click();
      await page.getByRole("button", { name: "09:00" }).click();
      await page.getByTestId("manual-continue").click();
      await page.getByTestId("manual-recurrence-save").click();

      await expect(page.getByText("That time is no longer available.")).toBeVisible();
      await expect(page.getByTestId("step-label")).toHaveText(new RegExp(`Step ${role === "owner" ? 5 : 4} of ${total} · Time`));
    });
  });
}

test("the Barber step lists only the barbers that offer the chosen plan", async ({ page }) => {
  await openFlow(page, "owner");

  await page.getByTestId("option-c1").click();
  await page.getByTestId("offer-p-biweekly").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 7 · Barber");
  await expect(page.getByTestId(`offer-barber-${barberId}`)).toBeVisible();
  await expect(page.getByTestId("offer-barber-barber-2")).toHaveCount(0);
});
