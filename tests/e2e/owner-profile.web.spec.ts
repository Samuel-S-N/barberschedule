import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";
const myBarberId = "99999999-9999-4999-8999-999999999999";

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id }, });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

async function mockOwnerRest(page: Page, state: { calls: Record<string, unknown>; linked: boolean }) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", nickname: "Liv", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_owner_barbers")) {
      return json(route, state.linked ? [{ active: true, archived_at: null, commission_percent: "0.00", compensation_type: "commission", id: myBarberId, name: "Liv", shop_id: shop, user_id: ownerId }] : []);
    }
    if (path.endsWith("/rpc/get_barber_account_status")) return json(route, true);
    if (path.endsWith("/rpc/update_my_staff_profile")) {
      state.calls.profile = route.request().postDataJSON();

      return json(route, null);
    }
    if (path.endsWith("/barbers") && method === "POST") {
      state.calls.create = route.request().postDataJSON();
      state.linked = true;

      return json(route, { active: true, archived_at: null, id: myBarberId, name: "Liv", shop_id: shop });
    }
    if (path.endsWith("/barbers") && method === "PATCH") {
      state.calls.patch = route.request().postDataJSON();

      return json(route, { active: false, archived_at: "2026-10-01T00:00:00Z", id: myBarberId, name: "Liv", shop_id: shop });
    }
    await route.abort();
  });
}

test("the owner account tab is a profile hub with the same sections as the other roles", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, linked: false });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Liv" })).toBeVisible();
  for (const key of ["account", "security", "privacy", "settings", "about"]) {
    await expect(page.getByTestId(`menu-${key}`)).toBeVisible();
  }
  await expect(page.getByTestId("profile-signout")).toBeVisible();

  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/owner-profile\/settings/);
  await page.getByTestId("menu-language").click();
  await expect(page).toHaveURL(/\/language/);
});

test("My data edits name and nickname with the save button at the end of the page", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, { calls, linked: false });

  await page.goto("/owner-profile/account");
  await expect(page.getByTestId("owner-full-name")).toHaveValue("Olivia Owner");
  await expect(page.getByTestId("owner-nickname")).toHaveValue("Liv");
  await page.getByTestId("owner-full-name").fill("Olivia O. Owner");
  await page.getByTestId("account-change-email").click();

  const save = await page.getByTestId("owner-save").boundingBox();
  const sendLink = await page.getByTestId("account-send-link").boundingBox();
  expect(save && sendLink && save.y > sendLink.y).toBe(true);

  await page.getByTestId("owner-save").click();
  await expect.poll(() => calls.profile).toEqual({ p_full_name: "Olivia O. Owner", p_nickname: "Liv" });
});

test("security opens the password screen and privacy explains the owner account", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, linked: false });

  await page.goto("/owner-profile/security");
  await page.getByTestId("menu-password").click();
  await expect(page).toHaveURL(/\/owner-profile\/security\/password/);

  await page.goto("/owner-profile/privacy");
  await expect(page.getByTestId("owner-privacy-note")).toContainText("cannot be deleted from the app");
});

test("Serve as a barber creates a barber linked to the owner and opens its profile; turning it off deactivates", async ({ page }) => {
  const state = { calls: {} as Record<string, unknown>, linked: false };

  await signInAsOwner(page);
  await mockOwnerRest(page, state);

  await page.goto("/settings");
  await page.getByTestId("owner-as-barber").click();
  await expect.poll(() => state.calls.create).toMatchObject({ name: "Liv", shop_id: shop, user_id: ownerId });

  await page.getByTestId("menu-my-barber").click();
  await expect(page).toHaveURL(new RegExp(`/barber-profile\\?id=${myBarberId}`));
  await page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();
  // Fixed parent: a barber profile always goes back to the barber list, even when opened from the owner's account.
  await expect(page).toHaveURL(/\/barbers/);
  await page.goto("/settings");

  await page.getByTestId("owner-as-barber").click();
  await expect.poll(() => (state.calls.patch as { active?: boolean } | undefined)?.active).toBe(false);
});
