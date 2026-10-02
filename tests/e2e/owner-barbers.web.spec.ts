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

const barbers = [
  { active: true, archived_at: null, commission_percent: "40.00", compensation_type: "commission", id: "b1", name: "Ana Barber", shop_id: shop, user_id: "u1" },
  { active: true, archived_at: null, chair_rental_amount_cents: 30000, chair_rental_frequency: "monthly", commission_percent: "0.00", compensation_type: "chair_rental", id: "b2", name: "Bruno Chair", shop_id: shop, user_id: null },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, barbers);
    if (path.endsWith("/rpc/get_barber_account_status")) return json(route, true);
    if (path.endsWith("/barbers") && method === "POST") {
      calls.create = route.request().postDataJSON();

      return json(route, { active: true, archived_at: null, id: "b3", name: "Caio New", shop_id: shop });
    }
    if (path.endsWith("/barbers") && method === "PATCH") {
      calls.patch = route.request().postDataJSON();

      return json(route, { active: false, archived_at: "2026-10-01T00:00:00Z", id: "b1", name: "Ana Barber", shop_id: shop });
    }
    await route.abort();
  });
}

test("the owner sees each barber with account status and a readable compensation summary", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/barbers");
  await expect(page.getByTestId("owner-barber-b1")).toContainText("Account: active");
  await expect(page.getByTestId("owner-barber-b1")).toContainText("Commission 40%");
  await expect(page.getByTestId("owner-barber-b2")).toContainText("Account: not invited");
  // Money is shown in reais, not raw cents.
  await expect(page.getByTestId("owner-barber-b2")).toContainText("R$ 300,00");
});

test("the owner adds a barber and deactivates another", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/barbers");
  await expect(page.getByTestId("barber-save")).toBeDisabled();
  await page.getByTestId("barber-name-input").fill("Caio New");
  await page.getByTestId("barber-save").click();
  await expect.poll(() => calls.create).toMatchObject({ name: "Caio New", shop_id: shop });

  await page.getByTestId("barber-toggle-b1").click();
  await expect.poll(() => (calls.patch as { active?: boolean } | undefined)?.active).toBe(false);
});

test("the owner edits a barber name", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/barbers");
  await page.getByTestId("barber-edit-b1").click();
  await expect(page.getByTestId("barber-name-input")).toHaveValue("Ana Barber");
  await page.getByTestId("barber-name-input").fill("Ana Silva");
  await page.getByTestId("barber-save").click();
  await expect.poll(() => (calls.patch as { name?: string } | undefined)?.name).toBe("Ana Silva");
});
