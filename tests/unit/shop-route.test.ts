import { resolveShopRoute } from "../../src/features/shops/shop-route";

const base = { canRedirect: true, currentSlug: "alfa", mySlug: null, role: null, signedIn: false, status: "ready" } as const;

describe("resolveShopRoute", () => {
  it.each([
    ["visitor on a shop", base, { kind: "app" }],
    ["visitor, shop loading", { ...base, status: "loading" }, { kind: "wait" }],
    ["visitor, unknown shop", { ...base, status: "not-found" }, { kind: "not-found" }],
    ["visitor, lookup failed", { ...base, status: "error" }, { kind: "error" }],
    ["visitor on the bare domain", { ...base, currentSlug: null, status: "no-slug" }, { kind: "app" }],
    ["customer on the bare domain", { ...base, currentSlug: null, role: "customer", signedIn: true, status: "no-slug" }, { kind: "bare" }],
    ["customer on a shop", { ...base, role: "customer", signedIn: true }, { kind: "app" }],
    ["owner, own shop still loading", { ...base, mySlug: undefined, role: "owner", signedIn: true }, { kind: "wait" }],
    ["owner on own shop", { ...base, mySlug: "alfa", role: "owner", signedIn: true }, { kind: "app" }],
    ["owner of another shop", { ...base, mySlug: "beta", role: "owner", signedIn: true }, { kind: "redirect", slug: "beta" }],
    ["professional on the bare domain", { ...base, currentSlug: null, mySlug: "beta", role: "professional", signedIn: true, status: "no-slug" }, { kind: "redirect", slug: "beta" }],
    ["owner on an unknown shop host", { ...base, mySlug: "beta", role: "owner", signedIn: true, status: "not-found" }, { kind: "redirect", slug: "beta" }],
    ["native: staff of another shop cannot be redirected, they get the app", { ...base, canRedirect: false, mySlug: "beta", role: "owner", signedIn: true }, { kind: "app" }],
    ["native: staff with no dev slug at all", { ...base, canRedirect: false, currentSlug: null, mySlug: "beta", role: "owner", signedIn: true, status: "no-slug" }, { kind: "bare" }],
    ["owner with no shop yet", { ...base, mySlug: null, role: "owner", signedIn: true }, { kind: "app" }],
  ] as const)("%s", (_name, input, expected) => {
    expect(resolveShopRoute(input as never)).toEqual(expected);
  });
});
