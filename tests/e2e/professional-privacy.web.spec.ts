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

test("a professional reaches the privacy screen from the profile hub", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile");
  await page.getByTestId("menu-privacy").click();

  await expect(page).toHaveURL(/\/my-profile\/privacy/);
  await expect(page.getByTestId("profile-export")).toBeVisible();
  await page.getByTestId("privacy-terms").click();
  await expect(page).toHaveURL(/\/legal/);
});
