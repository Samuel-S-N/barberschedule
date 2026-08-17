import { expect, test } from "@playwright/test";

test("redirects anonymous visitors to sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Use the same Barberschedule account on Web, iOS, or Android.")).toBeVisible();
});
