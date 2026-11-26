import type { Page } from "@playwright/test";

import { customerUserId, json, mockCustomerRest, professionalId, shopId, signInAsCustomer } from "./customer-helpers";
import { expect, test } from "./fixtures";

test.use({ locale: "pt-BR" });

test("the customer turns the 24 h reminder e-mail off from Settings", async ({ page }) => {
  const state = { calls: [] as unknown[], emailReminders: true };

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_current_profile")) {
      await json(route, [{ email_reminders: state.emailReminders, full_name: "Browser Customer", role: "customer", user_id: customerUserId }]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/set_email_reminders")) {
      const body = route.request().postDataJSON() as { p_enabled: boolean };

      state.calls.push(body);
      state.emailReminders = body.p_enabled;
      await json(route, null);
      return true;
    }
  });

  await page.goto("/me/settings");
  await expect(page.getByText("Lembretes por e-mail")).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Lembretes por e-mail" });

  await expect(toggle).toBeChecked();
  await toggle.click();

  await expect.poll(() => state.calls).toEqual([{ p_enabled: false }]);
  await expect(toggle).not.toBeChecked();
});

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

for (const [role, id, path] of [["owner", "55555555-5555-4555-8555-555555555555", "/owner-profile/settings"], ["professional", "66666666-6666-4666-8666-666666666666", "/my-profile/settings"]] as const) {
  test(`the ${role}'s Settings has no e-mail reminders switch`, async ({ page }) => {
    await signInAs(page, id);
    await page.route("**/rest/v1/**", async (route) => {
      const route_path = new URL(route.request().url()).pathname;

      if (route_path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Staff", role, user_id: id }]);
      if (route_path.endsWith("/rpc/get_my_professional_profile")) {
        return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: professionalId, name: "Staff", shop_id: shopId }]);
      }
      await route.abort();
    });

    await page.goto(path);
    await expect(page.getByTestId("profile-signout")).toBeVisible();
    await expect(page.getByTestId("email-reminders-switch")).toHaveCount(0);
  });
}
