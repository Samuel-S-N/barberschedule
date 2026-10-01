import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { appointmentRow, barberId, json, shopId } from "./customer-helpers";
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

function bookedRow(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    ...appointmentRow({ ends_at: end.toISOString(), id: "appt-new", occupied_until: end.toISOString(), starts_at: start.toISOString() }),
    barber_name: "Browser Barber", customer_name: "Walk In", source: "barber", ...overrides,
  };
}

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

test("a barber books a name-only customer from a free slot on the agenda", async ({ page }) => {
  const bodies: Record<string, unknown> = {};
  const slotStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const slotRow = {
    ends_at: new Date(slotStart.getTime() + 30 * 60 * 1000).toISOString(),
    local_date: "2026-10-01",
    local_time: "09:30:00",
    starts_at: slotStart.toISOString(),
  };

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name === "get_available_slots") return json(route, [slotRow]).then(() => true);
    if (name === "barber_search_customers") return json(route, []).then(() => true);
    if (name === "barber_find_or_create_customer") {
      bodies[name] = route.request().postDataJSON();
      return json(route, { active: true, email: null, full_name: "Walk In", id: "cust-new", phone: null, user_id: null }).then(() => true);
    }
    if (name === "book_appointment") {
      bodies[name] = route.request().postDataJSON();
      return json(route, [bookedRow()]).then(() => true);
    }
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-free-slot").first().click();
  await expect(page.getByTestId("barber-book-name")).toBeVisible();
  await expect(page.getByTestId("barber-book-confirm")).toBeDisabled();

  await page.getByTestId("barber-book-name").fill("Walk In");
  await expect(page.getByTestId("barber-book-no-email")).toBeVisible();
  await page.getByTestId("barber-book-confirm").click();

  await expect(page.getByText("Appointment booked.")).toBeVisible();
  await expect(page.getByTestId("barber-book-name")).toBeHidden();
  expect(bodies.barber_find_or_create_customer).toEqual({ target_email: null, target_name: "Walk In", target_phone: null });
  expect(bodies.book_appointment).toMatchObject({
    barber_service_id: "bs1", customer_id: "cust-new", notes: null, source: "barber", starts_at: slotStart.toISOString(),
  });
});

test("a slot conflict shows the error and keeps the agenda usable", async ({ page }) => {
  const slotStart = new Date(Date.now() + 3 * 60 * 60 * 1000);

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name === "get_available_slots") {
      return json(route, [{ ends_at: slotStart.toISOString(), local_date: "2026-10-01", local_time: "09:30:00", starts_at: slotStart.toISOString() }]).then(() => true);
    }
    if (name === "barber_search_customers") return json(route, []).then(() => true);
    if (name === "barber_find_or_create_customer") {
      return json(route, { active: true, email: null, full_name: "Walk In", id: "cust-new", phone: null, user_id: null }).then(() => true);
    }
    if (name === "book_appointment") return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400).then(() => true);
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-free-slot").first().click();
  await page.getByTestId("barber-book-name").fill("Walk In");
  await page.getByTestId("barber-book-confirm").click();

  await expect(page.getByText("That time is no longer available.")).toBeVisible();
});
