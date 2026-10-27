import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";

async function signIn(page: Page, userId: string) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
}

const profile = { avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId };
const summary = {
  balance_cents: 7000, day_1: 1, day_2: null, next_due_date: "2026-11-02", past_unmarked_count: 3,
  payouts: [{ amount_cents: 3000, id: "p1", note: null, paid_on: "2026-10-20" }], schedule: "weekly", tracking_start: "2026-10-01",
};

async function mockBarberRest(page: Page, payoutSummary: unknown) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Barber", role: "barber", user_id: barberUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) return json(route, [profile]);
    if (path.endsWith("/rpc/get_my_payout_summary")) return json(route, payoutSummary);
    await route.abort();
  });
}

test("the barber sees what is left to receive, the next date and the payouts received", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, summary);
  await page.goto("/my-profile/compensation");

  await expect(page.getByTestId("my-payout-balance")).toContainText("R$ 70,00");
  await expect(page.getByTestId("my-payout-next")).toContainText("02/11");
  await expect(page.getByTestId("my-payout-unmarked")).toContainText("3");
  await expect(page.getByTestId("my-payout-row-p1")).toContainText("R$ 30,00");
});

test("a chair-rental barber sees no payout section", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, null);
  await page.goto("/my-profile/compensation");

  await expect(page.getByTestId("my-payout-balance")).toHaveCount(0);
});
