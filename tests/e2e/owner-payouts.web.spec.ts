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
  { balance_cents: 7000, barber_id: "b1", barber_name: "Ana Barber", current_open_cents: 5000, earned_cents: 10000, last_due_date: "2026-10-26", next_due_date: "2026-11-02", paid_cents: 3000, payout_day_1: 1, payout_day_2: null, payout_schedule: "weekly", period_start: "2026-10-26", prior_open_cents: 2000, status: "pending", tracking_start: "2026-10-01" },
  { balance_cents: 1500, barber_id: "b2", barber_name: "Caio Avulso", current_open_cents: 1500, earned_cents: 1500, last_due_date: null, next_due_date: null, paid_cents: 0, payout_day_1: null, payout_day_2: null, payout_schedule: "none", period_start: null, prior_open_cents: 0, status: "no_schedule", tracking_start: "2026-10-01" },
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

test("registering a payment opens a pop-up with what is open, filled with the total", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");

  // The card itself shows what the barber should receive, split in the two periods.
  await expect(page.getByTestId("payout-card-b1")).toContainText("R$ 70,00");
  await expect(page.getByTestId("payout-period-b1-prior")).toContainText("R$ 20,00");
  await expect(page.getByTestId("payout-period-b1-current")).toContainText("R$ 50,00");
  await expect(page.getByTestId("payout-pay-b1")).toContainText("Record payment");

  await page.getByTestId("payout-pay-b1").click();
  await expect(page.getByTestId("payout-sheet")).toContainText("Record payment · Ana Barber");
  await expect(page.getByTestId("payout-sheet")).toContainText("The app does not send money");
  await expect(page.getByTestId("payout-sheet-period-total")).toContainText("R$ 70,00");
  await expect(page.getByTestId("payout-sheet-period-prior")).toContainText("R$ 20,00");
  // The background is dimmed behind a floating window (not glued to the bottom edge, like the agenda pop-up).
  await expect(page.getByTestId("payout-sheet-backdrop")).toHaveCSS("background-color", "rgba(0, 0, 0, 0.4)");
  const sheetBox = (await page.getByTestId("payout-sheet").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(sheetBox.x).toBeGreaterThan(0);
  expect(sheetBox.x + sheetBox.width).toBeLessThan(viewport.width);
  expect(sheetBox.y + sheetBox.height).toBeLessThan(viewport.height);
  await expect(page.getByTestId("payout-sheet")).toHaveCSS("border-top-left-radius", "16px");

  await expect(page.getByTestId("payout-amount")).toHaveValue("70,00");
  await page.getByTestId("payout-amount").fill("20");
  await page.getByTestId("payout-note").fill("Semana 1");
  await page.getByTestId("payout-submit").click();

  await expect.poll(() => calls.payout).toMatchObject({ payout_amount_cents: 2000, payout_note: "Semana 1", target_barber_id: "b1" });
  await expect(page.getByTestId("payout-sheet")).toHaveCount(0);
});

test("cancelling the pop-up records nothing", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await page.getByTestId("payout-pay-b1").click();
  await expect(page.getByTestId("payout-sheet")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByTestId("payout-sheet")).toHaveCount(0);
  expect(calls.payout).toBeUndefined();
});

test("tapping outside the payment pop-up closes it without recording anything", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await page.getByTestId("payout-pay-b1").click();
  await expect(page.getByTestId("payout-sheet")).toBeVisible();
  await page.mouse.click(5, 5); // the dimmed area around the window
  await expect(page.getByTestId("payout-sheet")).toHaveCount(0);
  expect(calls.payout).toBeUndefined();

  // Tapping inside the sheet must not close it.
  await page.getByTestId("payout-pay-b1").click();
  await page.getByTestId("payout-sheet").getByText("Outstanding").click();
  await expect(page.getByTestId("payout-sheet")).toBeVisible();
});

test("a one-off payout works for a barber without a schedule", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await expect(page.getByTestId("payout-period-b2-current")).toHaveCount(0);
  await page.getByTestId("payout-pay-b2").click();
  await page.getByTestId("payout-amount").fill("10");
  await page.getByTestId("payout-submit").click();

  await expect.poll(() => calls.payout).toMatchObject({ payout_amount_cents: 1000, target_barber_id: "b2" });
});

test("tapping the payout reminder opens the payouts screen", async ({ page }) => {
  await signInAsOwner(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/notifications")) {
      return json(route, [{ appointment_id: null, created_at: "2026-10-27T11:00:00Z", id: "n1", kind: "payout_due", params: { barber_names: ["Ana Barber", "Caio Avulso"], count: 2, date: "2026-10-27" }, read_at: null }]);
    }
    if (path.endsWith("/rpc/get_payout_overview")) return json(route, overview);
    if (path.endsWith("/rpc/list_barber_payouts")) return json(route, []);
    if (path.includes("/rpc/")) return json(route, null);
    await route.abort();
  });

  await page.goto("/owner-notifications");
  await expect(page.getByTestId("notification-n1")).toContainText("Payout day");
  await expect(page.getByTestId("notification-n1")).toContainText("Ana Barber, Caio Avulso");
  await page.getByTestId("notification-n1").click();

  await expect(page).toHaveURL(/\/payouts/);
  await expect(page.getByTestId("payout-card-b1")).toBeVisible();
});
