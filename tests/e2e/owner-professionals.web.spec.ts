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

const professionals = [
  { active: true, archived_at: null, commission_percent: "40.00", compensation_type: "commission", id: "b1", name: "Ana Professional", shop_id: shop, user_id: "u1" },
  { active: true, archived_at: null, chair_rental_amount_cents: 30000, chair_rental_frequency: "monthly", commission_percent: "0.00", compensation_type: "chair_rental", id: "b2", name: "Bruno Chair", shop_id: shop, user_id: null },
  { active: false, archived_at: "2026-09-01T00:00:00Z", commission_percent: "30.00", compensation_type: "commission", id: "b9", name: "Dani Inactive", shop_id: shop, user_id: null },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_owner_professionals")) return json(route, professionals);
    if (path.endsWith("/rpc/get_professional_account_status")) return json(route, true);
    if (path.endsWith("/professionals") && method === "POST") {
      calls.create = route.request().postDataJSON();

      return json(route, { active: true, archived_at: null, id: "b3", name: "Caio New", shop_id: shop });
    }
    if (path.endsWith("/rpc/set_professional_compensation")) {
      calls.compensation = route.request().postDataJSON();

      return json(route, [{ ...professionals[0], commission_percent: "55.00" }]);
    }
    if (path.endsWith("/professionals") && method === "PATCH") {
      calls.patch = route.request().postDataJSON();

      return json(route, { active: false, archived_at: "2026-10-01T00:00:00Z", id: "b1", name: "Ana Professional", shop_id: shop });
    }
    await route.abort();
  });
}

test("the owner sees each professional with account status and a readable compensation summary", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/professionals");
  await expect(page.getByTestId("owner-professional-b1")).toContainText("Account: active");
  await expect(page.getByTestId("owner-professional-b1")).toContainText("Commission 40%");
  await expect(page.getByTestId("owner-professional-b2")).toContainText("Account: not invited");
  // Money is shown in reais, not raw cents.
  await expect(page.getByTestId("owner-professional-b2")).toContainText("R$ 300,00");
});

test("the professionals list shows the active ones, hides inactive ones behind a toggle, and has a + button instead of a form", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/professionals");
  await expect(page.getByTestId("professional-name-input")).toHaveCount(0);
  await expect(page.getByTestId("fab-add")).toBeVisible();
  await expect(page.getByTestId("owner-professional-b1")).toBeVisible();
  await expect(page.getByTestId("owner-professional-b9")).toHaveCount(0);

  await page.getByTestId("professionals-show-inactive").click();
  await expect(page.getByTestId("owner-professional-b9")).toContainText("Dani Inactive");
});

test("the + button opens the registration screen and creates the professional", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/professionals");
  await page.getByTestId("fab-add").click();
  await expect(page).toHaveURL(/\/professional-new/);
  await expect(page.getByTestId("professional-save")).toBeDisabled();
  await page.getByTestId("professional-name-input").fill("Caio New");
  await page.getByTestId("professional-save").click();
  await expect.poll(() => calls.create).toMatchObject({ name: "Caio New", shop_id: shop });
  await expect(page).toHaveURL(/\/professionals/);
});

test("Edit opens the professional profile: rename, compensation and a red Deactivate", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/professionals");
  await page.getByTestId("professional-edit-b1").click();
  await expect(page).toHaveURL(/\/professional-profile\?id=b1/);
  await expect(page.getByTestId("professional-name-input")).toHaveValue("Ana Professional");
  await page.getByTestId("professional-name-input").fill("Ana Silva");
  await page.getByTestId("professional-save").click();
  await expect.poll(() => (calls.patch as { name?: string } | undefined)?.name).toBe("Ana Silva");

  await page.getByTestId("professional-comp-edit").click();
  await page.getByTestId("comp-percent").fill("55");
  await page.getByTestId("comp-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: false, new_commission_percent: 55 });

  // Deactivate uses the app's danger colour (danger-500 #DC3B30).
  await expect(page.getByTestId("professional-toggle")).toContainText("Deactivate");
  await expect(page.getByTestId("professional-toggle")).toHaveCSS("background-color", "rgb(220, 59, 48)");
  await page.getByTestId("professional-toggle").click();
  await expect.poll(() => (calls.patch as { active?: boolean } | undefined)?.active).toBe(false);
});

test("changing an existing commission asks whether it also applies to earlier appointments", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/professional-profile?id=b1");
  await page.getByTestId("professional-comp-edit").click();
  await page.getByTestId("comp-percent").fill("55");
  await page.getByTestId("comp-save").click();

  await expect(page.getByTestId("confirm-dialog")).toContainText("Change commission");
  await page.getByTestId("confirm-dialog-alternate").click();

  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: true, new_commission_percent: 55 });
});

test("cancelling the commission prompt saves nothing and keeping the past is the highlighted choice", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/professional-profile?id=b1");
  await page.getByTestId("professional-comp-edit").click();
  await page.getByTestId("comp-percent").fill("55");
  await page.getByTestId("comp-save").click();
  await expect(page.getByTestId("confirm-dialog-confirm")).not.toHaveCSS("background-color", "rgb(220, 59, 48)");
  await page.getByTestId("confirm-dialog-cancel").click();
  expect(calls.compensation).toBeUndefined();

  await page.getByTestId("comp-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: false, new_commission_percent: 55 });
});

test("an unchanged percent saves without asking", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/professional-profile?id=b1");
  await page.getByTestId("professional-comp-edit").click();
  await page.getByTestId("comp-save").click();

  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: false, new_commission_percent: 40 });
});
