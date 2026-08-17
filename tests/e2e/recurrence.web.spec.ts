import { expect, test } from "@playwright/test";

const shopId = "11111111-1111-4111-8111-111111111111";
const barberServiceId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const ownerId = "44444444-4444-4444-8444-444444444444";

test("an owner can create a recurring booking and inspect its conflict", async ({ page }) => {
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

  const series = {
    active: true, barber_service_id: barberServiceId, customer_id: customerId,
    customer_name: "Monthly Customer", ended_at: null, ends_on: null,
    id: "55555555-5555-4555-855555555555", interval_weeks: 4,
    local_start_date: "2026-08-17", local_start_time: "09:00:00", special_price_cents: 3500,
  };

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json([{ id: shopId }]);
    if (path.endsWith("/customers")) return json([{ active: true, archived_at: null, email: "customer@example.com", full_name: "Monthly Customer", id: customerId, phone: "+55 11 99999-9999", shop_id: shopId, user_id: null }]);
    if (path.endsWith("/barber_services")) return json([{ active: true, archived_at: null, barber_id: "barber-1", duration_override_minutes: null, id: barberServiceId, price_override_cents: null, service_id: "service-1", shop_id: shopId }]);
    if (path.endsWith("/rpc/list_owner_recurrence_series")) return json([series]);
    if (path.endsWith("/rpc/create_recurrence_series")) return json([series]);
    if (path.endsWith("/rpc/ensure_recurrence_window")) return json([{ appointments_created: 1, conflicts_created: 0 }]);
    if (path.endsWith("/rpc/list_owner_recurrence_conflicts")) return json([{
      customer_name: "Monthly Customer", customer_phone: "+55 11 99999-9999", id: "conflict-1",
      local_start_time: "09:00:00", occurrence_date: "2026-08-17", reason: "SLOT_UNAVAILABLE",
      series_id: series.id, service_name: "Cut", status: "open",
    }]);
    await route.abort();
  });

  await page.goto("/monthly-customers");
  await expect(page.getByRole("heading", { name: "Recurring customers" })).toBeVisible();
  await page.getByRole("button", { name: "Monthly Customer" }).click();
  await page.getByRole("button", { name: `Service ${barberServiceId}` }).click();
  await page.getByTestId("recurrence-start-date").fill("2026-08-17");
  await page.getByRole("button", { name: "Create recurrence" }).click();
  await expect(page.getByText("Recurring booking saved.")).toBeVisible();
  await page.getByRole("link", { name: "Recurrence conflicts" }).click();
  await expect(page.getByRole("heading", { name: "Recurrence conflicts" })).toBeVisible();
  await expect(page.getByText("Monthly Customer · Cut")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open WhatsApp" })).toBeVisible();
});

test("an owner can edit, cancel an occurrence, and end a recurring booking", async ({ page }) => {
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

  let currentSeries = {
    active: true, barber_service_id: barberServiceId, customer_id: customerId,
    customer_name: "Monthly Customer", ended_at: null as string | null, ends_on: null,
    id: "55555555-5555-4555-855555555555", interval_weeks: 4,
    local_start_date: "2026-08-17", local_start_time: "09:00:00", special_price_cents: 3500,
  };
  let editPayload: Record<string, unknown> | undefined;
  let cancelOccurrencePayload: Record<string, unknown> | undefined;
  let endPayload: Record<string, unknown> | undefined;

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json([{ id: shopId }]);
    if (path.endsWith("/customers")) return json([{ active: true, archived_at: null, email: "customer@example.com", full_name: "Monthly Customer", id: customerId, phone: "+55 11 99999-9999", shop_id: shopId, user_id: null }]);
    if (path.endsWith("/barber_services")) return json([{ active: true, archived_at: null, barber_id: "barber-1", duration_override_minutes: null, id: barberServiceId, price_override_cents: null, service_id: "service-1", shop_id: shopId }]);
    if (path.endsWith("/rpc/list_owner_recurrence_series")) return json([currentSeries]);
    if (path.endsWith("/rpc/edit_recurrence_series")) {
      editPayload = request.postDataJSON();
      currentSeries = { ...currentSeries, interval_weeks: 5, local_start_time: "10:00:00", special_price_cents: 4000 };
      return json([currentSeries]);
    }
    if (path.endsWith("/rpc/ensure_recurrence_window")) return json([{ appointments_created: 0, conflicts_created: 0 }]);
    if (path.endsWith("/rpc/cancel_recurrence_occurrence")) {
      cancelOccurrencePayload = request.postDataJSON();
      return route.fulfill({ body: "", status: 204 });
    }
    if (path.endsWith("/rpc/end_recurrence_series")) {
      endPayload = request.postDataJSON();
      currentSeries = { ...currentSeries, active: false, ended_at: "2026-08-17T12:00:00.000Z" };
      return json([currentSeries]);
    }
    await route.abort();
  });

  await page.goto("/monthly-customers");
  await expect(page.getByRole("heading", { name: "Recurring customers" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByPlaceholder("Every N weeks").fill("5");
  await page.getByPlaceholder("Local time (HH:mm)").fill("10:00");
  await page.getByPlaceholder("Special price cents (optional)").fill("4000");
  await page.getByRole("button", { name: "Save recurrence" }).click();
  await expect(page.getByText("Recurring booking updated.")).toBeVisible();
  expect(editPayload).toMatchObject({
    target_ends_on: null,
    target_interval_weeks: 5,
    target_local_start_time: "10:00",
    target_series_id: currentSeries.id,
    target_special_price_cents: 4000,
  });

  await page.getByPlaceholder("Occurrence date (YYYY-MM-DD)").fill("2026-08-24");
  await page.getByRole("button", { name: "Cancel occurrence" }).click();
  await expect(page.getByText("Unable to update recurring booking.")).not.toBeVisible();
  expect(cancelOccurrencePayload).toEqual({ target_occurrence_date: "2026-08-24", target_series_id: currentSeries.id });

  await page.getByRole("button", { name: "End series" }).click();
  await expect(page.getByText(/inactive/)).toBeVisible();
  expect(endPayload).toEqual({ target_series_id: currentSeries.id });
});
