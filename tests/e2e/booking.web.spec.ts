import { expect, test } from "@playwright/test";

const shopId = "11111111-1111-4111-8111-111111111111";
const barberId = "22222222-2222-4222-8222-222222222222";
const barberServiceId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";
const customerUserId = "55555555-5555-4555-8555-555555555555";

test("an authenticated customer can select a public slot and submit a booking", async ({ page }) => {
  let bookingPayload: Record<string, unknown> | null = null;
  await page.setViewportSize({ height: 480, width: 320 });
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;

    localStorage.setItem("sb-example-auth-token", JSON.stringify({
      access_token: token,
      expires_at: now + 3600,
      expires_in: 3600,
      refresh_token: "e2e-refresh-token",
      token_type: "bearer",
      user: { id: userId },
    }));
    localStorage.setItem("sb-127-auth-token", localStorage.getItem("sb-example-auth-token") ?? "");
  }, { userId: customerUserId });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) => route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      status: 200,
    });

    if (url.pathname.endsWith("/rpc/get_current_profile")) {
      await json([{ role: "customer", user_id: customerUserId }]);
      return;
    }

    if (url.pathname.endsWith("/shops")) {
      await json([{ id: shopId, name: "Browser Shop" }]);
      return;
    }

    if (url.pathname.endsWith("/barbers")) {
      await json([{ active: true, archived_at: null, id: barberId, name: "Browser Barber", shop_id: shopId }]);
      return;
    }

    if (url.pathname.endsWith("/barber_services")) {
      await json([{
        duration_override_minutes: null,
        id: barberServiceId,
        price_override_cents: null,
        service_id: "service-1",
        services: { duration_minutes: 30, name: "Browser Cut", price_cents: 4000 },
      }]);
      return;
    }

    if (url.pathname.endsWith("/customers")) {
      await json([{
        active: true,
        archived_at: null,
        email: "customer@example.com",
        full_name: "Browser Customer",
        id: customerId,
        phone: null,
        shop_id: shopId,
        user_id: customerUserId,
      }]);
      return;
    }

    if (url.pathname.endsWith("/rpc/get_available_slots")) {
      await json([{
        ends_at: "2026-08-17T12:30:00Z",
        local_date: "2026-08-17",
        local_time: "09:00:00",
        starts_at: "2026-08-17T12:00:00Z",
      }]);
      return;
    }

    if (url.pathname.endsWith("/rpc/book_appointment")) {
      bookingPayload = request.postDataJSON() as Record<string, unknown>;
      await json([{
        barber_buffer_minutes_snapshot: 0,
        barber_id: barberId,
        barber_service_id: barberServiceId,
        created_at: "2026-08-13T10:00:00Z",
        customer_id: customerId,
        ends_at: "2026-08-17T12:30:00Z",
        id: "appointment-1",
        notes: null,
        occupied_until: "2026-08-17T12:30:00Z",
        service_duration_minutes_snapshot: 30,
        service_id: "service-1",
        service_name_snapshot: "Browser Cut",
        service_price_cents_snapshot: 4000,
        shop_id: shopId,
        source: "customer",
        starts_at: "2026-08-17T12:00:00Z",
        status: "scheduled",
        updated_at: "2026-08-13T10:00:00Z",
      }]);
      return;
    }

    await route.abort();
  });

  await page.goto("/book");
  await page.getByRole("button", { name: "Start booking at Browser Shop" }).click();
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByTestId("booking-review-scroll")).toBeVisible();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByText("Booking confirmed.")).toBeVisible();
  expect(bookingPayload).toMatchObject({ customer_id: customerId, source: "customer" });
});

test("a customer sees an unavailable error when booking loses the slot", async ({ page }) => {
  let bookingPayload: Record<string, unknown> | null = null;

  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: customerUserId });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (url.pathname.endsWith("/rpc/get_current_profile")) return json([{ role: "customer", user_id: customerUserId }]);
    if (url.pathname.endsWith("/shops")) return json([{ id: shopId, name: "Browser Shop" }]);
    if (url.pathname.endsWith("/barbers")) return json([{ active: true, archived_at: null, id: barberId, name: "Browser Barber", shop_id: shopId }]);
    if (url.pathname.endsWith("/barber_services")) {
      await json([{
        duration_override_minutes: null,
        id: barberServiceId,
        price_override_cents: null,
        service_id: "service-1",
        services: { duration_minutes: 30, name: "Browser Cut", price_cents: 4000 },
      }]);
      return;
    }
    if (url.pathname.endsWith("/customers")) return json([{ active: true, archived_at: null, email: "customer@example.com", full_name: "Browser Customer", id: customerId, phone: null, shop_id: shopId, user_id: customerUserId }]);
    if (url.pathname.endsWith("/rpc/get_available_slots")) return json([{ ends_at: "2026-08-17T12:30:00Z", local_date: "2026-08-17", local_time: "09:00:00", starts_at: "2026-08-17T12:00:00Z" }]);
    if (url.pathname.endsWith("/rpc/book_appointment")) {
      bookingPayload = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ body: JSON.stringify({ code: "23P01", message: "overlap" }), contentType: "application/json", status: 409 });
    }
    await route.abort();
  });

  await page.goto("/book");
  await page.getByRole("button", { name: "Start booking at Browser Shop" }).click();
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByText("That time is no longer available.")).toBeVisible();
  await expect(page.getByText("Booking confirmed.")).not.toBeVisible();
  expect(bookingPayload).toMatchObject({ customer_id: customerId, source: "customer" });
});

