import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { professionalId, json, shopId } from "./customer-helpers";
import type { RestHandler } from "./customer-helpers";

const professionalUserId = "66666666-6666-4666-8666-666666666666";

async function signIn(page: Page, userId: string) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
}

const professionalProfile = {
  avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null,
  commission_percent: "40.00", compensation_type: "commission", id: professionalId, name: "Browser Professional", shop_id: shopId,
};

async function mockProfessionalRest(page: Page, handler?: RestHandler) {
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (handler && (await handler(route, url)) === true) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Professional", role: "professional", user_id: professionalUserId }]);
    if (path.endsWith("/rpc/get_my_professional_profile")) return json(route, [professionalProfile]);
    if (path.endsWith("/rpc/list_my_professional_services")) {
      return json(route, [{ active: true, professional_service_id: "bs1", duration_minutes: 30, price_cents: 4000, service_id: "s1", service_name: "Browser Cut" }]);
    }
    if (path.endsWith("/rpc/list_my_professional_agenda")) return json(route, []);
    if (path.endsWith("/schedule_overrides") && route.request().method() === "GET") return json(route, []);
    await route.abort();
  });
}

test("the professional profile is a hub with professional and account sections", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile");
  await expect(page.getByRole("heading", { name: "Browser Professional" })).toBeVisible();
  for (const key of ["account", "security", "services", "availability", "compensation", "privacy", "settings", "about"]) {
    await expect(page.getByTestId(`menu-${key}`)).toBeVisible();
  }

  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/my-profile\/settings/);
  await page.getByTestId("menu-language").click();
  await expect(page).toHaveURL(/\/my-profile\/language/);
});

test("a professional edits their bio from My details and the name is read-only", async ({ page }) => {
  let profilePayload: Record<string, unknown> | null = null;

  await signIn(page, professionalUserId);
  await mockProfessionalRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/update_my_professional_profile")) {
      profilePayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [{ avatar_url: null, bio: "New bio", id: professionalId }]).then(() => true);
    }
  });

  await page.goto("/my-profile/account");
  await expect(page.getByTestId("professional-name")).toHaveText("Browser Professional");
  await page.getByTestId("professional-bio").fill("New bio");
  await page.getByTestId("professional-save").click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(profilePayload).toEqual({ new_avatar_url: null, new_bio: "New bio" });
});

test("a professional turns an optional service on; the standard one is locked", async ({ page }) => {
  let togglePayload: Record<string, unknown> | null = null;
  const options = [
    { description: null, duration_minutes: 30, enabled: true, is_standard: true, price_cents: 4000, service_id: "s1", service_name: "Cut" },
    { description: null, duration_minutes: 20, enabled: false, is_standard: false, price_cents: 2500, service_id: "s2", service_name: "Beard" },
  ];

  await signIn(page, professionalUserId);
  await mockProfessionalRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_service_options")) return json(route, options).then(() => true);
    if (url.pathname.endsWith("/rpc/set_my_service_enabled")) {
      togglePayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, [{ enabled: true, service_id: "s2" }]).then(() => true);
    }
  });

  await page.goto("/my-profile/services");
  await expect(page.getByTestId("service-standard-s1")).toBeVisible();
  await expect(page.getByTestId("service-switch-s1")).toHaveCount(0);
  await expect(page.getByText("R$ 25,00")).toBeVisible();

  await page.getByTestId("service-switch-s2").click();
  await expect.poll(() => togglePayload).toEqual({ new_enabled: true, target_service_id: "s2" });
});

test("a professional reads how they are paid, read-only", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile/compensation");
  await expect(page.getByTestId("professional-compensation")).toContainText("Commission: 40% of each completed service.");
  await expect(page.getByText("Set by the shop owner.")).toBeVisible();
});

test("a professional sees their weekly working hours, read-only", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_working_periods")) {
      return json(route, [
        { end_time: "12:00:00", start_time: "09:00:00", weekday: 1 },
        { end_time: "18:00:00", start_time: "14:00:00", weekday: 1 },
        { end_time: "17:00:00", start_time: "09:00:00", weekday: 3 },
      ]).then(() => true);
    }
  });

  await page.goto("/my-profile");
  await page.getByTestId("menu-availability").click();

  await expect(page).toHaveURL(/\/my-profile\/availability/);
  await expect(page.getByTestId("professional-hours-monday")).toContainText("09:00–12:00, 14:00–18:00");
  await expect(page.getByTestId("professional-hours-wednesday")).toContainText("09:00–17:00");
  await expect(page.getByTestId("professional-hours-tuesday")).toContainText("Closed");
  await expect(page.getByTestId("professional-hours-note")).toBeVisible();
});

test("back from a profile sub-screen returns to the profile hub, also after a cold start", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile");
  await page.getByTestId("menu-privacy").click();
  await expect(page).toHaveURL(/\/my-profile\/privacy/);
  await page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();
  await expect(page).toHaveURL(/\/my-profile$/);

  // Cold start (no history): the fallback is the professional's own hub, not the customer's /profile.
  await page.goto("/my-profile/privacy");
  await page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();
  await expect(page).toHaveURL(/\/my-profile$/);
});

test("the save profile button is the last control of My details", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile/account");
  await page.getByTestId("account-change-email").click();
  await expect(page.getByTestId("account-send-link")).toBeVisible();

  const save = await page.getByTestId("professional-save").boundingBox();
  const sendLink = await page.getByTestId("account-send-link").boundingBox();

  expect(save && sendLink && save.y > sendLink.y).toBe(true);
});
