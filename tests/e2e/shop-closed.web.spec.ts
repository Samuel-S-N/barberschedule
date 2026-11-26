import { json } from "./customer-helpers";
import { defaultShop, expect, test } from "./fixtures";

test.describe("closed shop", () => {
  test.use({ locale: "pt-BR", shop: { ...defaultShop, name: "Studio Aurora", setup_completed_at: null } });

  test("a visitor sees 'Em breve' with no login, and can still read the legal documents", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Em breve" })).toBeVisible();
    await expect(page.getByText("Studio Aurora está preparando a agenda.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Criar conta" })).toHaveCount(0);

    await page.getByRole("button", { name: "Política de Privacidade" }).click();
    await expect(page).toHaveURL(/\/privacidade/);
    await expect(page.getByRole("heading", { name: "Política de Privacidade", level: 1 })).toBeVisible();
  });
});

test.describe("closed shop: the staff can still sign in", () => {
  test.use({ locale: "pt-BR", shop: { ...defaultShop, name: "Studio Aurora", setup_completed_at: null } });

  test("a signed-out owner taps 'Sou da equipe, entrar', signs in and lands on the setup checklist; there is no create-account link", async ({ page }) => {
    const ownerId = "55555555-5555-4555-8555-555555555555";

    await page.route("**/auth/v1/token?grant_type=password", async (route) => {
      await json(route, { access_token: "owner-access-token", expires_in: 3600, refresh_token: "owner-refresh-token", token_type: "bearer", user: { id: ownerId } });
    });
    await page.route("**/rest/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", role: "owner", user_id: ownerId }]);
      if (path.endsWith("/rpc/shop_setup_status")) return json(route, { completed: false, missing: ["agreement", "details", "hours", "services", "team"], professionals: [] });
      if (route.request().method() === "GET") return json(route, []);
      await route.abort();
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Sou da equipe, entrar" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Criar conta" })).toHaveCount(0);
    await page.getByLabel("E-mail", { exact: true }).fill("owner@example.test");
    await page.getByLabel("Senha", { exact: true }).fill("correct-password");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByRole("heading", { name: "Vamos abrir seu estabelecimento" })).toBeVisible();
  });

  test("the reset-password landing (an invited owner's e-mail link) stays reachable", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Em breve" })).toHaveCount(0);
  });

  test("an ordinary visitor who is sent to the login still sees the closed page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Em breve" })).toBeVisible();
  });

  test("create account stays blocked", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Em breve" })).toBeVisible();
  });
});

test.describe("open shop", () => {
  test("the default fixture shop is open", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Sign in|Entrar/ })).toBeVisible();
  });
});
