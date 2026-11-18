import { expect, test } from "./fixtures";

import { customerRow, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const shopB = { id: "99999999-9999-4999-8999-999999999999", name: "Shop B", slug: "shop-b", address: null, phone: null, whatsapp: null, theme_primary: null, theme_accent: null, theme_base: null };

test("a visitor on a shop host sees that shop's login with a create-account button", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => json(route, []));
  await page.goto("/login");

  await expect(page.getByTestId("login-email")).toBeVisible();
  await expect(page.getByText("Create account")).toBeVisible();
});

test.describe("unknown shop", () => {
  test.use({ shop: null });

  test("shows 'Business not found'", async ({ page }) => {
    await page.route("**/rest/v1/**", (route) => json(route, []));
    await page.goto("/login");

    await expect(page.getByText("Business not found")).toBeVisible();
    await expect(page.getByTestId("login-email")).toHaveCount(0);
  });
});

test("the bare domain offers staff login only", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => json(route, []));
  await page.goto(`http://localhost:${process.env.ZENC_E2E_WEB_PORT ?? "4173"}/login`);

  await expect(page.getByText("Open the link your business sent you", { exact: false })).toBeVisible();
  await expect(page.getByText("Create account")).toHaveCount(0);
});

test("a customer sees only the current shop's data and bootstraps there", async ({ page }) => {
  let bootstrapShop: unknown = null;
  const customerRequests: string[] = [];

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/ensure_my_customer")) {
      bootstrapShop = JSON.parse(route.request().postData() ?? "{}").p_shop_id;

      return json(route, customerRow()), true;
    }
    if (url.pathname.endsWith("/customers")) customerRequests.push(url.search);
  });
  await page.goto("/home");

  await expect.poll(() => bootstrapShop).toBe("11111111-1111-4111-8111-111111111111");
  // Every read of the customer's own rows is narrowed to this shop (an account has one customer row per shop).
  await expect.poll(() => customerRequests.some((search) => search.includes("shop_id=eq.11111111-1111-4111-8111-111111111111"))).toBe(true);
});

test("a customer opening the booking tab on shop A is sent to shop A's professionals", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);
  await page.goto("/book");

  await expect(page).toHaveURL(/shopId=11111111-1111-4111-8111-111111111111/);
});

test.describe("owner of shop B", () => {
  test.use({ myShop: shopB });

  test("opening shop A is sent to shop B's subdomain", async ({ page }) => {
    const ownerId = "55555555-5555-4555-8555-555555555555";

    // Same session seed the other specs use (the cookie adapter also reads this legacy localStorage key).
    await page.addInitScript(({ id }) => {
      const now = Math.floor(Date.now() / 1000);
      const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
      const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
      const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
      localStorage.setItem("sb-example-auth-token", session);
      localStorage.setItem("sb-127-auth-token", session);
    }, { id: ownerId });
    await page.route("**/rest/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner B", role: "owner", user_id: ownerId }]);

      return json(route, []);
    });

    await page.goto("/agenda");

    await expect(page).toHaveURL(/^http:\/\/shop-b\.localhost:\d+\//);
  });
});

test.describe("shop B", () => {
  test.use({ shop: shopB });

  test("the same build serves shop B on its own host", async ({ page, baseURL }) => {
    await page.route("**/rest/v1/**", (route) => json(route, []));
    await page.goto(`${baseURL!.replace("shop-a", "shop-b")}/login`);

    await expect(page.getByTestId("login-email")).toBeVisible();
  });
});
