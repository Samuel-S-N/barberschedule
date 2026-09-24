import type { Page, Route } from "@playwright/test";

export const shopId = "11111111-1111-4111-8111-111111111111";
export const barberId = "22222222-2222-4222-8222-222222222222";
export const barberServiceId = "33333333-3333-4333-8333-333333333333";
export const customerId = "44444444-4444-4444-8444-444444444444";
export const customerUserId = "55555555-5555-4555-8555-555555555555";

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

export function customerRow(overrides: Record<string, unknown> = {}) {
  return {
    active: true, archived_at: null, email: "customer@example.com", full_name: "Browser Customer",
    id: customerId, phone: null, shop_id: shopId, user_id: customerUserId, ...overrides,
  };
}

export function appointmentRow(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    barber_buffer_minutes_snapshot: 0, barber_id: barberId, barber_service_id: barberServiceId,
    created_at: "2026-08-13T10:00:00Z", customer_id: customerId, ends_at: end.toISOString(),
    id: "appointment-upcoming", notes: null, occupied_until: end.toISOString(),
    service_duration_minutes_snapshot: 30, service_id: "service-1", service_name_snapshot: "Browser Cut",
    service_price_cents_snapshot: 4000, shop_id: shopId, source: "customer",
    starts_at: start.toISOString(), status: "scheduled", updated_at: "2026-08-13T10:00:00Z", ...overrides,
  };
}

export async function signInAsCustomer(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    // Unsigned fake JWT assembled at runtime (no token-like literal in the repo).
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { email: "customer@example.com", id },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: customerUserId });
}

// Return true from `handler` once it has fulfilled the route.
export type RestHandler = (route: Route, url: URL) => Promise<boolean | void> | boolean | void;

export async function mockCustomerRest(page: Page, handler?: RestHandler) {
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (handler && (await handler(route, url)) === true) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Customer", role: "customer", user_id: customerUserId }]);
    if (path.endsWith("/rpc/ensure_my_customer")) return json(route, customerRow());
    if (path.endsWith("/customers")) return json(route, [customerRow()]);
    if (path.endsWith("/shops")) return json(route, [{ id: shopId, name: "Browser Shop" }]);
    if (path.endsWith("/barbers")) return json(route, [{ active: true, archived_at: null, id: barberId, name: "Browser Barber", shop_id: shopId }]);
    await route.abort();
  });
}

export function isHistoryQuery(url: URL) {
  return (url.searchParams.get("status") ?? "").includes("completed");
}
