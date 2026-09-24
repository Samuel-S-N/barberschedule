import { expect, test } from "@playwright/test";

import {
  appointmentRow, barberId, barberServiceId, customerId, customerUserId, json, mockCustomerRest, shopId, signInAsCustomer,
} from "./customer-helpers";

const slot = { ends_at: "2026-08-17T12:30:00Z", local_date: "2026-08-17", local_time: "09:00:00", starts_at: "2026-08-17T12:00:00Z" };

function bookingRest(
  page: import("@playwright/test").Page,
  onBook: (payload: Record<string, unknown>) => Promise<void> | void,
  bookStatus = 200,
  extra?: (route: import("@playwright/test").Route, url: URL) => Promise<boolean | void> | boolean | void,
) {
  return mockCustomerRest(page, async (route, url) => {
    if (extra && (await extra(route, url)) === true) return true;
    if (url.pathname.endsWith("/barber_services")) {
      await json(route, [{
        duration_override_minutes: null, id: barberServiceId, price_override_cents: null, service_id: "service-1",
        services: { duration_minutes: 30, name: "Browser Cut", price_cents: 4000 },
      }]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/get_available_slots")) {
      expect((route.request().postDataJSON() as Record<string, unknown>).local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await json(route, [slot]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/book_appointment")) {
      await onBook(route.request().postDataJSON() as Record<string, unknown>);
      if (bookStatus !== 200) {
        await json(route, { code: "23P01", message: "overlap" }, 409);
        return true;
      }
      await json(route, [{
        barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_service_id: barberServiceId,
        created_at: "2026-08-13T10:00:00Z", customer_id: customerId, ends_at: slot.ends_at, id: "appointment-1",
        notes: null, occupied_until: slot.ends_at, service_duration_minutes_snapshot: 30, service_id: "service-1",
        service_name_snapshot: "Browser Cut", service_price_cents_snapshot: 4000, shop_id: shopId, source: "customer",
        starts_at: slot.starts_at, status: "scheduled", updated_at: "2026-08-13T10:00:00Z",
      }]);
      return true;
    }
  });
}

async function walkToReview(page: import("@playwright/test").Page) {
  await page.goto("/book");
  // One shop: the picker is skipped and the barber list opens directly.
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByTestId("booking-review-scroll")).toBeVisible();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
}

test("an authenticated customer can select a slot and submit a booking", async ({ page }) => {
  let bookingPayload: Record<string, unknown> | null = null;
  await page.setViewportSize({ height: 480, width: 320 });
  await signInAsCustomer(page);
  await bookingRest(page, (payload) => { bookingPayload = payload; });

  await walkToReview(page);

  await expect(page.getByText("Booking confirmed.")).toBeVisible();
  expect(bookingPayload).toMatchObject({ customer_id: customerId, source: "customer", starts_at: "2026-08-17T12:00:00Z" });
});

test("a new booking appears on Home and Agenda without reloading", async ({ page }) => {
  let booked = false;
  await signInAsCustomer(page);
  await bookingRest(page, () => { booked = true; }, 200, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, booked ? [appointmentRow()] : []);
      return true;
    }
  });

  // Home loads first (empty) and stays mounted under the tab bar.
  await page.goto("/home");
  await expect(page.getByText("No upcoming appointments")).toBeVisible();

  await page.getByTestId("tab-book").click();
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booking confirmed.")).toBeVisible();

  await page.getByTestId("tab-home").click();
  await expect(page.getByTestId("home-next-appointment")).toBeVisible();

  await page.getByTestId("tab-appointments").click();
  await expect(page.getByTestId("appointment-card-appointment-upcoming")).toBeVisible();
});

test("a customer sees an unavailable error when booking loses the slot", async ({ page }) => {
  let bookingPayload: Record<string, unknown> | null = null;
  await signInAsCustomer(page);
  await bookingRest(page, (payload) => { bookingPayload = payload; }, 409);

  await walkToReview(page);

  await expect(page.getByText("That time is no longer available.")).toBeVisible();
  await expect(page.getByText("Booking confirmed.")).not.toBeVisible();
  expect(bookingPayload).toMatchObject({ customer_id: customerId, source: "customer", starts_at: "2026-08-17T12:00:00Z" });
});

test("a new account is bootstrapped with ensure_my_customer before booking", async ({ page }) => {
  let ensureCalls = 0;
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/ensure_my_customer")) {
      ensureCalls += 1;
      await json(route, { active: true, archived_at: null, email: "customer@example.com", full_name: "Browser Customer", id: customerId, phone: null, shop_id: shopId, user_id: customerUserId });
      return true;
    }
  });

  await page.goto("/book");
  await expect(page.getByRole("button", { name: "Browser Barber" })).toBeVisible();
  expect(ensureCalls).toBe(1);
});

test("an owner is redirected away from the customer booking flow", async ({ page }) => {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    localStorage.setItem("sb-example-auth-token", JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId },
    }));
    localStorage.setItem("sb-127-auth-token", localStorage.getItem("sb-example-auth-token") ?? "");
  }, { userId: customerUserId });

  await page.route("**/rest/v1/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/rpc/get_current_profile")) {
      await json(route, [{ role: "owner", user_id: customerUserId }]);
      return;
    }
    await route.abort();
  });

  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "Barberschedule MVP" })).toBeVisible();
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Barberschedule MVP" })).toBeVisible();
});
