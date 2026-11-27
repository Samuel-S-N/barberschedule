import { json } from "./customer-helpers";
import { defaultShop, expect, test } from "./fixtures";

// A fixture value typed into the form (not a credential of any real account).
const CHOSEN = "brand-new-1";

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

  test("an invited owner sets the password and goes straight to the setup checklist: no 'Em breve', no login form, no second sign-in", async ({ page }) => {
    const ownerId = "55555555-5555-4555-8555-555555555555";
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64").replace(/=+$/, "");
    const token = `${header}.${Buffer.from(JSON.stringify({ exp: now + 3600, sub: ownerId })).toString("base64")}.`;
    let updated: Record<string, unknown> | null = null;
    let signedOut = false;
    let passwordSignIns = 0;

    await page.route("**/auth/v1/user", async (route) => {
      if (route.request().method() === "PUT") updated = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, { app_metadata: {}, aud: "authenticated", created_at: "2026-11-26T10:00:00Z", email: "owner@example.test", id: ownerId, user_metadata: {} });
    });
    await page.route("**/auth/v1/logout**", async (route) => {
      signedOut = true;
      await route.fulfill({ status: 204 });
    });
    await page.route("**/auth/v1/token?grant_type=password", async (route) => {
      passwordSignIns += 1;
      await route.abort();
    });
    await page.route("**/rest/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", role: "owner", user_id: ownerId }]);
      if (path.endsWith("/rpc/shop_setup_status")) return json(route, { completed: false, missing: ["agreement", "details", "hours", "services", "team"], professionals: [] });
      if (route.request().method() === "GET") return json(route, []);
      await route.abort();
    });

    await page.goto(`/reset-password#access_token=${token}&refresh_token=e2e-invite&token_type=bearer&expires_in=3600&type=invite`);
    await expect(page.getByRole("heading", { name: "Crie sua senha" })).toBeVisible();
    await page.getByTestId("reset-new").fill(CHOSEN);
    await page.getByTestId("reset-confirm").fill(CHOSEN);
    await page.getByTestId("reset-submit").click();

    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByRole("heading", { name: "Vamos abrir seu estabelecimento" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Em breve" })).toHaveCount(0);
    await expect(page.getByTestId("login-email")).toHaveCount(0);
    expect(updated).toMatchObject({ password: CHOSEN });
    expect(signedOut).toBe(false);
    expect(passwordSignIns).toBe(0);
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
