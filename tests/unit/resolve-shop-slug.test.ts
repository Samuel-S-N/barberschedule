import { resolveShopSlug, shopUrl } from "../../src/features/shops/resolve-slug";

describe("resolveShopSlug", () => {
  it.each([
    ["barbeariadojoao.zencpro.app", "zencpro.app", "barbeariadojoao"],
    ["Barbeariadojoao.ZencPro.app", "zencpro.app", "barbeariadojoao"],
    ["barbeariadojoao.zencpro.app:443", "zencpro.app", "barbeariadojoao"],
    ["shop-a.localhost:8081", "localhost", "shop-a"],
    ["shop-a.localhost", "localhost", "shop-a"],
  ])("%s -> %s", (host, base, slug) => {
    expect(resolveShopSlug(host, base)).toBe(slug);
  });

  it.each([
    ["zencpro.app", "zencpro.app"],
    ["www.zencpro.app", "zencpro.app"],
    ["app.zencpro.app", "zencpro.app"],
    ["login.zencpro.app", "zencpro.app"],
    ["a.b.zencpro.app", "zencpro.app"],
    ["ab.zencpro.app", "zencpro.app"],
    ["-bad.zencpro.app", "zencpro.app"],
    ["example.com", "zencpro.app"],
    ["evilzencpro.app", "zencpro.app"],
    ["localhost:8081", "localhost"],
    ["127.0.0.1:4173", "localhost"],
    ["", "zencpro.app"],
  ])("%s -> null", (host, base) => {
    expect(resolveShopSlug(host, base)).toBeNull();
  });
});

describe("shopUrl", () => {
  it("keeps protocol and port", () => {
    expect(shopUrl("barbeariadojoao", "zencpro.app", { port: "", protocol: "https:" })).toBe("https://barbeariadojoao.zencpro.app/");
    expect(shopUrl("shop-b", "localhost", { port: "8081", protocol: "http:" })).toBe("http://shop-b.localhost:8081/");
  });
});
