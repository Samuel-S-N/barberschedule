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
    if (name === "barber_book_new_customer") {
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
  expect(bodies.barber_book_new_customer).toEqual({
    target_barber_service_id: "bs1", target_email: null, target_name: "Walk In", target_notes: null, target_phone: null, target_starts_at: slotStart.toISOString(),
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
    if (name === "barber_book_new_customer") return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400).then(() => true);
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-free-slot").first().click();
  await page.getByTestId("barber-book-name").fill("Walk In");
  await page.getByTestId("barber-book-confirm").click();

  await expect(page.getByText("That time is no longer available.")).toBeVisible();
});

test("the agenda shows the day summary with free times and today's earnings", async ({ page }) => {
  const slotStart = new Date(Date.now() + 3 * 60 * 60 * 1000);

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name === "get_available_slots") {
      return json(route, [{ ends_at: slotStart.toISOString(), local_date: "2026-10-01", local_time: "09:30:00", starts_at: slotStart.toISOString() }]).then(() => true);
    }
    if (name === "get_my_barber_report") {
      return json(route, { days: [{ cancelled: 0, completed: 2, date: new Date().toISOString().slice(0, 10), earnings_cents: 4800, no_show: 0, upcoming: 0 }], services: [] }).then(() => true);
    }
  });

  await page.goto("/my-agenda");
  const summary = page.getByTestId("barber-day-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Day summary");
  await expect(summary).toContainText("Free times");
  await expect(summary).toContainText("Nothing left");
  await expect(summary).toContainText("R$ 48,00");
});

function openAppointmentRow() {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    ...appointmentRow({ ends_at: end.toISOString(), id: "appt-1", occupied_until: end.toISOString(), starts_at: start.toISOString() }),
    barber_name: "Browser Barber", customer_name: "Ana Customer",
  };
}

test("a barber cancels an appointment after a second tap", async ({ page }) => {
  let cancelPayload: unknown = null;

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name === "list_my_barber_agenda") return json(route, [openAppointmentRow()]).then(() => true);
    if (name === "cancel_appointment") {
      cancelPayload = route.request().postDataJSON();
      return json(route, [openAppointmentRow()]).then(() => true);
    }
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-cancel-appt-1").click();
  expect(cancelPayload).toBeNull();
  await page.getByTestId("barber-cancel-appt-1").click();
  await expect(page.getByText("Appointment cancelled.")).toBeVisible();
  expect(cancelPayload).toEqual({ appointment_id: "appt-1" });
});

test("a barber moves an appointment by picking a free time", async ({ page }) => {
  const moved: { payload?: Record<string, string> } = {};
  const slotStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const slotRow = {
    ends_at: new Date(slotStart.getTime() + 30 * 60 * 1000).toISOString(), local_date: "2026-10-01", local_time: "09:30:00", starts_at: slotStart.toISOString(),
  };

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name === "list_my_barber_agenda") return json(route, [openAppointmentRow()]).then(() => true);
    if (name === "get_available_slots") return json(route, [slotRow]).then(() => true);
    if (name === "barber_search_customers") return json(route, []).then(() => true);
    if (name === "reschedule_appointment") {
      moved.payload = route.request().postDataJSON() as Record<string, string>;
      return json(route, [openAppointmentRow()]).then(() => true);
    }
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-move-appt-1").click();
  await expect(page.getByTestId("barber-moving")).toContainText("Ana Customer");
  await page.getByTestId("barber-free-slot").first().click();

  await expect(page.getByText("Appointment moved.")).toBeVisible();
  await expect(page.getByTestId("barber-book-name")).toHaveCount(0);
  expect(moved.payload?.appointment_id).toBe("appt-1");
  expect(new Date(moved.payload?.new_starts_at ?? "").getTime()).toBe(slotStart.getTime());
});

test("a failed move shows the error and keeps moving", async ({ page }) => {
  const slotStart = new Date(Date.now() + 3 * 60 * 60 * 1000);

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name === "list_my_barber_agenda") return json(route, [openAppointmentRow()]).then(() => true);
    if (name === "get_available_slots") {
      return json(route, [{ ends_at: slotStart.toISOString(), local_date: "2026-10-01", local_time: "09:30:00", starts_at: slotStart.toISOString() }]).then(() => true);
    }
    if (name === "reschedule_appointment") return json(route, { code: "P0001", message: "SLOT_UNAVAILABLE" }, 400).then(() => true);
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-move-appt-1").click();
  await page.getByTestId("barber-free-slot").first().click();

  await expect(page.getByText("That time is no longer available.")).toBeVisible();
  await expect(page.getByTestId("barber-moving")).toBeVisible();
});

function upcomingRow(phone: string | null) {
  const start = new Date(Date.now() + 15 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    ...appointmentRow({ ends_at: end.toISOString(), id: "appt-1", occupied_until: end.toISOString(), starts_at: start.toISOString() }),
    barber_name: "Browser Barber", customer_name: "Ana Customer", customer_phone: phone,
  };
}

test("an upcoming appointment of an account-less customer offers a WhatsApp reminder", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_barber_agenda")) return json(route, [upcomingRow("11999990001")]).then(() => true);
  });

  // Keep the external WhatsApp host out of the test: the popup URL is what we assert on.
  await page.context().route("https://wa.me/**", (route) => route.fulfill({ body: "ok", contentType: "text/html" }));
  await page.goto("/my-agenda");
  const popup = page.waitForEvent("popup");
  await page.getByTestId("barber-remind-appt-1").click();
  const url = new URL((await popup).url());

  expect(url.origin + url.pathname).toBe("https://wa.me/5511999990001");
  expect(url.searchParams.get("text")).toContain("Ana Customer");
});

test("no reminder button without a phone number", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_barber_agenda")) return json(route, [upcomingRow(null)]).then(() => true);
  });

  await page.goto("/my-agenda");
  await expect(page.getByTestId("barber-confirm-appt-1")).toBeVisible();
  await expect(page.getByTestId("barber-remind-appt-1")).toHaveCount(0);
});
