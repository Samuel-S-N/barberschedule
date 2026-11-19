import { buildShopUrl, DEFAULT_SHOP_URL_TEMPLATE } from "../../supabase/functions/_shared/shop-url";

describe("buildShopUrl", () => {
  it("fills the slug and appends the path", () => {
    expect(buildShopUrl("https://{slug}.zencpro.app", "barbeariadojoao", "/reset-password")).toBe("https://barbeariadojoao.zencpro.app/reset-password");
  });

  it("keeps a port and tolerates a trailing slash in the template", () => {
    expect(buildShopUrl("http://{slug}.localhost:8081/", "shop-a", "/reset-password")).toBe("http://shop-a.localhost:8081/reset-password");
  });

  it("defaults the path to the root", () => {
    expect(buildShopUrl(DEFAULT_SHOP_URL_TEMPLATE, "alfa")).toBe("https://alfa.zencpro.app/");
  });

  it("rejects a template without the slug placeholder", () => {
    expect(() => buildShopUrl("https://zencpro.app", "alfa")).toThrow("{slug}");
  });
});
