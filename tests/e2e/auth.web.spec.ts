import { expect, test } from "@playwright/test";

import { customerRow, json } from "./customer-helpers";

test("a customer can sign in and land on the home tab", async ({ page }) => {
  let signInPayload: Record<string, unknown> | null = null;

  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    signInPayload = route.request().postDataJSON() as Record<string, unknown>;
    await json(route, {
      access_token: "customer-access-token",
      expires_in: 3600,
      refresh_token: "customer-refresh-token",
      token_type: "bearer",
      user: { id: "customer-user-1" },
    });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Customer", role: "customer", user_id: "customer-user-1" }]);
    if (path.endsWith("/rpc/ensure_my_customer")) return json(route, customerRow({ user_id: "customer-user-1" }));
    if (path.endsWith("/customers")) return json(route, [customerRow({ user_id: "customer-user-1" })]);
    if (path.endsWith("/appointments")) return json(route, []);
    if (path.endsWith("/shops")) return json(route, [{ id: "shop-1", name: "Browser Shop" }]);
    await route.abort();
  });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Hi, Browser" })).toBeVisible();
  await expect(page.getByTestId("tab-book")).toBeVisible();
  expect(signInPayload).toMatchObject({ email: "customer@example.test", password: "correct-password" });
});

test("an owner can sign in and see owner links", async ({ page }) => {
  let signInPayload: Record<string, unknown> | null = null;

  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    signInPayload = route.request().postDataJSON() as Record<string, unknown>;
    await json(route, {
      access_token: "owner-access-token",
      expires_in: 3600,
      refresh_token: "owner-refresh-token",
      token_type: "bearer",
      user: { id: "owner-user-1" },
    });
  });

  await page.route("**/rest/v1/rpc/get_current_profile", async (route) => {
    await json(route, [{ full_name: "Browser Owner", role: "owner", user_id: "owner-user-1" }]);
  });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as owner.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage agenda" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage schedule" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book an appointment" })).not.toBeVisible();
  expect(signInPayload).toMatchObject({ email: "owner@example.test", password: "correct-password" });
});

test("a visitor can request a password reset", async ({ page }) => {
  await page.route("**/auth/v1/recover", async (route) => {
    await json(route, {});
  });

  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page.getByRole("button", { name: "Send reset email" }).click();
  await expect(page.getByText("Password reset email sent.")).toBeVisible();
});

test("a visitor can create an account and is asked to confirm their email", async ({ page }) => {
  let signUpPayload: Record<string, unknown> | null = null;

  await page.route("**/auth/v1/signup", async (route) => {
    signUpPayload = route.request().postDataJSON() as Record<string, unknown>;
    await json(route, {
      app_metadata: {}, aud: "authenticated", created_at: "2026-09-23T10:00:00Z",
      email: "ana@example.test", id: "new-user", user_metadata: {},
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();

  // The login screen stays mounted under signup in the Stack, so target signup's own fields.
  await page.getByTestId("signup-name").fill("Ana Silva");
  await page.getByTestId("signup-email").fill("Ana@Example.test");
  await page.getByTestId("signup-phone").fill("+55 11 90000-0000");
  await page.getByTestId("signup-password").fill("correct-password");
  await page.getByRole("checkbox", { name: "I accept the terms and privacy policy" }).click();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();
  expect(signUpPayload).toMatchObject({
    data: { accepted_terms_version: "2026-09-23", full_name: "Ana Silva", phone: "+55 11 90000-0000" },
    email: "ana@example.test",
    password: "correct-password",
  });
});

test("signup requires accepting the terms and sends nothing otherwise", async ({ page }) => {
  let signUpCalled = false;
  await page.route("**/auth/v1/signup", async (route) => {
    signUpCalled = true;
    await json(route, {});
  });

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Ana Silva");
  await page.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Password", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Accept the terms and privacy policy to continue.")).toBeVisible();
  expect(signUpCalled).toBe(false);
});

test("design-system buttons render their variant styles", async ({ page }) => {
  await page.goto("/login");

  // primary variant = bg-primary-400 (#DB9A34); guards against className not reaching animated components
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCSS("background-color", "rgb(219, 154, 52)");
});

test("the terms and privacy page is reachable while signed out", async ({ page }) => {
  await page.goto("/legal");

  await expect(page.getByRole("heading", { name: "Terms and privacy" })).toBeVisible();
  await expect(page.getByText("Your rights (LGPD)")).toBeVisible();
});
