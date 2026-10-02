import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";

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

const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const S3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const B1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const B2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const BS1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const BS2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

const services = [
  { active: true, archived_at: null, description: "Classic fade", duration_minutes: 30, id: S1, is_standard: true, name: "Cut", price_cents: 2500, shop_id: shop },
  { active: true, archived_at: null, description: null, duration_minutes: 45, id: S2, is_standard: false, name: "Beard", price_cents: 4500, shop_id: shop },
];
const barbers = [
  { active: true, archived_at: null, id: B1, name: "Ana Barber", shop_id: shop, user_id: null },
  { active: true, archived_at: null, id: B2, name: "Bruno Barber", shop_id: shop, user_id: null },
];
const barberServices = [
  { active: true, archived_at: null, barber_id: B1, duration_override_minutes: null, id: BS1, price_override_cents: 3000, service_id: S1, shop_id: shop },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, barbers);
    if (path.endsWith("/services") && method === "GET") return json(route, services);
    if (path.endsWith("/services") && method === "POST") {
      calls.createService = route.request().postDataJSON();

      return json(route, { ...services[0], id: S3, name: "Shave" });
    }
    if (path.endsWith("/barber_services") && method === "GET") return json(route, barberServices);
    if (path.endsWith("/barber_services") && method === "POST") {
      calls.assign = route.request().postDataJSON();

      return json(route, { active: true, archived_at: null, barber_id: B2, duration_override_minutes: null, id: BS2, price_override_cents: null, service_id: S1, shop_id: shop });
    }
    if (path.endsWith("/barber_services") && method === "PATCH") {
      calls.patch = route.request().postDataJSON();

      return json(route, { ...barberServices[0], ...(calls.patch as object) });
    }
    await route.abort();
  });
}

test("services show duration and price in reais with the standard badge", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/services");
  await expect(page.getByTestId(`owner-service-${S1}`)).toContainText("30 min");
  await expect(page.getByTestId(`owner-service-${S1}`)).toContainText("R$ 25,00");
  await expect(page.getByTestId(`owner-service-${S1}`)).toContainText("Standard");
  await expect(page.getByTestId(`owner-service-${S2}`)).toContainText("R$ 45,00");
});

test("the owner adds a service typing the price in reais", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/services");
  await expect(page.getByTestId("service-save")).toBeDisabled();
  await page.getByTestId("service-name").fill("Shave");
  await page.getByTestId("service-duration").fill("20");
  await page.getByTestId("service-price").fill("35,50");
  await page.getByTestId("service-save").click();

  await expect.poll(() => calls.createService).toMatchObject({ duration_minutes: 20, name: "Shave", price_cents: 3550, shop_id: shop });
});

test("the owner assigns a service to a barber and sets a price override", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/services");
  await page.getByTestId(`service-barbers-${S1}`).click();
  // Ana already offers it with an override; Bruno does not offer it yet.
  await expect(page.getByTestId(`assignment-${S1}-${B1}`)).toContainText("R$ 30,00");
  await expect(page.getByTestId(`assignment-${S1}-${B2}`)).toContainText("Not offered");

  await page.getByTestId(`assign-${S1}-${B2}`).click();
  await expect.poll(() => calls.assign).toMatchObject({ barber_id: B2, service_id: S1, shop_id: shop, price_override_cents: null, duration_override_minutes: null });

  await page.getByTestId(`override-edit-${S1}-${B1}`).click();
  await page.getByTestId("override-price").fill("32,00");
  await page.getByTestId("override-duration").fill("40");
  await page.getByTestId("override-save").click();
  await expect.poll(() => calls.patch).toMatchObject({ duration_override_minutes: 40, price_override_cents: 3200 });
});
