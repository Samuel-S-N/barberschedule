import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, barberServiceId, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const slot = { ends_at: "2099-01-04T12:30:00Z", local_date: "2099-01-04", local_time: "09:00:00", starts_at: "2099-01-04T12:00:00Z" };

const row = (overrides: Record<string, unknown>) => ({
  barber_name: "Browser Barber", cancel_requested_at: null, id: "rq1", interval_weeks: 1, local_start_date: "2026-10-23", local_start_time: "16:30:00", plan_name: "Corte mensal",
  recurrence_cents: 2500, series_active: true, series_ended_at: null, series_id: "series-1", service_name: "Browser Cut", status: "accepted", ...overrides,
});

async function openPlans(page: Page, initial: unknown[]) {
  const calls: Record<string, unknown> = {};
  let rows = initial;

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_recurrence_plans_for_barber")) {
      await json(route, [
        { barber_service_id: barberServiceId, interval_weeks: 1, name: "Corte mensal", normal_cents: 3500, plan_id: "plan-w1", price_cents: 2500, service_name: "Browser Cut" },
        { barber_service_id: barberServiceId, interval_weeks: 2, name: "Quinzenal", normal_cents: 3500, plan_id: "plan-w2", price_cents: 3000, service_name: "Browser Cut" },
      ]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/get_available_slots")) {
      await json(route, [slot]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/list_my_recurrence_requests")) {
      await json(route, rows);
      return true;
    }
    if (url.pathname.endsWith("/rpc/request_recurrence")) {
      calls.request = route.request().postDataJSON();
      await json(route, [{}]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/request_series_cancellation")) {
      calls.cancellation = route.request().postDataJSON();
      rows = rows.map((item) => ({ ...(item as object), cancel_requested_at: "2026-10-21T15:00:00Z" }));
      await json(route, null);
      return true;
    }
  });
  await page.goto("/me/recurrence");

  return calls;
}

async function pickPlanBarberDayTime(page: Page, planId: string) {
  await page.getByTestId(`offer-${planId}`).click();
  await page.getByTestId(`offer-barber-${barberId}`).click();
  await page.getByTestId("weekday-1").click();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByTestId("recurrence-time-continue").click();
  await page.getByTestId("recurrence-send").click();
}

test("with an active plan the top button is gone and a bottom bar offers Change plan", async ({ page }) => {
  await openPlans(page, [row({})]);

  await expect(page.getByTestId("my-request-rq1")).toContainText("Corte mensal");
  await expect(page.getByTestId("my-request-status-rq1")).toHaveText("Active");
  await expect(page.getByTestId("recurrence-request")).toHaveCount(0);
  await expect(page.getByTestId("plans-bottom-bar")).toBeVisible();
  await expect(page.getByTestId("plan-change")).toBeVisible();
});

test("Change plan runs the same flow and the request replaces the running series", async ({ page }) => {
  const calls = await openPlans(page, [row({})]);

  await page.getByTestId("plan-change").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 6 · Plan");
  await expect(page.getByTestId("plans-bottom-bar")).toHaveCount(0);
  await pickPlanBarberDayTime(page, "plan-w2");

  await expect.poll(() => calls.request).toEqual({
    target_barber_service_id: barberServiceId, target_interval_weeks: 2, target_replaces_request_id: null, target_replaces_series_id: "series-1", target_start_date: "2099-01-04", target_start_time: "09:00",
  });
  await expect(page.getByText("Change requested. Your current plan stays until it is confirmed.")).toBeVisible();
  await expect(page.getByTestId("my-request-status-rq1")).toHaveText("Active");
});

test("changing a plan that is still pending replaces the pending request", async ({ page }) => {
  const calls = await openPlans(page, [row({ id: "rq-pending", series_active: null, series_id: null, status: "pending" })]);

  await expect(page.getByTestId("my-request-status-rq-pending")).toHaveText("Waiting for plan confirmation");
  await expect(page.getByTestId("recurrence-request")).toHaveCount(0);
  await page.getByTestId("plan-change").click();
  await pickPlanBarberDayTime(page, "plan-w2");

  await expect.poll(() => calls.request).toMatchObject({ target_replaces_request_id: "rq-pending", target_replaces_series_id: null });
});

test("Request cancellation asks for confirmation and marks the plan as requested", async ({ page }) => {
  const calls = await openPlans(page, [row({})]);

  await page.getByTestId("plan-cancel-request").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-dialog-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  expect(calls.cancellation).toBeUndefined();

  await page.getByTestId("plan-cancel-request").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => calls.cancellation).toEqual({ target_series_id: "series-1" });
  await expect(page.getByTestId("my-request-status-rq1")).toHaveText("Cancellation requested");
  await expect(page.getByTestId("plan-cancel-request")).toHaveCount(0);
});

test("ended and rejected plans are history: the top button is back and there is no bottom bar", async ({ page }) => {
  await openPlans(page, [row({ id: "rq-ended", series_active: false, series_ended_at: "2026-10-21T12:12:00Z" }), row({ id: "rq-no", series_active: null, series_id: null, status: "rejected" })]);

  await expect(page.getByTestId("my-request-status-rq-ended")).toHaveText("Ended");
  await expect(page.getByTestId("my-request-status-rq-no")).toHaveText("Declined");
  await expect(page.getByTestId("recurrence-request")).toBeVisible();
  await expect(page.getByTestId("plans-bottom-bar")).toHaveCount(0);
  await expect(page.getByText("History")).toBeVisible();
});
