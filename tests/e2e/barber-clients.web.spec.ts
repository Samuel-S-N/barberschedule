import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";
import type { RestHandler } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";

async function signIn(page: Page, userId: string) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
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
    if (path.endsWith("/rpc/list_my_barber_services")) {
      return json(route, [{ active: true, barber_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
    }
    if (path.endsWith("/rpc/list_my_barber_agenda")) return json(route, []);
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    await route.abort();
  });
}

const clientRows = [
  { customer_id: "c1", email: null, full_name: "Ana Souza", has_account: false, is_lapsed: false, last_visit_at: "2026-09-28T15:00:00Z", next_visit_at: null, phone: "11988887777", visits: 5 },
  { customer_id: "c2", email: "bia@x.com", full_name: "Bia Lima", has_account: true, is_lapsed: true, last_visit_at: "2026-07-01T15:00:00Z", next_visit_at: null, phone: null, visits: 2 },
];

test("the clients tab lists clients, filters lapsed ones and searches", async ({ page }) => {
  const calls: Array<Record<string, unknown>> = [];

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push(body);
      return json(route, body.only_lapsed ? clientRows.filter((r) => r.is_lapsed) : clientRows).then(() => true);
    }
  });

  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByTestId("client-row-c1")).toContainText("Ana Souza");
  await expect(page.getByTestId("client-lapsed-c1")).toHaveCount(0);
  await expect(page.getByTestId("client-lapsed-c2")).toBeVisible();

  await page.getByTestId("clients-filter-lapsed").click();
  await expect(page.getByTestId("client-row-c1")).toHaveCount(0);
  await expect(page.getByTestId("client-row-c2")).toBeVisible();

  await page.getByTestId("clients-filter-all").click();
  await page.getByTestId("client-search").fill("ana");
  await expect.poll(() => calls.some((c) => c.search === "ana")).toBe(true);
});

test("a client detail shows stats, history, contact links and saves a private note", async ({ page }) => {
  let notePayload: Record<string, unknown> | null = null;

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) return json(route, clientRows).then(() => true);
    if (url.pathname.endsWith("/rpc/get_my_customer")) {
      return json(route, {
        customer: { email: null, full_name: "Ana Souza", has_account: false, id: "c1", phone: "11988887777" },
        history: [{ id: "a1", service_name: "Browser Cut", starts_at: "2026-09-28T15:00:00Z", status: "completed" }],
        note: null,
        stats: { cancelled: 1, favorite_service: "Browser Cut", last_visit_at: "2026-09-28T15:00:00Z", next_visit_at: null, no_show: 0, visits: 5 },
      }).then(() => true);
    }
    if (url.pathname.endsWith("/rpc/set_my_customer_note")) {
      notePayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, null).then(() => true);
    }
  });

  await page.goto("/clients/c1");
  await expect(page.getByRole("heading", { name: "Ana Souza" })).toBeVisible();
  await expect(page.getByTestId("client-stat-visits")).toContainText("5");
  await expect(page.getByTestId("client-history")).toContainText("Browser Cut");
  await expect(page.getByTestId("client-whatsapp")).toHaveAttribute("href", "https://wa.me/5511988887777");

  await page.getByTestId("client-note").fill("Low fade, no clippers on the neck");
  await page.getByTestId("client-note-save").click();
  await expect(page.getByText("Note saved.")).toBeVisible();
  expect(notePayload).toEqual({ new_note: "Low fade, no clippers on the neck", target_customer_id: "c1" });
});

test("a barber books a known client again from the client screen", async ({ page }) => {
  const calls: string[] = [];
  let bookPayload: Record<string, unknown> | null = null;
  const slotStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const appointment = {
    barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_name: "Browser Barber", barber_service_id: "bs1", created_at: "2026-10-01T10:00:00Z",
    customer_id: "c1", customer_name: "Ana Souza", ends_at: new Date(slotStart.getTime() + 1_800_000).toISOString(), id: "appt-new", notes: null,
    occupied_until: new Date(slotStart.getTime() + 1_800_000).toISOString(), service_duration_minutes_snapshot: 30, service_id: "s1",
    service_name_snapshot: "Browser Cut", service_price_cents_snapshot: 4000, shop_id: shopId, source: "barber", starts_at: slotStart.toISOString(),
    status: "scheduled", updated_at: "2026-10-01T10:00:00Z",
  };

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name) calls.push(name);
    if (name === "get_my_customer") {
      return json(route, {
        customer: { email: "ana@x.com", full_name: "Ana Souza", has_account: true, id: "c1", phone: "11988887777" },
        history: [], note: null,
        stats: { cancelled: 0, favorite_service: "Browser Cut", last_visit_at: null, next_visit_at: null, no_show: 0, visits: 3 },
      }).then(() => true);
    }
    if (name === "get_available_slots") {
      return json(route, [{ ends_at: appointment.ends_at, local_date: "2026-10-01", local_time: "09:30:00", starts_at: slotStart.toISOString() }]).then(() => true);
    }
    if (name === "barber_search_customers") return json(route, []).then(() => true);
    if (name === "book_appointment") {
      bookPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [appointment]).then(() => true);
    }
  });

  await page.goto("/clients/c1");
  await page.getByTestId("client-book").click();
  await expect(page).toHaveURL(/\/my-agenda/);
  await expect(page.getByTestId("barber-booking-for")).toContainText("Ana Souza");

  await page.getByTestId("barber-free-slot").first().click();
  await expect(page.getByTestId("barber-book-name")).toHaveValue("Ana Souza");
  await expect(page.getByTestId("barber-book-service-bs1")).toBeVisible();
  await page.getByTestId("barber-book-confirm").click();

  await expect(page.getByText("Appointment booked.")).toBeVisible();
  await expect(page.getByTestId("barber-booking-for")).toHaveCount(0);
  expect(bookPayload).toMatchObject({ barber_service_id: "bs1", customer_id: "c1", source: "barber" });
  expect(calls).not.toContain("barber_find_or_create_customer");
});

test("the clients list loads more pages while a full page comes back", async ({ page }) => {
  const offsets: number[] = [];
  const row = (n: number) => ({
    customer_id: `p${n}`, email: null, full_name: `Client ${String(n).padStart(3, "0")}`, has_account: false, is_lapsed: false,
    last_visit_at: null, next_visit_at: null, phone: null, visits: 0,
  });

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (!url.pathname.endsWith("/rpc/list_my_customers")) return;
    const body = route.request().postDataJSON() as { page_limit: number; page_offset: number };
    offsets.push(body.page_offset);
    // 50 on the first page (full), 1 on the second (short, so the button goes away).
    const count = body.page_offset === 0 ? 50 : 1;
    await json(route, Array.from({ length: count }, (_, i) => row(body.page_offset + i + 1)));

    return true;
  });

  await page.goto("/clients");
  await expect(page.getByTestId("client-row-p50")).toBeVisible();
  await expect(page.getByTestId("client-row-p51")).toHaveCount(0);

  await page.getByTestId("clients-load-more").click();
  await expect(page.getByTestId("client-row-p51")).toBeVisible();
  await expect(page.getByTestId("clients-load-more")).toHaveCount(0);
  expect(offsets).toEqual([0, 50]);
});
