import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

import { json, mockCustomerRest, professionalId, professionalServiceId, signInAsCustomer } from "./customer-helpers";

// The calendar dims the days the chosen professional cannot work (list_unavailable_dates) and explains a tap on one.

const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function answerUnavailable(page: Page, dates: string[], requests: Array<Record<string, unknown>>) {
  // Registered last, so it answers before the spec's catch-all mock (which aborts unknown calls).
  await page.route("**/rest/v1/rpc/list_unavailable_dates", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await json(route, dates);
  });
}

// Shows the month of `date` (the window is today + 30 days, so it can be next month).
async function showDay(page: Page, date: string) {
  if (!(await page.getByTestId(`month-calendar-day-${date}`).isVisible())) await page.getByTestId("month-calendar-next").click();
  await expect(page.getByTestId(`month-calendar-day-${date}`)).toBeVisible();
}

test("customer: a day the professional cannot work is dimmed and a tap explains it", async ({ page }) => {
  const blocked = addDays(2);
  const normal = addDays(1);
  const requests: Array<Record<string, unknown>> = [];

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/professional_services")) {
      await json(route, [{ duration_override_minutes: null, id: professionalServiceId, price_override_cents: null, service_id: "service-1", services: { duration_minutes: 30, name: "Browser Cut", price_cents: 4000 } }]);

      return true;
    }
  });
  await answerUnavailable(page, [blocked], requests);

  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Professional" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await showDay(page, blocked);

  // Asked for THIS professional, one month at a time.
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0]).toMatchObject({ professional_id: professionalId });
  expect(requests.every((request) => typeof request.from_date === "string" && typeof request.to_date === "string")).toBe(true);

  const day = page.getByTestId(`month-calendar-day-${blocked}`);

  await expect(day).toHaveAttribute("aria-label", /Unavailable on this date/);
  expect(await day.evaluate((node) => getComputedStyle(node).opacity)).toBe("0.4");
  expect(await page.getByTestId(`month-calendar-day-${normal}`).evaluate((node) => getComputedStyle(node).opacity)).toBe("1");

  await day.click();
  await expect(page.getByTestId("month-calendar-unavailable-message")).toHaveText("Unavailable on this date");
  // The tap did not select it.
  await expect(day).not.toHaveClass(/bg-ink/);

  await page.getByTestId(`month-calendar-day-${normal}`).click();
  await expect(page.getByTestId(`month-calendar-day-${normal}`)).toHaveClass(/bg-ink/);
});

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

const slotStart = new Date(Date.now() + 3 * 60 * 60 * 1000);

async function mockOwnerRest(page: Page, calls: Record<string, unknown>, bookFails = false) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_owner_professionals")) return json(route, [{ active: true, archived_at: null, id: "b1", name: "Bruno Professional", shop_id: shop, user_id: null }]);
    if (path.endsWith("/customers")) {
      return json(route, [
        { active: true, archived_at: null, email: "ana@x.com", full_name: "Ana Customer", id: "c1", phone: null, shop_id: shop, user_id: null },
        { active: true, archived_at: null, email: null, full_name: "Caio Customer", id: "c2", phone: "11999990000", shop_id: shop, user_id: null },
      ]);
    }
    if (path.endsWith("/services")) return json(route, [{ active: true, archived_at: null, description: null, duration_minutes: 30, id: "s1", is_standard: true, name: "Cut", price_cents: 4000, shop_id: shop }]);
    if (path.endsWith("/professional_services")) {
      return json(route, [{ active: true, archived_at: null, professional_id: "b1", duration_override_minutes: null, id: "bs1", price_override_cents: null, service_id: "s1", shop_id: shop }]);
    }
    if (path.endsWith("/rpc/get_available_slots")) {
      calls.slots = route.request().postDataJSON();

      return json(route, [{ ends_at: new Date(slotStart.getTime() + 30 * 60 * 1000).toISOString(), local_date: "2026-10-01", local_time: "10:30:00", starts_at: slotStart.toISOString() }]);
    }
    if (path.endsWith("/rpc/list_owner_agenda") || path.endsWith("/rpc/list_owner_agenda_overrides")) return json(route, []);
    if (path.endsWith("/rpc/book_appointment")) {
      calls.book = route.request().postDataJSON();
      if (bookFails) return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400);

      return json(route, [{
        professional_buffer_minutes_snapshot: 0, professional_id: "b1", professional_service_id: "bs1", created_at: "2026-10-01T10:00:00Z", customer_id: "c1",
        ends_at: slotStart.toISOString(), id: "appt-new", notes: null, occupied_until: slotStart.toISOString(), service_duration_minutes_snapshot: 30,
        service_id: "s1", service_name_snapshot: "Cut", service_price_cents_snapshot: 4000, shop_id: shop, source: "owner",
        starts_at: slotStart.toISOString(), status: "scheduled", updated_at: "2026-10-01T10:00:00Z",
      }]);
    }
    await route.abort();
  });
}

test("owner: the booking form dims the chosen professional's days off", async ({ page }) => {
  const blocked = addDays(2);
  const requests: Array<Record<string, unknown>> = [];

  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await answerUnavailable(page, [blocked], requests);

  await page.goto("/appointment-form");
  await page.getByTestId("option-c1").click();
  await page.getByTestId("option-s1").click();
  await page.getByTestId("option-bs1").click();
  await showDay(page, blocked);

  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0]).toMatchObject({ professional_id: "b1" });
  await expect(page.getByTestId(`month-calendar-day-${blocked}`)).toHaveAttribute("aria-label", /Unavailable on this date/);

  await page.getByTestId(`month-calendar-day-${blocked}`).click();
  await expect(page.getByTestId("month-calendar-unavailable-message")).toBeVisible();
});
