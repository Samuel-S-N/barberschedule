import { LEGAL_VERSIONS } from "../../src/features/legal";
import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";
import { expect, test } from "./fixtures";

// A fresh object per describe: the first test replaces its rows to simulate the acceptance.
const old = () => ({ rows: [{ kind: "terms", version: "2026-09-23" }, { kind: "privacy", version: "2026-09-23" }] });

test.describe("re-accept gate", () => {
  test.use({ consents: old(), locale: "pt-BR" });

  test("a customer with old consents is blocked until accepting the current versions", async ({ consents, page }) => {
    let accepted: unknown = null;

    await signInAsCustomer(page);
    await mockCustomerRest(page, async (route, url) => {
      if (url.pathname.endsWith("/rpc/accept_legal_documents")) {
        accepted = route.request().postDataJSON();
        await json(route, null);
        return true;
      }
    });

    await page.goto("/home");
    await expect(page).toHaveURL(/\/accept-terms/);
    await expect(page.getByRole("heading", { name: "Atualizamos nossos termos" })).toBeVisible();

    await page.getByTestId("gate-link-privacy").click();
    await expect(page).toHaveURL(/\/privacidade/);
    await page.goBack();
    await expect(page.getByTestId("gate-link-terms")).toBeVisible();
    await expect(page.getByTestId("gate-link-business")).toHaveCount(0);

    // After accepting, the consents lookup answers with the current versions.
    consents.rows = Object.entries(LEGAL_VERSIONS).map(([kind, version]) => ({ kind, version }));
    await page.getByTestId("gate-accept").click();

    await expect(page).toHaveURL(/\/home/);
    expect(accepted).toEqual({ p_documents: [{ kind: "terms", version: LEGAL_VERSIONS.terms }, { kind: "privacy", version: LEGAL_VERSIONS.privacy }] });
  });
});

test("a customer with current consents is not redirected", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/home");
  await expect(page).not.toHaveURL(/accept-terms/);
});

test.describe("owner", () => {
  test.use({ consents: old() });

  test("an owner is asked for the business agreement too", async ({ page }) => {
    const ownerId = "55555555-5555-4555-8555-555555555555";

    await page.addInitScript(({ id }) => {
      const now = Math.floor(Date.now() / 1000);
      const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
      const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
      const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
      localStorage.setItem("sb-example-auth-token", session);
      localStorage.setItem("sb-127-auth-token", session);
    }, { id: ownerId });
    await page.route("**/rest/v1/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Olivia Owner", role: "owner", user_id: ownerId }]);
      await route.abort();
    });

    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/accept-terms/);
    for (const kind of ["terms", "privacy", "business"]) await expect(page.getByTestId(`gate-link-${kind}`)).toBeVisible();
  });
});
