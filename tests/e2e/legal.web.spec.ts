import { expect, test } from "./fixtures";

test.describe("public legal documents", () => {
  for (const [path, heading] of [["/privacidade", "Política de Privacidade"], ["/termos", "Termos de Uso"], ["/contrato", "Contrato do Estabelecimento"]] as const) {
    test(`${path} opens without login`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await expect(page.getByTestId("legal-section").first()).toBeVisible();
    });
  }

  test("the privacy policy shows the highlight on [RAZÃO SOCIAL]", async ({ page }) => {
    await page.goto("/privacidade");
    await expect(page.getByTestId("legal-placeholder").first()).toHaveText("[RAZÃO SOCIAL]");
  });

  test("/legal redirects to the privacy policy", async ({ page }) => {
    await page.goto("/legal");
    await expect(page).toHaveURL(/\/privacidade/);
  });

  test.describe("English device", () => {
    test.use({ locale: "en-GB" });

    test("shows the Portuguese text with a translated note", async ({ page }) => {
      await page.goto("/termos");
      await expect(page.getByText("This document is in Portuguese")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Termos de Uso", level: 1 })).toBeVisible();
    });
  });

  test("signup links to the policy and the terms", async ({ page }) => {
    await page.goto("/signup");
    await page.getByTestId("signup-read-privacy").click();
    await expect(page).toHaveURL(/\/privacidade/);
    await page.goBack();
    await page.getByTestId("signup-read-terms").click();
    await expect(page).toHaveURL(/\/termos/);
    await expect(page.getByRole("heading", { name: "Termos de Uso", level: 1 })).toBeVisible();
  });
});
