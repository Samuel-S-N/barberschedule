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
  { active: false, archived_at: "2026-09-01T00:00:00Z", commission_percent: "30.00", compensation_type: "commission", id: "b9", name: "Dani Inactive", shop_id: shop, user_id: null },
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
    if (path.endsWith("/rpc/set_barber_payout_schedule")) {
      calls.schedule = route.request().postDataJSON();

      return json(route, null);
    }
    if (path.endsWith("/rpc/set_barber_compensation")) {
      calls.compensation = route.request().postDataJSON();

      return json(route, [{ ...barbers[0], commission_percent: "55.00" }]);
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

test("the barbers list shows the active ones, hides inactive ones behind a toggle, and has a + button instead of a form", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/barbers");
  await expect(page.getByTestId("barber-name-input")).toHaveCount(0);
  await expect(page.getByTestId("fab-add")).toBeVisible();
  await expect(page.getByTestId("owner-barber-b1")).toBeVisible();
  await expect(page.getByTestId("owner-barber-b9")).toHaveCount(0);

  await page.getByTestId("barbers-show-inactive").click();
  await expect(page.getByTestId("owner-barber-b9")).toContainText("Dani Inactive");
});

test("the + button opens the registration screen and creates the barber", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/barbers");
  await page.getByTestId("fab-add").click();
  await expect(page).toHaveURL(/\/barber-new/);
  await expect(page.getByTestId("barber-save")).toBeDisabled();
  await page.getByTestId("barber-name-input").fill("Caio New");
  await page.getByTestId("barber-save").click();
  await expect.poll(() => calls.create).toMatchObject({ name: "Caio New", shop_id: shop });
  await expect(page).toHaveURL(/\/barbers/);
});

test("Edit opens the barber profile: rename, compensation and a red Deactivate", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/barbers");
  await page.getByTestId("barber-edit-b1").click();
  await expect(page).toHaveURL(/\/barber-profile\?id=b1/);
  await expect(page.getByTestId("barber-name-input")).toHaveValue("Ana Barber");
  await page.getByTestId("barber-name-input").fill("Ana Silva");
  await page.getByTestId("barber-save").click();
  await expect.poll(() => (calls.patch as { name?: string } | undefined)?.name).toBe("Ana Silva");

  await page.getByTestId("barber-comp-edit").click();
  await page.getByTestId("comp-percent").fill("55");
  await page.getByTestId("comp-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: false, new_commission_percent: 55 });

  // Deactivate uses the app's danger colour (danger-500 #DC3B30).
  await expect(page.getByTestId("barber-toggle")).toContainText("Deactivate");
  await expect(page.getByTestId("barber-toggle")).toHaveCSS("background-color", "rgb(220, 59, 48)");
  await page.getByTestId("barber-toggle").click();
  await expect.poll(() => (calls.patch as { active?: boolean } | undefined)?.active).toBe(false);
});

test("changing an existing commission asks whether it also applies to earlier appointments", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/barber-profile?id=b1");
  await page.getByTestId("barber-comp-edit").click();
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
  await page.goto("/barber-profile?id=b1");
  await page.getByTestId("barber-comp-edit").click();
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
  await page.goto("/barber-profile?id=b1");
  await page.getByTestId("barber-comp-edit").click();
  await page.getByTestId("comp-save").click();

  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: false, new_commission_percent: 40 });
});

test("the owner sets a weekly payout day for a commission barber", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/barber-profile?id=b1");

  await expect(page.getByTestId("payout-schedule-summary")).toContainText("No fixed schedule");
  await page.getByTestId("payout-schedule-weekly").click();
  await page.getByTestId("payout-weekday-1").click();
  await page.getByTestId("payout-schedule-save").click();

  await expect.poll(() => calls.schedule).toMatchObject({ new_day_1: 1, new_day_2: null, new_schedule: "weekly", target_barber_id: "b1" });
});

test("the twice-a-month schedule needs two ascending days", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/barber-profile?id=b1");

  await page.getByTestId("payout-schedule-biweekly").click();
  await page.getByTestId("payout-day-1").fill("20");
  await page.getByTestId("payout-day-2").fill("5");
  await expect(page.getByTestId("payout-schedule-save")).toBeDisabled();

  await page.getByTestId("payout-day-1").fill("5");
  await page.getByTestId("payout-day-2").fill("20");
  await page.getByTestId("payout-schedule-save").click();

  await expect.poll(() => calls.schedule).toMatchObject({ new_day_1: 5, new_day_2: 20, new_schedule: "biweekly" });
});

test("a chair-rental barber has no payout schedule", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await page.goto("/barber-profile?id=b2");

  await expect(page.getByTestId("barber-comp-edit")).toBeVisible();
  await expect(page.getByTestId("payout-schedule-weekly")).toHaveCount(0);
});
