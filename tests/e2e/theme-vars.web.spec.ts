import { expect, test } from "@playwright/test";

test("the default palette is amber and a CSS variable on <html> repaints the sign-in button", async ({ page }) => {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "Sign in" });

  await expect(submit).toBeVisible();
  const background = () => submit.evaluate((node) => getComputedStyle(node).backgroundColor);

  // The primary Button is filled with the accent token.
  await expect.poll(background).toBe("rgb(219, 154, 52)");

  await page.evaluate(() => document.documentElement.style.setProperty("--c-accent", "47 111 219"));

  await expect.poll(background).toBe("rgb(47, 111, 219)");
});
