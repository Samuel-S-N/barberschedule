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
    if (path.endsWith("/rpc/list_my_working_periods")) return json(route, [{ end_time: "18:00:00", start_time: "09:00:00", weekday: 1 }]);
    if (path.endsWith("/rpc/get_my_lunch_break")) return json(route, [{ lunch_end: null, lunch_start: null }]);
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    if (path.endsWith("/rpc/list_my_barber_agenda")) return json(route, []);
    await route.abort();
  });
}

// Shop-local date (America/Sao_Paulo), `days` from now.
const shopDate = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + days * 86_400_000));

test("a barber sets and removes the lunch break", async ({ page }) => {
  const calls: unknown[] = [];

  await signIn(page);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/set_my_lunch_break")) {
      calls.push(route.request().postDataJSON());
      return json(route, null, 204).then(() => true);
    }
  });

  await page.goto("/my-profile/availability");
  await expect(page.getByTestId("lunch-save")).toBeDisabled();
  await page.getByTestId("lunch-start").pressSequentially("1200");
  await page.getByTestId("lunch-end").pressSequentially("1300");
  await expect(page.getByTestId("lunch-start")).toHaveValue("12:00");
  await page.getByTestId("lunch-save").click();
  await expect.poll(() => calls).toEqual([{ new_end: "13:00", new_start: "12:00" }]);
});

test("a barber adds a two-day absence, one block per day", async ({ page }) => {
  const inserts: Record<string, unknown>[] = [];

  await signIn(page);
  await mockBarberRest(page, async (route, url) => {
    if (route.request().method() === "POST" && url.pathname.endsWith("/schedule_overrides")) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      inserts.push(body);
      return json(route, { ...body, id: `o${inserts.length}` }, 201).then(() => true);
    }
  });

  await page.goto("/my-profile/availability");
  const from = shopDate(1);
  const until = shopDate(2);
  await page.getByTestId("absence-from").fill("");
  await page.getByTestId("absence-from").pressSequentially(from.replaceAll("-", ""));
  await page.getByTestId("absence-until").pressSequentially(until.replaceAll("-", ""));
  await page.getByTestId("absence-add").click();

  await expect(page.getByText("Absence added.")).toBeVisible();
  expect(inserts).toHaveLength(2);
  expect(inserts[0]).toMatchObject({ barber_id: barberId, kind: "block", local_date: from, shop_id: shopId, start_time: null });
  expect(inserts[1]).toMatchObject({ local_date: until });
});

test("an absence over existing appointments warns first and needs a second press", async ({ page }) => {
  const inserts: unknown[] = [];
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 30 * 60_000);

  await signIn(page);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_barber_agenda")) {
      return json(route, [{
        barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_name: "Browser Barber", barber_service_id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-08-13T10:00:00Z", customer_id: "44444444-4444-4444-8444-444444444444", customer_name: "Ana", customer_phone: null,
        ends_at: end.toISOString(), id: "appt-1", notes: null, occupied_until: end.toISOString(), service_duration_minutes_snapshot: 30,
        service_id: "55555555-5555-4555-8555-555555555555", service_name_snapshot: "Corte", service_price_cents_snapshot: 4000, shop_id: shopId,
        source: "customer", starts_at: start.toISOString(), status: "scheduled", updated_at: "2026-08-13T10:00:00Z",
      }]).then(() => true);
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/schedule_overrides")) {
      const body = route.request().postDataJSON();
      inserts.push(body);
      return json(route, { ...(body as object), id: "o1" }, 201).then(() => true);
    }
  });

  await page.goto("/my-profile/availability");
  await page.getByTestId("absence-from").fill("");
  await page.getByTestId("absence-from").pressSequentially(shopDate(1).replaceAll("-", ""));
  await page.getByTestId("absence-add").click();

  await expect(page.getByTestId("absence-conflict")).toContainText("1 appointment(s)");
  expect(inserts).toHaveLength(0);
  await page.getByTestId("absence-confirm").click();
  await expect(page.getByText("Absence added.")).toBeVisible();
  expect(inserts).toHaveLength(1);
});
