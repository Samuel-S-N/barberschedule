import { expect, test } from "@playwright/test";

import { barberId, barberServiceId, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const slot = { ends_at: "2099-01-04T12:30:00Z", local_date: "2099-01-04", local_time: "09:00:00", starts_at: "2099-01-04T12:00:00Z" };

test("a customer subscribes plan-first: plan, barber, day (vertical list), time, review, send; and can cancel the pending request", async ({ page }) => {
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
      requests = [{ barber_name: "Browser Barber", cancel_requested_at: null, id: "rq1", interval_weeks: 1, local_start_date: "2099-01-04", local_start_time: "09:00:00", plan_name: "Corte mensal", recurrence_cents: 2500, series_active: null, series_ended_at: null, series_id: null, service_name: "Browser Cut", status: "pending" }];
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
  await expect(page.getByTestId("plans-bottom-bar")).toHaveCount(0);

  await page.getByTestId("recurrence-request").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 6 · Plan");
  // The plan's value for the month (4 weeks) is highlighted on the right; no price per session. The regular price stays.
  const weekly = page.getByTestId("offer-plan-w1");

  await expect(weekly).toContainText("Corte mensal");
  await expect(weekly).toContainText("Weekly");
  await expect(weekly.getByTestId("plan-amount")).toHaveText("R$ 100,00");
  await expect(weekly).toContainText("4 sessions per month");
  await expect(weekly).toContainText("Regular price R$ 35,00");
  await expect(weekly).not.toContainText("R$ 25,00");
  await expect(weekly).not.toContainText("per session");
  // Every 3 weeks has no whole month of sessions: the price per session stands in for the value.
  const quarterly = page.getByTestId("offer-plan-w3");

  await expect(quarterly).toContainText("Trimestral");
  await expect(quarterly).toContainText("Every 3 weeks");
  await expect(quarterly.getByTestId("plan-amount")).toHaveText("R$ 30,00");
  await expect(quarterly).toContainText("per session");
  await page.getByTestId("offer-plan-w1").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 6 · Barber");
  await page.getByTestId(`offer-barber-${barberId}`).click();

  // The weekdays are a vertical list: one row under the other, all the same width.
  await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 6 · Day");
  const boxes = [];

  for (const day of [1, 2, 3, 7]) boxes.push((await page.getByTestId(`weekday-${day}`).boundingBox())!);
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].y).toBeGreaterThan(boxes[index - 1].y + boxes[index - 1].height - 1);
    expect(Math.abs(boxes[index].x - boxes[0].x)).toBeLessThan(1);
    expect(Math.abs(boxes[index].width - boxes[0].width)).toBeLessThan(1);
  }
  await page.getByTestId("weekday-1").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 4 of 6 · Time");
  await expect(page.getByTestId("recurrence-time-continue")).toBeDisabled();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByTestId("recurrence-time-continue").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 5 of 6 · Review");
  await expect(page.getByTestId("recurrence-review")).toContainText("Corte mensal");
  await expect(page.getByTestId("recurrence-review")).toContainText("Browser Barber");
  await expect(page.getByTestId("recurrence-review")).toContainText("Every Monday");
  await expect(page.getByTestId("recurrence-review").getByTestId("plan-amount")).toHaveText("R$ 100,00");
  await expect(page.getByTestId("recurrence-review")).toContainText("4 sessions per month");
  await expect(page.getByTestId("recurrence-review")).toContainText("Regular price R$ 35,00");
  await expect(page.getByTestId("recurrence-review")).not.toContainText("per session");
  await page.getByTestId("recurrence-send").click();
  await expect.poll(() => calls.request).toEqual({
    target_barber_service_id: barberServiceId, target_interval_weeks: 1, target_replaces_request_id: null, target_replaces_series_id: null, target_start_date: "2099-01-04", target_start_time: "09:00",
  });

  await expect(page.getByTestId("my-request-status-rq1")).toHaveText("Waiting for plan confirmation");
  await page.getByTestId("my-request-cancel-rq1").click();
  await expect.poll(() => calls.cancel).toEqual({ target_request_id: "rq1" });
});

test("with no plans at all the plan step says so, and completed steps lead back", async ({ page }) => {
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
  await expect(page.getByText("The shop has no recurrence plans yet.")).toBeVisible();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 6 · Plan");
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
