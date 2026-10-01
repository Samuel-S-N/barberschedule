import { expect, test } from "@playwright/test";

import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

test("the profile tab is a hub of blocks that open each inner screen", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/profile");
  await expect(page.getByTestId("profile-avatar")).toBeVisible();
  await expect(page.getByText("Browser Customer")).toBeVisible();

  for (const [key, url, heading] of [
    ["account", /\/me\/account$/, "My data"],
    ["security", /\/me\/security$/, "Security"],
    ["settings", /\/me\/settings$/, "Settings"],
    ["privacy", /\/me\/privacy$/, "Privacy and data"],
    ["about", /\/me\/about$/, "About"],
  ] as const) {
    await page.getByTestId(`menu-${key}`).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.getByTestId("back").click();
    await expect(page).toHaveURL(/\/profile$/);
  }

  await expect(page.getByTestId("profile-signout")).toBeVisible();
});

test("the account screen shows the login e-mail and reveals the change-e-mail form", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/account");
  await expect(page.getByTestId("account-email")).toHaveText("customer@example.com");
  await page.getByTestId("account-change-email").click();
  await expect(page.getByTestId("account-send-link")).toBeDisabled();
  await page.getByTestId("account-new-email").fill("new@example.com");
  await expect(page.getByTestId("account-send-link")).toBeEnabled();
});

test("security is a menu that opens the dedicated password screen", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByTestId("security-current")).toHaveCount(0);
  await page.getByTestId("menu-password").click();
  await expect(page).toHaveURL(/\/me\/security\/password$/);
  await expect(page.getByRole("heading", { name: "Password" })).toBeVisible();
  await expect(page.getByTestId("security-current")).toBeVisible();
  // The Security menu stays mounted under the Password screen, so the top screen's back button is the last one.
  await page.getByTestId("back").last().click();
  await expect(page).toHaveURL(/\/me\/security$/);
});

test("the security screen only enables the button for a valid new password", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/security/password");
  await page.getByTestId("security-current").fill("old-password-1");
  await page.getByTestId("security-next").fill("new-password-1");
  await page.getByTestId("security-confirm").fill("different-1");
  await expect(page.getByTestId("security-submit")).toBeDisabled();
  await page.getByTestId("security-confirm").fill("new-password-1");
  await expect(page.getByTestId("security-submit")).toBeEnabled();
});

const authUser = {
  app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z", email: "customer@example.com",
  id: "55555555-5555-4555-8555-555555555555", user_metadata: {},
};

test("a wrong current password is reported and nothing is changed", async ({ page }) => {
  let updated = false;

  await signInAsCustomer(page);
  await mockCustomerRest(page);
  await page.route("**/auth/v1/token**", (route) =>
    json(route, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400));
  await page.route("**/auth/v1/user", (route) => {
    updated = true;
    return json(route, authUser);
  });

  await page.goto("/me/security/password");
  await page.getByTestId("security-current").fill("wrong-password-1");
  await page.getByTestId("security-next").fill("new-password-1");
  await page.getByTestId("security-confirm").fill("new-password-1");
  await page.getByTestId("security-submit").click();

  await expect(page.getByText("The current password is incorrect.")).toBeVisible();
  expect(updated).toBe(false);
});

test("a correct current password changes the password", async ({ page }) => {
  let payload: Record<string, unknown> | null = null;

  await signInAsCustomer(page);
  await mockCustomerRest(page);
  await page.route("**/auth/v1/token**", (route) =>
    json(route, { access_token: "e2e-check-token", expires_in: 3600, refresh_token: "e2e-check-refresh", token_type: "bearer", user: authUser }));
  await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204 }));
  await page.route("**/auth/v1/user", (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, authUser);
  });

  await page.goto("/me/security/password");
  await page.getByTestId("security-current").fill("old-password-1");
  await page.getByTestId("security-next").fill("new-password-1");
  await page.getByTestId("security-confirm").fill("new-password-1");
  await page.getByTestId("security-submit").click();

  await expect(page.getByText("Password changed.")).toBeVisible();
  expect(payload).toMatchObject({ password: "new-password-1" });
});

test("changing the e-mail asks for confirmation through a link", async ({ page }) => {
  let payload: Record<string, unknown> | null = null;

  await signInAsCustomer(page);
  await mockCustomerRest(page);
  await page.route("**/auth/v1/user", (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { ...authUser, new_email: "new@example.com" });
  });

  await page.goto("/me/account");
  await page.getByTestId("account-change-email").click();
  await page.getByTestId("account-new-email").fill("new@example.com");
  await page.getByTestId("account-send-link").click();

  await expect(page.getByText(/We sent a confirmation link to new@example\.com/)).toBeVisible();
  expect(payload).toMatchObject({ email: "new@example.com" });
});

test("the language is chosen in Settings > Language and only applied after confirming", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByTestId("language-options")).toHaveCount(0);

  await page.getByTestId("menu-language").click();
  await expect(page).toHaveURL(/\/me\/language$/);
  await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  await expect(page.getByTestId("option-device")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("language-confirm")).toBeDisabled();

  await page.getByTestId("option-es").click();
  await expect(page.getByTestId("option-es")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  await expect(page.getByTestId("language-confirm")).toBeEnabled();

  await page.getByTestId("language-confirm").click();
  await expect(page).toHaveURL(/\/me\/settings$/);
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  await page.getByTestId("menu-language").click();
  await expect(page.getByTestId("option-es")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("option-device").click();
  await page.getByTestId("language-confirm").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("leaving the language screen without confirming keeps the language", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/settings");
  await page.getByTestId("menu-language").click();
  await page.getByTestId("option-pt").click();
  // The Settings screen stays mounted under this one in the Stack, so take the back button of the top screen.
  await page.getByTestId("back").last().click();

  await expect(page).toHaveURL(/\/me\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByTestId("menu-language").click();
  await expect(page.getByTestId("option-device")).toHaveAttribute("aria-checked", "true");
});
