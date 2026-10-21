import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const P1 = "99999999-9999-4999-8999-999999999991";

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

const plans = [
  { active: true, id: P1, interval_weeks: 1, name: "Corte mensal", normal_cents: 3500, price_cents: 2500, service_id: S1, service_name: "Seed cut" },
  { active: false, id: "99999999-9999-4999-8999-999999999992", interval_weeks: 3, name: "Trimestral", normal_cents: 3500, price_cents: 4500, service_id: S1, service_name: "Seed cut" },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_recurrence_plans")) return json(route, plans);
    if (path.endsWith("/rpc/save_recurrence_plan")) {
      (calls.saves as unknown[]).push(route.request().postDataJSON());

      return json(route, null);
    }
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, []);
    if (path.endsWith("/services") && method === "GET") {
      return json(route, [
        { active: true, archived_at: null, description: null, duration_minutes: 30, id: S1, is_standard: true, name: "Seed cut", price_cents: 3500, shop_id: shop },
        { active: true, archived_at: null, description: null, duration_minutes: 45, id: S2, is_standard: false, name: "Beard", price_cents: 4500, shop_id: shop },
      ]);
    }
    if (path.endsWith("/barber_services") && method === "GET") return json(route, []);
    await route.abort();
  });
}

test("Manage has a Recurrence plans entry; the list shows price, periodicity and inactive plans, with a + button", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { saves: [] });

  await page.goto("/manage");
  await page.getByTestId("menu-recurrence-plans").click();
  await expect(page).toHaveURL(/\/recurrence-plans/);
  await expect(page.getByTestId(`plan-${P1}`)).toContainText("Corte mensal");
  await expect(page.getByTestId(`plan-${P1}`)).toContainText("R$ 25,00 per session");
  await expect(page.getByTestId(`plan-${P1}`)).toContainText("R$ 100,00");
  await expect(page.getByTestId("plan-99999999-9999-4999-8999-999999999992")).toContainText("Trimestral");
  await expect(page.getByTestId("plan-99999999-9999-4999-8999-999999999992")).toContainText("(inactive)");
  await expect(page.getByTestId("fab-add")).toBeVisible();
});

test("the owner creates a plan: service, price, free periodicity", async ({ page }) => {
  const calls = { saves: [] as unknown[] };

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/recurrence-plans");
  await page.getByTestId("fab-add").click();
  await expect(page).toHaveURL(/\/recurrence-plan-form/);
  await expect(page.getByTestId("plan-save")).toBeDisabled();
  await page.getByTestId(`option-plan-service-${S2}`).click();
  await page.getByTestId("plan-price").fill("30,00");
  await page.getByTestId("plan-weeks-2").click(); // quick chip: every 2 weeks
  await expect(page.getByTestId("plan-weeks")).toHaveValue("2");
  await page.getByTestId("plan-weeks").fill("3");
  await expect(page.getByTestId("plan-save")).toBeDisabled(); // the title is still empty
  await page.getByTestId("plan-name").fill("Barba trimestral");
  await expect(page.getByTestId("plan-save")).toBeEnabled();
  await page.getByTestId("plan-save").click();

  await expect.poll(() => calls.saves).toEqual([{ target_active: true, target_interval_weeks: 3, target_name: "Barba trimestral", target_plan_id: null, target_price_cents: 3000, target_service_id: S2 }]);
  await expect(page).toHaveURL(/\/recurrence-plans$/);
});

test("the owner edits a plan and deactivates it with the red button", async ({ page }) => {
  const calls = { saves: [] as unknown[] };

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/recurrence-plans");
  await page.getByTestId(`plan-edit-${P1}`).click();
  await expect(page).toHaveURL(new RegExp(`/recurrence-plan-form\\?id=${P1}`));
  await expect(page.getByTestId("plan-price")).toHaveValue("25,00");
  await expect(page.getByTestId("plan-weeks")).toHaveValue("1");
  await page.getByTestId("plan-price").fill("27,00");
  await page.getByTestId("plan-save").click();
  await expect.poll(() => calls.saves).toEqual([{ target_active: true, target_interval_weeks: 1, target_name: "Corte mensal", target_plan_id: P1, target_price_cents: 2700, target_service_id: S1 }]);

  await expect(page.getByTestId("plan-toggle")).toHaveCSS("background-color", "rgb(220, 59, 48)");
  await page.getByTestId("plan-toggle").click();
  await expect.poll(() => (calls.saves as Array<{ target_active: boolean }>).at(-1)?.target_active).toBe(false);
});

test("back from the plan screens goes to the fixed parents", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { saves: [] });

  const back = () => page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();

  await page.goto(`/recurrence-plan-form?id=${P1}`);
  await back();
  await expect(page).toHaveURL(/\/recurrence-plans$/);
  await back();
  await expect(page).toHaveURL(/\/manage$/);
});
