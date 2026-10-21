import { expect, test } from "@playwright/test";

import { barberId, barberServiceId, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const slot = { ends_at: "2099-01-04T12:30:00Z", local_date: "2099-01-04", local_time: "09:00:00", starts_at: "2099-01-04T12:00:00Z" };

test("a customer requests a plan: barber, plan, weekday, time, review, send; and can cancel the pending request", async ({ page }) => {
  const calls: Record<string, unknown> = {};
  let requests: unknown[] = [];

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_recurrence_plans_for_barber")) {
      await json(route, [
        { barber_service_id: barberServiceId, interval_weeks: 1, name: "Corte mensal", normal_cents: 3500, plan_id: "plan-w1", price_cents: 2500, service_name: "Browser Cut" },
        { barber_service_id: barberServiceId, interval_weeks: 3, name: "Trimestral", normal_cents: 3500, plan_id: "plan-w3", price_cents: 3000, service_name: "Browser Cut" },
      ]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/get_available_slots")) {
      await json(route, [slot]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/list_my_recurrence_requests")) {
      await json(route, requests);
      return true;
    }
    if (url.pathname.endsWith("/rpc/request_recurrence")) {
      calls.request = route.request().postDataJSON();
      requests = [{ barber_name: "Browser Barber", id: "rq1", interval_weeks: 1, local_start_date: "2099-01-04", local_start_time: "09:00:00", recurrence_cents: 2500, service_name: "Browser Cut", status: "pending" }];
      await json(route, [{}]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/cancel_my_recurrence_request")) {
      calls.cancel = route.request().postDataJSON();
      requests = [];
      await json(route, null);
      return true;
    }
  });

  await page.goto("/profile");
  await page.getByTestId("menu-recurrence").click();
  await expect(page).toHaveURL(/\/me\/recurrence/);
  await expect(page.getByText("You have no plans yet.")).toBeVisible();

  await page.getByTestId("recurrence-request").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 6 · Barber");
  await page.getByTestId(`barber-card-${barberId}`).click();

  // Plans of that barber: price per session, 4-week total when it exists, and the regular price.
  await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 6 · Plan");
  await expect(page.getByTestId("plan-card-plan-w1")).toContainText("Corte mensal");
  await expect(page.getByTestId("plan-card-plan-w1")).toContainText("R$ 25,00 per session");
  await expect(page.getByTestId("plan-card-plan-w1")).toContainText("R$ 100,00");
  await expect(page.getByTestId("plan-card-plan-w3")).toContainText("Trimestral");
  await expect(page.getByTestId("plan-card-plan-w3")).not.toContainText("sessions in 4 weeks");
  await page.getByTestId("plan-card-plan-w1").click();

  // The weekday, then the times of its next occurrence.
  await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 6 · Day");
  await expect(page.getByTestId("weekday-1")).toBeVisible();
  await expect(page.getByTestId("weekday-7")).toBeVisible();
  await page.getByTestId("weekday-1").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 4 of 6 · Time");
  await expect(page.getByTestId("recurrence-time-continue")).toBeDisabled();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByTestId("recurrence-time-continue").click();

  // Review, then send.
  await expect(page.getByTestId("step-label")).toHaveText("Step 5 of 6 · Review");
  await expect(page.getByTestId("recurrence-review")).toContainText("Every Monday");
  await expect(page.getByTestId("recurrence-review")).toContainText("09:00");
  await page.getByTestId("recurrence-send").click();
  await expect.poll(() => calls.request).toEqual({ target_barber_service_id: barberServiceId, target_interval_weeks: 1, target_start_date: "2099-01-04", target_start_time: "09:00" });

  await expect(page.getByTestId("my-request-status-rq1")).toHaveText("Waiting for plan confirmation");
  await page.getByTestId("my-request-cancel-rq1").click();
  await expect.poll(() => calls.cancel).toEqual({ target_request_id: "rq1" });
});

test("completed steps lead back and a barber without plans says so", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_recurrence_plans_for_barber")) {
      await json(route, []);
      return true;
    }
    if (url.pathname.endsWith("/rpc/list_my_recurrence_requests")) {
      await json(route, []);
      return true;
    }
  });

  await page.goto("/me/recurrence");
  await page.getByTestId("recurrence-request").click();
  await page.getByTestId(`barber-card-${barberId}`).click();
  await expect(page.getByText("This barber has no recurrence plans yet.")).toBeVisible();
  await page.getByTestId("step-barber").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 6 · Barber");
});

test("a plan whose series was ended shows its title and Ended, not Active", async ({ page }) => {
  const request = (overrides: Record<string, unknown>) => ({
    barber_name: "Browser Barber", id: "rq1", interval_weeks: 1, local_start_date: "2026-10-23", local_start_time: "16:30:00", plan_name: "Corte mensal",
    recurrence_cents: 2500, series_active: true, series_ended_at: null, series_id: "s1", service_name: "Browser Cut", status: "accepted", ...overrides,
  });
  let rows = [request({ id: "rq-ended", series_active: false, series_ended_at: "2026-10-21T12:12:00Z" }), request({ id: "rq-live" })];

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_recurrence_requests")) {
      await json(route, rows);
      return true;
    }
  });
  await page.goto("/me/recurrence");

  await expect(page.getByTestId("my-request-rq-ended")).toContainText("Corte mensal");
  await expect(page.getByTestId("my-request-status-rq-ended")).toHaveText("Ended");
  await expect(page.getByTestId("my-request-status-rq-live")).toHaveText("Active");
  rows = [];
});
