import { Platform } from "react-native";

import { currentShopSlug } from "../../src/features/shops/host";

// The browser host and the tab's sessionStorage, faked.
function browser(host: string, search = "", stored: Record<string, string> = {}) {
  const store = new Map(Object.entries(stored));

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { host, hostname: host.split(":")[0], search },
      sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) },
    },
  });

  return store;
}

describe("currentShopSlug", () => {
  const original = { base: process.env.EXPO_PUBLIC_SHOP_BASE_DOMAIN, dev: process.env.EXPO_PUBLIC_DEV_SHOP_SLUG, window: globalThis.window };

  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "web");
    process.env.EXPO_PUBLIC_SHOP_BASE_DOMAIN = "zencpro.app";
    delete process.env.EXPO_PUBLIC_DEV_SHOP_SLUG;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, "window", { configurable: true, value: original.window });
    for (const [key, value] of [["EXPO_PUBLIC_SHOP_BASE_DOMAIN", original.base], ["EXPO_PUBLIC_DEV_SHOP_SLUG", original.dev]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("reads the subdomain under the base domain", () => {
    browser("alfa.zencpro.app");

    expect(currentShopSlug()).toBe("alfa");
  });

  it("ignores ?shop= under the base domain, so a crafted production link cannot pick a shop", () => {
    const store = browser("alfa.zencpro.app", "?shop=beta");

    expect(currentShopSlug()).toBe("alfa");
    expect(store.size).toBe(0);
  });

  it("off the base domain, ?shop= picks the shop and is remembered for the tab", () => {
    const store = browser("zenc-dev.example.workers.dev", "?shop=shop-q");

    expect(currentShopSlug()).toBe("shop-q");
    expect(store.get("zenc.shop")).toBe("shop-q");
  });

  it("off the base domain, navigation without the query keeps the remembered shop", () => {
    browser("zenc-dev.example.workers.dev", "", { "zenc.shop": "shop-q" });

    expect(currentShopSlug()).toBe("shop-q");
  });

  it("off the base domain, falls back to EXPO_PUBLIC_DEV_SHOP_SLUG, then to nothing", () => {
    browser("zenc-dev.example.workers.dev");
    expect(currentShopSlug()).toBeNull();

    process.env.EXPO_PUBLIC_DEV_SHOP_SLUG = "shop-dev";
    expect(currentShopSlug()).toBe("shop-dev");
  });

  it("does not remember an invalid or reserved ?shop=", () => {
    const store = browser("zenc-dev.example.workers.dev", "?shop=www");

    expect(currentShopSlug()).toBeNull();
    expect(store.size).toBe(0);
  });

  it("native still uses the dev slug", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    process.env.EXPO_PUBLIC_DEV_SHOP_SLUG = "shop-dev";

    expect(currentShopSlug()).toBe("shop-dev");
  });
});
