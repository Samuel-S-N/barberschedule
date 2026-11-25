import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

import { json, professionalId, shopId } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const professionalUserId = "66666666-6666-4666-8666-666666666666";

async function signInAs(page: Page, id: string) {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: id });
}

async function mockRest(page: Page, role: "owner" | "professional") {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser User", role, user_id: role === "owner" ? ownerId : professionalUserId }]);
    if (path.endsWith("/rpc/get_my_professional_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: professionalId, name: "Browser Professional", shop_id: shopId }]);
    }
    if (path.endsWith("/rpc/get_shop_report") || path.endsWith("/rpc/list_rent_payments") || path.endsWith("/rpc/list_owner_agenda") || path.endsWith("/rpc/list_my_professional_agenda")) return json(route, []);
    await route.abort();
  });
}

test.describe("owner", () => {
  test("opens the link and QR screen from Manage and copies the link", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __copied: string[] }).__copied = [];
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { __copied: string[] }).__copied.push(text); } } });
    });
    await signInAs(page, ownerId);
    await mockRest(page, "owner");
    await page.goto("/manage");

    await page.getByTestId("menu-shop-link").click();
    await expect(page).toHaveURL(/\/shop-link/);
    await expect(page.getByTestId("shop-link-url")).toContainText("shop-a");
    await expect(page.getByTestId("shop-link-qr")).toBeVisible();

    await page.getByTestId("shop-link-copy").click();
    await expect(page.getByText("Link copiado").or(page.getByText("Link copied"))).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([expect.stringContaining("shop-a")]);
  });
});

test.describe("professional", () => {
  test("opens the same link from the profile hub", async ({ page }) => {
    await signInAs(page, professionalUserId);
    await mockRest(page, "professional");
    await page.goto("/my-profile");

    await page.getByTestId("menu-shop-link").click();
    await expect(page).toHaveURL(/\/my-profile\/shop-link/);
    await expect(page.getByTestId("shop-link-url")).toContainText("shop-a");
    await expect(page.getByTestId("shop-link-qr")).toBeVisible();
  });
});
