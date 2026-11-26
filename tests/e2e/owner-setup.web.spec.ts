import { LEGAL_VERSIONS } from "../../src/features/legal";
import { json } from "./customer-helpers";
import { defaultShop, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const ownerId = "55555555-5555-4555-8555-555555555555";
const ALL = ["agreement", "details", "hours", "services", "team"];

test.use({ interceptShops: false, locale: "pt-BR" });

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

// A server-side stand-in for the shop's setup state: the test flips `missing` the way the owner's edits on the existing screens would.
type State = { accepted: unknown[]; completeFails?: boolean; completedAt: string | null; completed: number; missing: string[] };

function mockSetup(page: Page, state: State, onAccept?: () => void) {
  return page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/shops") && (url.searchParams.get("slug") ?? "").startsWith("eq.")) return json(route, [{ ...defaultShop, setup_completed_at: state.completedAt }]);
    if (path.endsWith("/rpc/get_my_shop")) return json(route, [{ shop_id: defaultShop.id, slug: "shop-a" }]);
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/shop_setup_status")) return json(route, { completed: state.completedAt !== null, missing: state.missing, professionals: [] });
    if (path.endsWith("/rpc/accept_legal_documents")) {
      state.accepted.push(route.request().postDataJSON());
      onAccept?.();
      state.missing = state.missing.filter((step) => step !== "agreement");

      return json(route, null);
    }
    if (path.endsWith("/rpc/complete_shop_setup")) {
      state.completed += 1;
      if (state.completeFails) return json(route, { code: "P0045", message: "SHOP_SETUP_INCOMPLETE" }, 400);
      state.completedAt = "2026-11-26T10:00:00Z";

      return json(route, state.completedAt);
    }
    if (route.request().method() === "GET") return json(route, []);
    await route.abort();
  });
}

const fresh = (): State => ({ accepted: [], completedAt: null, completed: 0, missing: [...ALL] });

test("a new owner lands on the checklist instead of the panel", async ({ page }) => {
  await signInAsOwner(page);
  await mockSetup(page, fresh());

  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByRole("heading", { name: "Vamos abrir seu estabelecimento" })).toBeVisible();
  await expect(page.getByTestId("setup-progress")).toHaveText("0 de 5 etapas obrigatórias");
  await expect(page.getByTestId("tab-agenda")).toHaveCount(0);
  await expect(page.getByTestId("setup-open")).toBeDisabled();
});

test("a step opens the existing screen and the checklist shows the progress when the owner comes back", async ({ page }) => {
  const state = fresh();

  await signInAsOwner(page);
  await mockSetup(page, state);
  await page.goto("/setup");

  await page.getByTestId("setup-details-open").click();
  await expect(page).toHaveURL(/\/shop\?from=setup/);

  // What the owner saved on that screen: details and hours are now done on the server.
  state.missing = state.missing.filter((step) => step !== "details" && step !== "hours");
  await page.getByTestId("back").click();
  await expect(page).toHaveURL(/\/setup/);
  await expect(page.getByTestId("setup-progress")).toHaveText("2 de 5 etapas obrigatórias");
  await expect(page.getByTestId("setup-step-details-done")).toBeVisible();
});

test("accepting the business agreement records it and marks the step done", async ({ page }) => {
  const state = fresh();

  await signInAsOwner(page);
  await mockSetup(page, state);
  await page.goto("/setup");

  await page.getByTestId("setup-agreement-read").click();
  await expect(page).toHaveURL(/\/contrato/);
  await page.goBack();
  await page.getByTestId("setup-agreement-accept").click();

  await expect(page.getByTestId("setup-step-agreement-done")).toBeVisible();
  expect(state.accepted).toEqual([{ p_documents: [{ kind: "business", version: LEGAL_VERSIONS.business }] }]);
});

test("with every required step done the owner opens the agenda, sees the link screen first, goes to the agenda and never sees the checklist again", async ({ page }) => {
  const state = fresh();

  state.missing = [];
  await signInAsOwner(page);
  await mockSetup(page, state);
  await page.goto("/setup");

  await expect(page.getByTestId("setup-open")).toBeEnabled();
  await page.getByTestId("setup-open").click();

  // The link and QR come first (the routing gate must not yank the owner to the panel when the shop flips to open)...
  await expect(page).toHaveURL(/\/shop-link/);
  await expect(page.getByTestId("shop-link-qr")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/shop-link/);
  expect(state.completed).toBe(1);

  // ...and "Ir para a agenda" opens the panel.
  await page.getByTestId("shop-link-to-agenda").click();
  await expect(page).toHaveURL(/\/agenda/);
  await expect(page.getByTestId("tab-manage")).toBeVisible();

  await page.goto("/setup");
  await expect(page).toHaveURL(/\/agenda/);
});

test("when the server refuses to open, the owner sees the error and stays on the checklist", async ({ page }) => {
  const state = fresh();

  state.missing = [];
  state.completeFails = true;
  await signInAsOwner(page);
  await mockSetup(page, state);
  await page.goto("/setup");

  await page.getByTestId("setup-open").click();
  await expect(page.getByText("Conclua as etapas obrigatórias antes de abrir sua agenda.")).toBeVisible();
  await expect(page).toHaveURL(/\/setup/);
});

test.describe("the business agreement accepted in step 1", () => {
  // The signed-in owner has accepted terms and privacy, not yet the business agreement (a new owner).
  test.use({ consents: { rows: [{ kind: "terms", version: LEGAL_VERSIONS.terms }, { kind: "privacy", version: LEGAL_VERSIONS.privacy }] } });

  test("is not asked again by the re-accept gate once the business is open", async ({ consents, page }) => {
    const state = fresh();

    state.missing = ["agreement"];
    await signInAsOwner(page);
    // The server records the consent: from now on the consents lookup (answered by the fixture) includes it.
    await mockSetup(page, state, () => consents.rows.push({ kind: "business", version: LEGAL_VERSIONS.business }));
    await page.goto("/setup");

    await page.getByTestId("setup-agreement-accept").click();
    await expect(page.getByTestId("setup-step-agreement-done")).toBeVisible();
    await page.getByTestId("setup-open").click();
    await expect(page).toHaveURL(/\/shop-link/);
    await page.getByTestId("shop-link-to-agenda").click();

    await expect(page).toHaveURL(/\/agenda/);
    await expect(page.getByTestId("tab-manage")).toBeVisible();
    // Give the gate time to (wrongly) redirect, then check it did not.
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/accept-terms/);
    await expect(page.getByTestId("tab-manage")).toBeVisible();
  });
});
