import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

type Shop = Record<string, unknown>;

export const defaultShop: Shop = {
  address_cep: null, address_city: null, address_city_ibge: null, address_complement: null, address_district: null,
  address_number: null, address_state: null, address_street: null, id: "11111111-1111-4111-8111-111111111111", name: "Shop", phone: null, slug: "shop-a",
  theme_accent: null, theme_base: null, theme_primary: null, whatsapp: null,
};

type Request = { method(): string; url(): string };

const target = (request: Request) => new URL(request.url());
const isSlugLookup = (request: Request) =>
  request.method() === "GET" && target(request).pathname.endsWith("/rest/v1/shops") && (target(request).searchParams.get("slug") ?? "").startsWith("eq.");
const isMyShopRpc = (request: Request) => request.method() === "POST" && target(request).pathname.endsWith("/rest/v1/rpc/get_my_shop");

// Every shop-bound request starts with `GET /rest/v1/shops?...slug=eq.<slug>` (the current shop and its theme), and every staff screen
// with `POST /rest/v1/rpc/get_my_shop` (the staff member's own shop). Answering both here keeps the ~50 specs unchanged: they are
// answered for specs that mock no REST at all (a base route) and ahead of every spec `page.route` handler (a wrapper around
// page.route), which still sees every other request.
// `shop: null` simulates an unknown slug (no rows). `myShop` is the staff member's shop; it follows `shop` unless set (an owner of
// another shop: `test.use({ myShop: otherShop })`).
export const test = base.extend<{ interceptShops: boolean; myShop: Shop | null | undefined; notificationsPrompt: boolean; shop: Shop | null }>({
  // A spec that changes the shop row while it runs (the colours screen) turns this off and answers the lookups itself.
  interceptShops: [true, { option: true }],
  myShop: [undefined, { option: true }],
  // The first-sign-in notifications pop-up would cover every screen of every spec: it is marked as already shown unless a spec opts in.
  notificationsPrompt: [false, { option: true }],
  shop: [defaultShop, { option: true }],
  page: async ({ interceptShops, myShop, notificationsPrompt, page, shop }, use) => {
    if (!notificationsPrompt) await page.addInitScript(() => localStorage.setItem("zenc.notifications-prompted", "1"));
    const original = page.route.bind(page);
    const staffShop = myShop === undefined ? shop : myShop;
    const answer = (route: Parameters<Parameters<typeof page.route>[1]>[0], request: Request) => {
      const body = isMyShopRpc(request) ? (staffShop ? [{ shop_id: staffShop.id, slug: staffShop.slug }] : []) : shop ? [shop] : [];

      return route.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    };
    const ours = (request: Request) => interceptShops && (isSlugLookup(request) || isMyShopRpc(request));

    await original("**/rest/v1/**", (route, request) => (ours(request) ? answer(route, request) : route.fallback()));

    page.route = ((url: Parameters<typeof page.route>[0], handler: Parameters<typeof page.route>[1], options?: Parameters<typeof page.route>[2]) =>
      original(url, (route, request) => (ours(request) ? answer(route, request) : handler(route, request)), options)) as typeof page.route;

    await use(page);
  },
});
