import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";
const C1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const C2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

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

const customers = [
  { active: true, archived_at: null, email: "ana@x.com", full_name: "Ana Souza", id: C1, phone: "11988887777", shop_id: shop, user_id: null },
  { active: false, archived_at: "2026-09-01T00:00:00Z", email: null, full_name: "Caio Lima", id: C2, phone: "11977776666", shop_id: shop, user_id: null },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/customers") && method === "GET") return json(route, customers);
    if (path.endsWith("/customers") && method === "POST") {
      calls.create = route.request().postDataJSON();

      return json(route, { ...customers[0], id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3", full_name: "Dani Costa" });
    }
    if (path.endsWith("/customers") && method === "PATCH") {
      calls.patch = route.request().postDataJSON();

      return json(route, { ...customers[0], ...(calls.patch as object) });
    }
    await route.abort();
  });
}

test("customers list contact info, archived state, and filter by search", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/customers");
  await expect(page.getByTestId(`owner-customer-${C1}`)).toContainText("ana@x.com");
  await expect(page.getByTestId(`owner-customer-${C2}`)).toContainText("(archived)");
  await expect(page.getByTestId(`owner-customer-${C2}`)).toContainText(/no email/i);

  await page.getByTestId("customer-search").fill("caio");
  await expect(page.getByTestId(`owner-customer-${C1}`)).toHaveCount(0);
  await expect(page.getByTestId(`owner-customer-${C2}`)).toBeVisible();
  await page.getByTestId("customer-search").fill("98888");
  await expect(page.getByTestId(`owner-customer-${C1}`)).toBeVisible();
});

test("the owner adds a customer; the form needs a name and a contact", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/customers");
  await expect(page.getByTestId("customer-save")).toBeDisabled();
  await page.getByTestId("customer-name").fill("Dani Costa");
  await expect(page.getByTestId("customer-save")).toBeDisabled();
  await page.getByTestId("customer-email").fill("dani@x.com");
  await page.getByTestId("customer-save").click();

  await expect.poll(() => calls.create).toMatchObject({ email: "dani@x.com", full_name: "Dani Costa", shop_id: shop });
});

test("the owner edits and deactivates a customer", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/customers");
  await page.getByTestId(`customer-edit-${C1}`).click();
  await expect(page.getByTestId("customer-name")).toHaveValue("Ana Souza");
  await page.getByTestId("customer-name").fill("Ana S. Souza");
  await page.getByTestId("customer-save").click();
  await expect.poll(() => (calls.patch as { full_name?: string } | undefined)?.full_name).toBe("Ana S. Souza");

  await page.getByTestId(`customer-toggle-${C1}`).click();
  await expect.poll(() => (calls.patch as { active?: boolean } | undefined)?.active).toBe(false);
});
