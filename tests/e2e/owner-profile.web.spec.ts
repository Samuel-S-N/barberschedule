import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";
import { stubInstallPrompt } from "./install-helpers";
import { HUB_ORDER, hubOrder } from "./profile-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";
const myProfessionalId = "99999999-9999-4999-8999-999999999999";

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

type OwnerState = {
  active?: boolean;
  calls: Record<string, unknown>;
  linked: boolean;
  periods?: Array<Record<string, unknown>>;
  posted?: Array<Record<string, unknown>>;
  services?: Array<Record<string, unknown>>;
  shopHours?: Array<Record<string, unknown>>;
};

async function mockOwnerRest(page: Page, state: OwnerState) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", nickname: "Liv", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_owner_professionals")) {
      return json(route, state.linked ? [{ active: state.active ?? true, archived_at: null, commission_percent: "0.00", compensation_type: "commission", id: myProfessionalId, name: "Liv", shop_id: shop, user_id: ownerId }] : []);
    }
    if (path.endsWith("/rpc/get_professional_account_status")) return json(route, true);
    if (path.endsWith("/rpc/update_my_staff_profile")) {
      state.calls.profile = route.request().postDataJSON();

      return json(route, null);
    }
    if (path.endsWith("/professionals") && method === "POST") {
      state.calls.create = route.request().postDataJSON();
      state.linked = true;

      return json(route, { active: true, archived_at: null, id: myProfessionalId, name: "Liv", shop_id: shop });
    }
    if (path.endsWith("/professionals") && method === "PATCH") {
      state.calls.patch = route.request().postDataJSON();
      state.active = (state.calls.patch as { active?: boolean }).active;

      return json(route, { active: state.active, archived_at: state.active ? null : "2026-10-01T00:00:00Z", id: myProfessionalId, name: "Liv", shop_id: shop });
    }
    if (path.endsWith("/shop_hours")) return json(route, state.shopHours ?? []);
    if (path.endsWith("/professional_services")) return json(route, state.services ?? []);
    if (path.endsWith("/schedule_overrides")) return json(route, []);
    if (path.endsWith("/rpc/list_shop_lunch_breaks")) return json(route, []);
    if (path.endsWith("/working_periods") && method === "GET") return json(route, state.periods ?? []);
    if (path.endsWith("/working_periods") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const row = { id: `wp-${(state.posted ?? []).length + 1}`, ...body };

      (state.posted ??= []).push(body);
      (state.periods ??= []).push(row);

      return json(route, row);
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
  await expect(page.getByTestId("profile-signout")).toHaveCount(0);

  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/owner-profile\/settings/);
  await expect(page.getByTestId("profile-signout")).toBeVisible();
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

test("Serve as a professional creates a professional linked to the owner and opens its profile; turning it off deactivates", async ({ page }) => {
  const state = { calls: {} as Record<string, unknown>, linked: false };

  await signInAsOwner(page);
  await mockOwnerRest(page, state);

  await page.goto("/settings");
  await page.getByTestId("owner-as-professional").click();
  await expect.poll(() => state.calls.create).toMatchObject({ name: "Liv", shop_id: shop, user_id: ownerId });

  await page.getByTestId("menu-my-professional").click();
  await expect(page).toHaveURL(new RegExp(`/professional-profile\\?id=${myProfessionalId}`));
  await page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();
  // Fixed parent: a professional profile always goes back to the professional list, even when opened from the owner's account.
  await expect(page).toHaveURL(/\/professionals/);
  await page.goto("/settings");
  // Wait for the professional row to load: toggling before it arrives would try to create another one.
  await expect(page.getByTestId("menu-my-professional")).toBeVisible();

  await page.getByTestId("owner-as-professional").click();
  await expect.poll(() => (state.calls.patch as { active?: boolean } | undefined)?.active).toBe(false);
});

test("the owner account hub shows the install card", async ({ page }) => {
  await stubInstallPrompt(page);
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, linked: false });

  await page.goto("/settings");
  await expect(page.getByTestId("install-card")).toBeVisible();
});

test("the owner signs out from Settings", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, linked: false });
  const loggedOut = page.waitForRequest((request) => request.url().includes("/auth/v1/logout"));
  await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204 }));

  await page.goto("/owner-profile/settings");
  await page.getByTestId("profile-signout").click();

  await loggedOut;
  await expect(page).toHaveURL(/\/login/);
});

test("the owner hub lists the shared blocks in the common order", async ({ page }) => {
  await stubInstallPrompt(page);
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, linked: false });

  await page.goto("/settings");
  await expect(page.getByTestId("profile-avatar")).toBeVisible();

  expect(await hubOrder(page)).toEqual(HUB_ORDER);
});

