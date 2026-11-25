import { expect, test } from "./fixtures";
import { defaultShop } from "./fixtures";

test.describe("closed shop", () => {
  test.use({ locale: "pt-BR", shop: { ...defaultShop, name: "Studio Aurora", setup_completed_at: null } });

  test("a visitor sees 'Em breve' with no login, and can still read the legal documents", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Em breve" })).toBeVisible();
    await expect(page.getByText("Studio Aurora está preparando a agenda.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toHaveCount(0);

    await page.getByRole("button", { name: "Política de Privacidade" }).click();
    await expect(page).toHaveURL(/\/privacidade/);
    await expect(page.getByRole("heading", { name: "Política de Privacidade", level: 1 })).toBeVisible();
  });
});

test.describe("open shop", () => {
  test("the default fixture shop is open", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Sign in|Entrar/ })).toBeVisible();
  });
});
