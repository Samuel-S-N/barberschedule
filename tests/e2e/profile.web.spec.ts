import { expect, test } from "@playwright/test";

import { mockCustomerRest, signInAsCustomer } from "./customer-helpers";

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

test("the security screen only enables the button for a valid new password", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/security");
  await page.getByTestId("security-current").fill("old-password-1");
  await page.getByTestId("security-next").fill("new-password-1");
  await page.getByTestId("security-confirm").fill("different-1");
  await expect(page.getByTestId("security-submit")).toBeDisabled();
  await page.getByTestId("security-confirm").fill("new-password-1");
  await expect(page.getByTestId("security-submit")).toBeEnabled();
});
