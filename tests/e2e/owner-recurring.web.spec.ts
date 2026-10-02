import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";
const C1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const BS1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const R1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const R2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";

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

const series = [
  { active: true, barber_service_id: BS1, customer_id: C1, customer_name: "Ana Souza", ends_on: null, ended_at: null, id: R1, interval_weeks: 4, local_start_date: "2026-10-05", local_start_time: "09:00:00", special_price_cents: 3000 },
  { active: true, barber_service_id: BS1, customer_id: C1, customer_name: "Ana Souza", ends_on: null, ended_at: null, id: R2, interval_weeks: 2, local_start_date: "2026-10-06", local_start_time: "10:30:00", special_price_cents: null },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, [{ active: true, archived_at: null, id: B1, name: "Bruno Barber", shop_id: shop, user_id: null }]);
    if (path.endsWith("/customers") && method === "GET") return json(route, [{ active: true, archived_at: null, email: "ana@x.com", full_name: "Ana Souza", id: C1, phone: null, shop_id: shop, user_id: null }]);
    if (path.endsWith("/services") && method === "GET") return json(route, [{ active: true, archived_at: null, description: null, duration_minutes: 30, id: S1, is_standard: true, name: "Cut", price_cents: 4000, shop_id: shop }]);
    if (path.endsWith("/barber_services") && method === "GET") return json(route, [{ active: true, archived_at: null, barber_id: B1, duration_override_minutes: null, id: BS1, price_override_cents: null, service_id: S1, shop_id: shop }]);
    if (path.endsWith("/rpc/list_owner_recurrence_series")) return json(route, series);
    if (path.endsWith("/rpc/create_recurrence_series")) {
      calls.create = route.request().postDataJSON();

      return json(route, [series[0]]);
    }
    if (path.endsWith("/rpc/ensure_recurrence_window")) {
      calls.ensure = route.request().postDataJSON();

      return json(route, [{ appointments_created: 2, conflicts_created: 0 }]);
    }
    if (path.endsWith("/rpc/cancel_recurrence_occurrence")) {
      calls.cancelOccurrence = route.request().postDataJSON();

      return json(route, null);
    }
    if (path.endsWith("/rpc/end_recurrence_series")) {
      calls.end = route.request().postDataJSON();

      return json(route, [series[0]]);
    }
    if (path.endsWith("/rpc/list_owner_recurrence_conflicts")) {
      return json(route, [
        { customer_name: "Ana Souza", customer_phone: "(11) 99999-9999", id: "f1", local_start_time: "09:00:00", occurrence_date: "2026-10-05", reason: "slot_unavailable", series_id: R1, service_name: "Cut", status: "open" },
        { customer_name: "Caio", customer_phone: null, id: "f2", local_start_time: "10:00:00", occurrence_date: "2026-10-12", reason: "slot_unavailable", series_id: R2, service_name: "Cut", status: "open" },
      ]);
    }
    await route.abort();
  });
}

test("recurring customers show the series with service, interval and price", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/monthly-customers");
  await expect(page.getByTestId(`series-${R1}`)).toContainText("Ana Souza");
  await expect(page.getByTestId(`series-${R1}`)).toContainText("Bruno Barber · Cut");
  await expect(page.getByTestId(`series-${R1}`)).toContainText("R$ 30,00");
  await expect(page.getByTestId(`series-${R2}`)).toContainText("catalog price");
});

test("the owner creates a recurring booking choosing customer and service by name", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/monthly-customers");
  // The service is chosen by barber and service name, never by an id.
  await page.getByTestId(`option-${C1}`).click();
  await page.getByTestId(`option-${BS1}`).click();
  await page.getByTestId("recurrence-interval").fill("2");
  await page.getByTestId("recurrence-time").fill("11:00");
  await page.getByTestId("recurrence-price").fill("30,00");
  await page.getByTestId("recurrence-save").click();

  await expect.poll(() => calls.create).toMatchObject({
    interval_weeks: 2, local_start_time: "11:00", special_price_cents: 3000, target_barber_service_id: BS1, target_customer_id: C1,
  });
  await expect.poll(() => calls.ensure).toBeTruthy();
});

test("the owner cancels one occurrence and ends a series", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/monthly-customers");
  await page.getByTestId("recurrence-occurrence-date").fill("2026-10-12");
  await page.getByTestId(`series-cancel-${R1}`).click();
  await expect.poll(() => calls.cancelOccurrence).toEqual({ target_occurrence_date: "2026-10-12", target_series_id: R1 });

  await page.getByTestId(`series-end-${R1}`).click();
  await expect.poll(() => calls.end).toEqual({ target_series_id: R1 });
});

test("conflicts list the affected customers and open WhatsApp only when there is a phone", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await page.context().route("https://wa.me/**", (route) => route.fulfill({ body: "ok", contentType: "text/html" }));

  await page.goto("/recurrence-conflicts");
  await expect(page.getByTestId("conflict-f1")).toContainText("Ana Souza");
  const popup = page.waitForEvent("popup");
  await page.getByTestId("conflict-whatsapp-f1").click();
  expect(new URL((await popup).url()).pathname).toBe("/5511999999999");

  await page.getByTestId("conflict-whatsapp-f2").click();
  await expect(page.getByText("This customer has no phone number for WhatsApp.")).toBeVisible();
});
