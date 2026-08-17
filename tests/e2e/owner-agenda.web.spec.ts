import { expect, test } from "@playwright/test";

const shopId = "11111111-1111-4111-8111-111111111111";
const barberId = "22222222-2222-4222-8222-222222222222";
const barberServiceId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";
const ownerId = "55555555-5555-4555-855555555555";

test("an owner can browse the agenda and create a manual booking", async ({ page }) => {
  let bookingPayload: Record<string, unknown> | null = null;

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
  }, { userId: ownerId });

  const appointment = {
    barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_name: "Browser Barber",
    barber_service_id: barberServiceId, created_at: "2026-08-13T10:00:00Z",
    customer_id: customerId, customer_name: "Browser Customer", ends_at: "2026-08-17T12:30:00Z",
    id: "appointment-1", notes: null, occupied_until: "2026-08-17T12:30:00Z",
    service_duration_minutes_snapshot: 30, service_id: "service-1", service_name_snapshot: "Browser Cut",
    service_price_cents_snapshot: 4000, shop_id: shopId, source: "owner", starts_at: "2026-08-17T12:00:00Z",
    status: "scheduled", updated_at: "2026-08-13T10:00:00Z",
  };

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json([{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_agenda")) return json([appointment]);
    if (path.endsWith("/rpc/list_owner_agenda_overrides")) return json([]);
    if (path.endsWith("/rpc/set_owner_appointment_status")) return json([{ ...appointment, status: "completed" }]);
    if (path.endsWith("/rpc/list_owner_barbers")) return json([{ active: true, archived_at: null, id: barberId, name: "Browser Barber", shop_id: shopId, user_id: null }]);
    if (path.endsWith("/customers")) return json([{ active: true, archived_at: null, email: "customer@example.com", full_name: "Browser Customer", id: customerId, phone: null, shop_id: shopId, user_id: null }]);
    if (path.endsWith("/barber_services")) return json([{ active: true, archived_at: null, barber_id: barberId, duration_override_minutes: null, id: barberServiceId, price_override_cents: null, service_id: "service-1", shop_id: shopId }]);
    if (path.endsWith("/services")) return json([{ active: true, archived_at: null, description: null, duration_minutes: 30, id: "service-1", name: "Browser Cut", price_cents: 4000, shop_id: shopId }]);
    if (path.endsWith("/rpc/get_available_slots")) return json([{ ends_at: "2026-08-17T12:30:00Z", local_date: "2026-08-17", local_time: "09:00:00", starts_at: "2026-08-17T12:00:00Z" }]);
    if (path.endsWith("/rpc/book_appointment")) {
      bookingPayload = request.postDataJSON() as Record<string, unknown>;
      return json([appointment]);
    }

    await route.abort();
  });

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Owner agenda" })).toBeVisible();
  await expect(page.getByText("Browser Customer · Browser Cut")).toBeVisible();
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByText(/Week:/)).toBeVisible();
  await page.getByRole("button", { name: "Month" }).click();
  await expect(page.getByText(/Month:/)).toBeVisible();
  await page.getByRole("button", { name: "Complete" }).click();
  await page.getByRole("link", { name: "New appointment" }).click();

  await expect(page.getByRole("heading", { name: "New owner appointment" })).toBeVisible();
  await page.getByRole("button", { name: "Browser Customer" }).click();
  await page.getByRole("button", { name: "Browser Barber · Browser Cut" }).click();
  await page.getByTestId("owner-appointment-date").fill("2026-08-17");
  await page.getByRole("button", { name: "Load available times" }).click();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByRole("button", { name: "Create appointment" }).click();

  await expect(page.getByText("Appointment created.")).toBeVisible();
  expect(bookingPayload).toMatchObject({ customer_id: customerId, source: "owner" });
});

test("an owner can mark an appointment as no-show or cancelled", async ({ page }) => {
  let statusPayload: Record<string, unknown> | null = null;
  let cancelPayload: Record<string, unknown> | null = null;
  const appointments = [
    {
      barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_name: "Browser Barber",
      barber_service_id: barberServiceId, created_at: "2026-08-13T10:00:00Z", customer_id: customerId,
      customer_name: "No-show Customer", ends_at: "2026-08-17T12:30:00Z", id: "appointment-no-show",
      notes: null, occupied_until: "2026-08-17T12:30:00Z", service_duration_minutes_snapshot: 30,
      service_id: "service-1", service_name_snapshot: "Browser Cut", service_price_cents_snapshot: 4000,
      shop_id: shopId, source: "customer", starts_at: "2026-08-17T12:00:00Z", status: "scheduled",
      updated_at: "2026-08-13T10:00:00Z",
    },
    {
      barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_name: "Browser Barber",
      barber_service_id: barberServiceId, created_at: "2026-08-13T10:00:00Z", customer_id: customerId,
      customer_name: "Cancelled Customer", ends_at: "2026-08-17T13:30:00Z", id: "appointment-cancelled",
      notes: null, occupied_until: "2026-08-17T13:30:00Z", service_duration_minutes_snapshot: 30,
      service_id: "service-1", service_name_snapshot: "Browser Cut", service_price_cents_snapshot: 4000,
      shop_id: shopId, source: "customer", starts_at: "2026-08-17T13:00:00Z", status: "scheduled",
      updated_at: "2026-08-13T10:00:00Z",
    },
  ];
  let agenda = [...appointments];

  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: ownerId });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
    if (path.endsWith("/rpc/get_current_profile")) return json([{ role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json([{ id: shopId }]);
    if (path.endsWith("/rpc/list_owner_agenda")) return json(agenda);
    if (path.endsWith("/rpc/list_owner_agenda_overrides")) return json([]);
    if (path.endsWith("/rpc/set_owner_appointment_status")) {
      statusPayload = request.postDataJSON() as Record<string, unknown>;
      agenda = agenda.map((appointment) => appointment.id === "appointment-no-show" ? { ...appointment, status: "no_show" } : appointment);
      return json(agenda.filter((appointment) => appointment.id === "appointment-no-show"));
    }
    if (path.endsWith("/rpc/cancel_appointment")) {
      cancelPayload = request.postDataJSON() as Record<string, unknown>;
      agenda = agenda.map((appointment) => appointment.id === "appointment-cancelled" ? { ...appointment, status: "cancelled" } : appointment);
      return json(agenda.find((appointment) => appointment.id === "appointment-cancelled"));
    }
    await route.abort();
  });

  await page.goto("/agenda");
  await expect(page.getByText("No-show Customer · Browser Cut")).toBeVisible();
  await expect(page.getByText("Cancelled Customer · Browser Cut")).toBeVisible();

  await page.getByRole("button", { name: "No-show" }).first().click();
  await expect(page.getByText("no_show")).toBeVisible();
  expect(statusPayload).toEqual({ appointment_id: "appointment-no-show", new_status: "no_show" });

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("cancelled")).toBeVisible();
  expect(cancelPayload).toEqual({ appointment_id: "appointment-cancelled" });
});
