import { expect, test } from "@playwright/test";

import { barberId, barberServiceId, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const slot = { ends_at: "2099-01-04T12:30:00Z", local_date: "2099-01-04", local_time: "09:00:00", starts_at: "2099-01-04T12:00:00Z" };

test("a customer requests a weekly recurrence and can cancel the pending request", async ({ page }) => {
  const calls: Record<string, unknown> = {};
  let requests: unknown[] = [];

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/barber_services")) {
      await json(route, [{ duration_override_minutes: null, id: barberServiceId, price_override_cents: null, service_id: "service-1", services: { duration_minutes: 30, name: "Browser Cut", price_cents: 3500 } }]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/get_recurrence_quote")) {
      await json(route, [{ interval_weeks: 1, normal_cents: 3500, recurrence_cents: 2500 }, { interval_weeks: 2, normal_cents: 3500, recurrence_cents: null }]);
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
    if (url.pathname.endsWith("/rpc/cancel_recurrence_request") || url.pathname.endsWith("/rpc/cancel_my_recurrence_request")) {
      calls.cancel = route.request().postDataJSON();
      requests = [];
      await json(route, null);
      return true;
    }
  });

  await page.goto("/profile");
  await page.getByTestId("menu-recurrence").click();
  await expect(page).toHaveURL(/\/me\/recurrence/);
  await expect(page.getByText("You have no recurrence requests yet.")).toBeVisible();

  await page.getByTestId("recurrence-request").click();
  await page.getByTestId(`barber-card-${barberId}`).click();
  await page.getByTestId(`service-card-${barberServiceId}`).click();
  // Seed cut 35 → weekly 25: four sessions make R$ 100; every 2 weeks has no special price.
  await expect(page.getByTestId("option-weeks-1")).toContainText("R$ 25,00 per session");
  await expect(page.getByTestId("option-weeks-1")).toContainText("R$ 100,00");
  await expect(page.getByTestId("option-weeks-2")).toContainText("Regular price R$ 35,00");
  await page.getByTestId("recurrence-frequency-continue").click();

  await expect(page.getByTestId("recurrence-send")).toBeDisabled();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByTestId("recurrence-send").click();
  await expect.poll(() => calls.request).toEqual({ target_barber_service_id: barberServiceId, target_interval_weeks: 1, target_start_date: "2099-01-04", target_start_time: "09:00" });

  await expect(page.getByTestId("my-request-status-rq1")).toHaveText("Awaiting reply");
  await page.getByTestId("my-request-cancel-rq1").click();
  await expect.poll(() => calls.cancel).toEqual({ target_request_id: "rq1" });
});
