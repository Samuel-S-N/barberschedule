import { expect, test } from "@playwright/test";

const customerUserId = "55555555-5555-4555-8555-555555555555";

test("an authenticated customer can open their profile and appointment links", async ({ page }) => {
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
      await route.fulfill({ body: JSON.stringify([{ full_name: "Browser Customer", role: "customer", user_id: customerUserId }]), contentType: "application/json", status: 200 });
      return;
    }
    await route.abort();
  });

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  await expect(page.getByText("Browser Customer")).toBeVisible();
  await expect(page.getByRole("link", { name: "My appointments" })).toBeVisible();
});

test("a customer can view their upcoming appointments", async ({ page }) => {
  const appointment = {
    barber_buffer_minutes_snapshot: 0, barber_id: "barber-1", barber_service_id: "service-1",
    created_at: "2026-08-13T10:00:00Z", customer_id: "customer-1", ends_at: "2026-08-17T12:30:00Z",
    id: "appointment-upcoming", notes: null, occupied_until: "2026-08-17T12:30:00Z",
    service_duration_minutes_snapshot: 30, service_id: "service-1", service_name_snapshot: "Browser Cut",
    service_price_cents_snapshot: 4000, shop_id: "shop-1", source: "customer",
    starts_at: "2026-08-17T12:00:00Z", status: "scheduled", updated_at: "2026-08-13T10:00:00Z",
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
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/get_current_profile")) {
      await route.fulfill({ body: JSON.stringify([{ role: "customer", user_id: customerUserId }]), contentType: "application/json", status: 200 });
      return;
    }
    if (path.endsWith("/appointments")) {
      await route.fulfill({ body: JSON.stringify([appointment]), contentType: "application/json", status: 200 });
      return;
    }
    await route.abort();
  });

  await page.goto("/appointments");
  await expect(page.getByRole("heading", { name: "My appointments" })).toBeVisible();
  await expect(page.getByText("Browser Cut · 2026-08-17T12:00:00Z")).toBeVisible();
});

test("a customer can view completed appointment history", async ({ page }) => {
  const appointment = {
    barber_buffer_minutes_snapshot: 0, barber_id: "barber-1", barber_service_id: "service-1",
    created_at: "2026-08-13T10:00:00Z", customer_id: "customer-1", ends_at: "2026-08-17T12:30:00Z",
    id: "appointment-history", notes: null, occupied_until: "2026-08-17T12:30:00Z",
    service_duration_minutes_snapshot: 30, service_id: "service-1", service_name_snapshot: "Browser Cut",
    service_price_cents_snapshot: 4000, shop_id: "shop-1", source: "customer",
    starts_at: "2026-08-17T12:00:00Z", status: "completed", updated_at: "2026-08-13T10:00:00Z",
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
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/get_current_profile")) {
      await route.fulfill({ body: JSON.stringify([{ role: "customer", user_id: customerUserId }]), contentType: "application/json", status: 200 });
      return;
    }
    if (path.endsWith("/appointments")) {
      await route.fulfill({ body: JSON.stringify([appointment]), contentType: "application/json", status: 200 });
      return;
    }
    await route.abort();
  });

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "Appointment history" })).toBeVisible();
  await expect(page.getByText("Browser Cut · completed")).toBeVisible();
});