const hours = (weekday: number) => ({ end_time: "18:00:00", start_time: "09:00:00", weekday });
const period = { end_time: "18:00:00", id: "wp-existing", professional_id: myProfessionalId, shop_id: shop, start_time: "09:00:00", weekday: 1 };
const service = { active: true, archived_at: null, duration_override_minutes: null, id: "ps-1", price_override_cents: null, professional_id: myProfessionalId, service_id: "sv-1", shop_id: shop };

test.describe("serving as a professional copies the shop hours once and guides when something is missing", () => {
  test("turning it on with no hours copies the shop hours (no hours guide afterwards)", async ({ page }) => {
    const state: OwnerState = { calls: {}, linked: false, shopHours: [hours(1), hours(2)] };

    await signInAsOwner(page);
    await mockOwnerRest(page, state);
    await page.goto("/settings");
    await page.getByTestId("owner-as-professional").click();

    await expect.poll(() => state.posted?.length).toBe(2);
    expect(state.posted).toEqual([
      { end_time: "18:00", professional_id: myProfessionalId, shop_id: shop, start_time: "09:00", weekday: 1 },
      { end_time: "18:00", professional_id: myProfessionalId, shop_id: shop, start_time: "09:00", weekday: 2 },
    ]);
    await expect(page.getByText("We copied the shop hours for you.")).toBeVisible();
    await expect(page.getByTestId("owner-guide-hours")).toHaveCount(0);
  });

  test("turning it off and on again never copies a second time", async ({ page }) => {
    const state: OwnerState = { calls: {}, linked: false, shopHours: [hours(1)] };

    await signInAsOwner(page);
    await mockOwnerRest(page, state);
    await page.goto("/settings");
    await page.getByTestId("owner-as-professional").click();
    await expect.poll(() => state.posted?.length).toBe(1);
    await expect(page.getByTestId("menu-my-professional")).toBeVisible();

    await page.getByTestId("owner-as-professional").click();
    await expect.poll(() => state.active).toBe(false);
    // The switch is disabled while the previous change settles: a click before that is ignored (flaky under load).
    await expect(page.getByTestId("owner-as-professional").locator("input")).toBeEnabled();
    await page.getByTestId("owner-as-professional").click();
    await expect.poll(() => state.active).toBe(true);
    await page.waitForTimeout(500);

    expect(state.posted).toHaveLength(1);
  });

  test("a professional that already has hours is never touched", async ({ page }) => {
    const state: OwnerState = { active: false, calls: {}, linked: true, periods: [period], shopHours: [hours(1), hours(2)] };

    await signInAsOwner(page);
    await mockOwnerRest(page, state);
    await page.goto("/settings");
    await page.getByTestId("owner-as-professional").click();
    await expect.poll(() => state.active).toBe(true);
    await page.waitForTimeout(500);

    expect(state.posted ?? []).toHaveLength(0);
  });

  test("with no shop hours nothing is copied and the guide sends the owner to Manage schedule with their professional selected", async ({ page }) => {
    const state: OwnerState = { calls: {}, linked: false, services: [service] };

    await signInAsOwner(page);
    await mockOwnerRest(page, state);
    await page.goto("/settings");
    await page.getByTestId("owner-as-professional").click();

    await expect(page.getByTestId("owner-guide-hours")).toBeVisible();
    await expect(page.getByText("Add your working hours to appear in booking.")).toBeVisible();
    expect(state.posted ?? []).toHaveLength(0);

    await page.getByTestId("guide-hours-action").click();
    await expect(page).toHaveURL(new RegExp(`/schedule\\?professional=${myProfessionalId}`));
    await expect(page.getByTestId(`schedule-professional-${myProfessionalId}`)).toContainText("selected");
  });

  test("hours but no services shows only the services guide", async ({ page }) => {
    const state: OwnerState = { calls: {}, linked: true, periods: [period] };

    await signInAsOwner(page);
    await mockOwnerRest(page, state);
    await page.goto("/settings");

    await expect(page.getByTestId("owner-guide-services")).toBeVisible();
    await expect(page.getByTestId("owner-guide-hours")).toHaveCount(0);
  });

  test("hours and services: no guide; switch off: no guide", async ({ page }) => {
    const state: OwnerState = { calls: {}, linked: true, periods: [period], services: [service] };

    await signInAsOwner(page);
    await mockOwnerRest(page, state);
    await page.goto("/settings");
    await expect(page.getByTestId("menu-my-professional")).toBeVisible();
    await expect(page.getByTestId("owner-guide-hours")).toHaveCount(0);
    await expect(page.getByTestId("owner-guide-services")).toHaveCount(0);

    await page.getByTestId("owner-as-professional").click();
    await expect.poll(() => state.active).toBe(false);
    await expect(page.getByTestId("owner-guide-hours")).toHaveCount(0);
  });
});