test("an owner is redirected away from the customer booking flow", async ({ page }) => {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    localStorage.setItem("sb-example-auth-token", JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId },
    }));
    localStorage.setItem("sb-127-auth-token", localStorage.getItem("sb-example-auth-token") ?? "");
  }, { userId: customerUserId });

  await page.route("**/rest/v1/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/rpc/get_current_profile")) {
      await route.fulfill({
        body: JSON.stringify([{ role: "owner", user_id: customerUserId }]),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "Barberschedule MVP" })).toBeVisible();
});

test("a customer can reschedule an appointment from their appointments list", async ({ page }) => {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    localStorage.setItem("sb-example-auth-token", JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId },
    }));
    localStorage.setItem("sb-127-auth-token", localStorage.getItem("sb-example-auth-token") ?? "");
  }, { userId: customerUserId });

  const appointment = {
    barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_service_id: barberServiceId,
    created_at: "2026-08-13T10:00:00Z", customer_id: customerId,
    ends_at: "2026-08-17T12:30:00Z", id: "appointment-1", notes: null,
    occupied_until: "2026-08-17T12:30:00Z", service_duration_minutes_snapshot: 30,
    service_id: "service-1", service_name_snapshot: "Browser Cut",
    service_price_cents_snapshot: 4000, shop_id: shopId, source: "customer",
    starts_at: "2026-08-17T12:00:00Z", status: "scheduled",
    updated_at: "2026-08-13T10:00:00Z",
  };

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
    if (url.pathname.endsWith("/rpc/get_current_profile")) return json([{ role: "customer", user_id: customerUserId }]);
    if (url.pathname.endsWith("/appointments")) return json([appointment]);
    if (url.pathname.endsWith("/rpc/reschedule_appointment")) return json([{ ...appointment, starts_at: "2026-08-17T13:00:00Z" }]);
    await route.abort();
  });

  await page.goto("/appointments");
  await page.getByPlaceholder("New start (ISO)").fill("2026-08-17T13:00:00Z");
  await page.getByRole("button", { name: "Reschedule appointment" }).click();
  await expect(page.getByText("Appointment rescheduled.")).toBeVisible();
});

test("a customer can cancel an appointment from their appointments list", async ({ page }) => {
  let cancelled = false;
  let cancelPayload: Record<string, unknown> | null = null;
  const appointment = {
    barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_service_id: barberServiceId,
    created_at: "2026-08-13T10:00:00Z", customer_id: customerId,
    ends_at: "2026-08-17T12:30:00Z", id: "appointment-1", notes: null,
    occupied_until: "2026-08-17T12:30:00Z", service_duration_minutes_snapshot: 30,
    service_id: "service-1", service_name_snapshot: "Browser Cut",
    service_price_cents_snapshot: 4000, shop_id: shopId, source: "customer",
    starts_at: "2026-08-17T12:00:00Z", status: "scheduled",
    updated_at: "2026-08-13T10:00:00Z",
  };

  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: customerUserId });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
    if (url.pathname.endsWith("/rpc/get_current_profile")) return json([{ role: "customer", user_id: customerUserId }]);
    if (url.pathname.endsWith("/appointments")) return json(cancelled ? [] : [appointment]);
    if (url.pathname.endsWith("/rpc/cancel_appointment")) {
      cancelPayload = request.postDataJSON() as Record<string, unknown>;
      cancelled = true;
      return json([{ ...appointment, status: "cancelled" }]);
    }
    await route.abort();
  });

  await page.goto("/appointments");
  await expect(page.getByText("Browser Cut · 2026-08-17T12:00:00Z")).toBeVisible();
  await page.getByRole("button", { name: "Cancel appointment" }).click();

  await expect(page.getByText("Browser Cut · 2026-08-17T12:00:00Z")).not.toBeVisible();
  expect(cancelPayload).toEqual({ appointment_id: "appointment-1" });
});
