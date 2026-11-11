import { expect, test } from "@playwright/test";

test("the default palette is amber and a CSS variable on <html> repaints the sign-in button", async ({ page }) => {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "Sign in" });

  await expect(submit).toBeVisible();
  const background = () => submit.evaluate((node) => getComputedStyle(node).backgroundColor);

  // Button still uses the primary token in this task; the accent token takes over in the action-colour task.
  await expect.poll(background).toBe("rgb(219, 154, 52)");

  await page.evaluate(() => document.documentElement.style.setProperty("--c-primary-400", "47 111 219"));

  await expect.poll(background).toBe("rgb(47, 111, 219)");
});
