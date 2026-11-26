import { test as base } from "@playwright/test";

import { LEGAL_VERSIONS } from "../../src/features/legal";

export { expect } from "@playwright/test";

type Shop = Record<string, unknown>;

export const defaultShop: Shop = {
  address_cep: null, address_city: null, address_city_ibge: null, address_complement: null, address_district: null,
  address_number: null, address_state: null, address_street: null, id: "11111111-1111-4111-8111-111111111111", name: "Shop", phone: null, setup_completed_at: "2026-11-01T00:00:00Z", slug: "shop-a",
  theme_accent: null, theme_base: null, theme_primary: null, whatsapp: null,
};

type Request = { method(): string; url(): string };

const target = (request: Request) => new URL(request.url());
const isSlugLookup = (request: Request) =>
  request.method() === "GET" && target(request).pathname.endsWith("/rest/v1/shops") && (target(request).searchParams.get("slug") ?? "").startsWith("eq.");
const isConsents = (request: Request) => request.method() === "GET" && target(request).pathname.endsWith("/rest/v1/consents");
const isMyShopRpc = (request: Request) => request.method() === "POST" && target(request).pathname.endsWith("/rest/v1/rpc/get_my_shop");

// Every shop-bound request starts with `GET /rest/v1/shops?...slug=eq.<slug>` (the current shop and its theme), and every staff screen
// with `POST /rest/v1/rpc/get_my_shop` (the staff member's own shop). Answering both here keeps the ~50 specs unchanged: they are
// answered for specs that mock no REST at all (a base route) and ahead of every spec `page.route` handler (a wrapper around
// page.route), which still sees every other request.
// `shop: null` simulates an unknown slug (no rows). `myShop` is the staff member's shop; it follows `shop` unless set (an owner of
// another shop: `test.use({ myShop: otherShop })`).
export const test = base.extend<{ consents: { rows: Array<{ kind: string; version: string }> }; interceptShops: boolean; myShop: Shop | null | undefined; notificationsPrompt: boolean; shop: Shop | null }>({
  // The legal documents the signed-in user has accepted: the current versions by default, so the re-accept gate stays out of every spec
  // (many answer unknown REST calls with []). The gate spec overrides it.
  // (An object, not an array: Playwright reads an array option value as a [value, options] pair.)
  consents: [{ rows: Object.entries(LEGAL_VERSIONS).map(([kind, version]) => ({ kind, version })) }, { option: true }],
  // A spec that changes the shop row while it runs (the colours screen) turns this off and answers the lookups itself.
  interceptShops: [true, { option: true }],
  myShop: [undefined, { option: true }],
  // The first-sign-in notifications pop-up would cover every screen of every spec: it is marked as already shown unless a spec opts in.
  notificationsPrompt: [false, { option: true }],
  shop: [defaultShop, { option: true }],
  page: async ({ consents, interceptShops, myShop, notificationsPrompt, page, shop }, use) => {
    if (!notificationsPrompt) await page.addInitScript(() => localStorage.setItem("zenc.notifications-prompted", "1"));
    const original = page.route.bind(page);
    const staffShop = myShop === undefined ? shop : myShop;
    const answer = (route: Parameters<Parameters<typeof page.route>[1]>[0], request: Request) => {
      const body = isConsents(request) ? consents.rows : isMyShopRpc(request) ? (staffShop ? [{ shop_id: staffShop.id, slug: staffShop.slug }] : []) : shop ? [shop] : [];

      return route.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    };
    const ours = (request: Request) => isConsents(request) || (interceptShops && (isSlugLookup(request) || isMyShopRpc(request)));

    await original("**/rest/v1/**", (route, request) => (ours(request) ? answer(route, request) : route.fallback()));

    page.route = ((url: Parameters<typeof page.route>[0], handler: Parameters<typeof page.route>[1], options?: Parameters<typeof page.route>[2]) =>
      original(url, (route, request) => (ours(request) ? answer(route, request) : handler(route, request)), options)) as typeof page.route;

    await use(page);
  },
});
