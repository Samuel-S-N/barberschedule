import { expect, test } from "./fixtures";

// The suite is built without EXPO_PUBLIC_APP_ENV (like local development and production): the demo strip of the hosted dev site
// (EXPO_PUBLIC_APP_ENV=dev, see src/components/domain/DemoBanner.tsx) must not appear.
test("the demo banner stays out of builds that are not the dev demo", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
});
