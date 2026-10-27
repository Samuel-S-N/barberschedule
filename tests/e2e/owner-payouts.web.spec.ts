import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";

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

const overview = [
  { balance_cents: 7000, barber_id: "b1", barber_name: "Ana Barber", earned_cents: 10000, last_due_date: "2026-10-26", next_due_date: "2026-11-02", paid_cents: 3000, payout_day_1: 1, payout_day_2: null, payout_schedule: "weekly", status: "pending", tracking_start: "2026-10-01" },
  { balance_cents: 1500, barber_id: "b2", barber_name: "Caio Avulso", earned_cents: 1500, last_due_date: null, next_due_date: null, paid_cents: 0, payout_day_1: null, payout_day_2: null, payout_schedule: "none", status: "no_schedule", tracking_start: "2026-10-01" },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_payout_overview")) return json(route, overview);
    if (path.endsWith("/rpc/list_barber_payouts")) return json(route, []);
    if (path.endsWith("/rpc/record_barber_payout")) {
      calls.payout = route.request().postDataJSON();

      return json(route, { amount_cents: 7000, barber_id: "b1", id: "p1", note: null, paid_on: "2026-10-27" });
    }
    await route.abort();
  });
}

test("each commission barber shows schedule, balance and status", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await page.goto("/payouts");

  await expect(page.getByTestId("payout-card-b1")).toContainText("Ana Barber");
  await expect(page.getByTestId("payout-card-b1")).toContainText("every Monday");
  await expect(page.getByTestId("payout-card-b1")).toContainText("R$ 70,00");
  await expect(page.getByTestId("payout-card-b1")).toContainText("Pending");
  // The pending state uses the app's danger colour (danger-500 #DC3B30), not an unstyled default.
  await expect(page.getByTestId("payout-card-b1").getByText("Pending")).toHaveCSS("color", "rgb(220, 59, 48)");
  await expect(page.getByTestId("payout-card-b2")).toContainText("No schedule");
});

test("paying starts filled with the balance and records the payout", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await page.getByTestId("payout-pay-b1").click();

  await expect(page.getByTestId("payout-amount")).toHaveValue("70,00");
  await page.getByTestId("payout-submit").click();

  await expect.poll(() => calls.payout).toMatchObject({ payout_amount_cents: 7000, target_barber_id: "b1" });
});

test("a one-off payout works for a barber without a schedule", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await page.getByTestId("payout-pay-b2").click();
  await page.getByTestId("payout-amount").fill("10");
  await page.getByTestId("payout-submit").click();

  await expect.poll(() => calls.payout).toMatchObject({ payout_amount_cents: 1000, target_barber_id: "b2" });
});
