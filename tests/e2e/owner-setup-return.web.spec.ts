import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";
import { defaultShop, expect, test } from "./fixtures";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shopId = defaultShop.id as string;

test.use({ interceptShops: false, locale: "pt-BR" });

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

// A closed business whose owner is in the middle of the checklist; every save the opened screens make is recorded.
async function mockClosedShop(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.endsWith("/shops") && method === "GET" && (url.searchParams.get("slug") ?? "").startsWith("eq.")) return json(route, [{ ...defaultShop, setup_completed_at: null }]);
    if (path.endsWith("/rpc/get_my_shop")) return json(route, [{ shop_id: shopId, slug: "shop-a" }]);
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/shop_setup_status")) return json(route, { completed: false, missing: ["details", "hours", "services", "team"], professionals: [] });
    if (path.endsWith("/shops") && method === "PATCH") {
      calls.contact = route.request().postDataJSON();

      return json(route, null);
    }
    if (path.endsWith("/rpc/set_shop_hours")) {
      calls.hours = route.request().postDataJSON();

      return json(route, null);
    }
    if (path.endsWith("/rpc/list_owner_professionals")) return json(route, []);
    if (path.endsWith("/services") && method === "POST") {
      calls.createService = route.request().postDataJSON();

      return json(route, { active: true, archived_at: null, description: null, duration_minutes: 20, id: "s-new", is_standard: false, name: "Corte", price_cents: 3000, shop_id: shopId });
    }
    if (method === "GET") return json(route, []);
    await route.abort();
  });
}

test("details: opened from the checklist, Salvar returns to /setup", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockClosedShop(page, calls);
  await page.goto("/setup");

  await page.getByTestId("setup-details-open").click();
  await expect(page).toHaveURL(/\/shop\?from=setup/);
  await page.getByTestId("shop-save").click();

  await expect.poll(() => calls.hours).toBeDefined();
  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByTestId("setup-progress")).toBeVisible();
});

test("details: opened from the normal panel, Salvar stays on the screen", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockClosedShop(page, calls);
  // An open shop: the panel is reachable.
  await page.route("**/rest/v1/shops?*slug=eq*", async (route) => json(route, [{ ...defaultShop, setup_completed_at: "2026-11-01T00:00:00Z" }]));
  await page.goto("/shop");
  await page.getByTestId("shop-save").click();

  await expect.poll(() => calls.hours).toBeDefined();
  await expect(page).toHaveURL(/\/shop$/);
});

test("service: adding a service from the checklist returns to /setup", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockClosedShop(page, calls);
  await page.goto("/setup");

  await page.getByTestId("setup-services-open").click();
  await expect(page).toHaveURL(/\/services\?from=setup/);
  await page.getByTestId("fab-add").click();
  await expect(page).toHaveURL(/\/service-form\?from=setup/);
  await page.getByTestId("service-name").fill("Corte");
  await page.getByTestId("service-duration").fill("20");
  await page.getByTestId("service-price").fill("30,00");
  await page.getByTestId("service-save").click();

  await expect.poll(() => calls.createService).toMatchObject({ name: "Corte" });
  await expect(page).toHaveURL(/\/setup/);
});

test("colours: the checklist opens the appearance screen with from=setup", async ({ page }) => {
  await signInAsOwner(page);
  await mockClosedShop(page, {});
  await page.goto("/setup");

  await page.getByTestId("setup-colours-open").click();
  await expect(page).toHaveURL(/\/appearance\?from=setup/);
});
