import { expect, test } from "@playwright/test";

test.describe("Portuguese device", () => {
  test.use({ locale: "pt-BR" });

  test("auth screens follow the device language", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Esqueci minha senha" })).toBeVisible();

    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await page.getByTestId("signup-name").fill("Ana Silva");
    await page.getByTestId("signup-email").fill("ana@example.test");
    await page.getByTestId("signup-password").fill("correct-password");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("Aceite os termos e a política de privacidade para continuar.")).toBeVisible();
  });

  test("the legal page is in Portuguese", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.getByRole("heading", { name: "Termos e privacidade" })).toBeVisible();
    await expect(page.getByText("Seus direitos (LGPD)")).toBeVisible();
  });
});

test.describe("Spanish device", () => {
  test.use({ locale: "es-ES" });

  test("auth screens follow the device language", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByRole("button", { name: "¿Olvidaste tu contraseña?" })).toBeVisible();
  });
});

test.describe("Unsupported device language", () => {
  test.use({ locale: "fr-FR" });

  test("falls back to English", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
