import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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

async function mockOwnerRest(page: Page) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ full_name: "Olivia Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) return json({ barbers: [], days: [], services: [] });
    if (path.endsWith("/rpc/list_rent_payments")) return json([]);
    if (path.endsWith("/rpc/list_owner_agenda")) return json([]);
    await route.abort();
  });
}

test("the owner lands on the agenda with a tab bar and reaches every area from Manage", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/agenda/);
  for (const key of ["agenda", "revenue", "manage", "settings"]) {
    await expect(page.getByTestId(`tab-${key}`)).toBeVisible();
  }

  await page.getByTestId("tab-manage").click();
  await expect(page).toHaveURL(/\/manage/);
  for (const key of ["barbers", "services", "customers", "monthly-customers", "schedule", "shop", "recurrence-conflicts"]) {
    await expect(page.getByTestId(`menu-${key}`)).toBeVisible();
  }
  await page.getByTestId("menu-services").click();
  await expect(page).toHaveURL(/\/services/);
  // A screen reached from Manage keeps Manage highlighted in the tab bar.
  await expect(page.getByTestId("tab-manage")).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("tab-revenue").click();
  await expect(page).toHaveURL(/\/revenue/);
});

test("the owner account tab shows who is signed in and can open the language screen", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Olivia Owner" })).toBeVisible();
  await expect(page.getByTestId("profile-signout")).toBeVisible();
  await page.getByTestId("menu-language").click();
  await expect(page).toHaveURL(/\/language/);
});
