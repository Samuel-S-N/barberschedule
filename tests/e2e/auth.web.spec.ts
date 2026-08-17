import { expect, test } from "@playwright/test";

test("a customer can sign in and reach customer links", async ({ page }) => {
  let signInPayload: Record<string, unknown> | null = null;

  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    signInPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      body: JSON.stringify({
        access_token: "customer-access-token",
        expires_in: 3600,
        refresh_token: "customer-refresh-token",
        token_type: "bearer",
        user: { id: "customer-user-1" },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/rest/v1/rpc/get_current_profile", async (route) => {
    await route.fulfill({
      body: JSON.stringify([{ full_name: "Browser Customer", role: "customer", user_id: "customer-user-1" }]),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("customer@example.test");
  await page.getByPlaceholder("Password").fill("correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as customer.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book an appointment" })).toBeVisible();
  expect(signInPayload).toMatchObject({ email: "customer@example.test", password: "correct-password" });
});

test("an owner can sign in and see owner links", async ({ page }) => {
  let signInPayload: Record<string, unknown> | null = null;

  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    signInPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      body: JSON.stringify({
        access_token: "owner-access-token",
        expires_in: 3600,
        refresh_token: "owner-refresh-token",
        token_type: "bearer",
        user: { id: "owner-user-1" },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/rest/v1/rpc/get_current_profile", async (route) => {
    await route.fulfill({
      body: JSON.stringify([{ full_name: "Browser Owner", role: "owner", user_id: "owner-user-1" }]),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("owner@example.test");
  await page.getByPlaceholder("Password").fill("correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as owner.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage agenda" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage schedule" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book an appointment" })).not.toBeVisible();
  expect(signInPayload).toMatchObject({ email: "owner@example.test", password: "correct-password" });
});

test("a visitor can request a password reset", async ({ page }) => {
  await page.route("**/auth/v1/recover", async (route) => {
    await route.fulfill({ body: JSON.stringify({}), contentType: "application/json", status: 200 });
  });

  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await page.getByPlaceholder("Email").fill("customer@example.test");
  await page.getByRole("button", { name: "Send reset email" }).click();
  await expect(page.getByText("Password reset email sent.")).toBeVisible();
});
