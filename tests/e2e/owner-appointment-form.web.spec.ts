import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

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
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, [{ active: true, archived_at: null, id: "b1", name: "Bruno Barber", shop_id: shop, user_id: null }]);
    if (path.endsWith("/customers")) {
      return json(route, [
        { active: true, archived_at: null, email: "ana@x.com", full_name: "Ana Customer", id: "c1", phone: null, shop_id: shop, user_id: null },
        { active: true, archived_at: null, email: null, full_name: "Caio Customer", id: "c2", phone: "11999990000", shop_id: shop, user_id: null },
      ]);
    }
    if (path.endsWith("/services")) return json(route, [{ active: true, archived_at: null, description: null, duration_minutes: 30, id: "s1", is_standard: true, name: "Cut", price_cents: 4000, shop_id: shop }]);
    if (path.endsWith("/barber_services")) {
      return json(route, [{ active: true, archived_at: null, barber_id: "b1", duration_override_minutes: null, id: "bs1", price_override_cents: null, service_id: "s1", shop_id: shop }]);
    }
    if (path.endsWith("/rpc/get_available_slots")) {
      calls.slots = route.request().postDataJSON();

      return json(route, [{ ends_at: new Date(slotStart.getTime() + 30 * 60 * 1000).toISOString(), local_date: "2026-10-01", local_time: "10:30:00", starts_at: slotStart.toISOString() }]);
    }
    if (path.endsWith("/rpc/book_appointment")) {
      calls.book = route.request().postDataJSON();
      if (bookFails) return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400);

      return json(route, [{
        barber_buffer_minutes_snapshot: 0, barber_id: "b1", barber_service_id: "bs1", created_at: "2026-10-01T10:00:00Z", customer_id: "c1",
        ends_at: slotStart.toISOString(), id: "appt-new", notes: null, occupied_until: slotStart.toISOString(), service_duration_minutes_snapshot: 30,
        service_id: "s1", service_name_snapshot: "Cut", service_price_cents_snapshot: 4000, shop_id: shop, source: "owner",
        starts_at: slotStart.toISOString(), status: "scheduled", updated_at: "2026-10-01T10:00:00Z",
      }]);
    }
    await route.abort();
  });
}

test("the owner books an appointment: customer, service, time, then create", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/appointment-form");
  await expect(page.getByRole("heading", { name: "New owner appointment" })).toBeVisible();
  await expect(page.getByTestId("owner-form-create")).toBeDisabled();

  // The customer list filters as the owner types.
  await page.getByTestId("owner-customer-search").fill("caio");
  await expect(page.getByTestId("option-c1")).toHaveCount(0);
  await page.getByTestId("owner-customer-search").fill("");
  await page.getByTestId("option-c1").click();
  await page.getByTestId("option-bs1").click();
  await page.getByTestId("owner-form-load-times").click();
  await page.getByRole("button", { name: "10:30" }).click();
  await page.getByTestId("owner-form-notes").fill("window seat");
  await page.getByTestId("owner-form-create").click();

  await expect(page.getByText("Appointment created.")).toBeVisible();
  expect(calls.book).toEqual({ barber_service_id: "bs1", customer_id: "c1", notes: "window seat", source: "owner", starts_at: slotStart.toISOString() });
});

test("a slot taken meanwhile shows the error", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {}, true);

  await page.goto("/appointment-form");
  await page.getByTestId("option-c1").click();
  await page.getByTestId("option-bs1").click();
  await page.getByTestId("owner-form-load-times").click();
  await page.getByRole("button", { name: "10:30" }).click();
  await page.getByTestId("owner-form-create").click();

  await expect(page.getByText("That time is no longer available.")).toBeVisible();
});
