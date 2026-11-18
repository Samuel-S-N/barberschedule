import { isUnderBaseDomain, resolveCurrentSlug, resolveShopSlug, shopUrl, validShopSlug } from "../../src/features/shops/resolve-slug";

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
  it("under the base domain: a subdomain, keeping protocol and port", () => {
    expect(shopUrl("barbeariadojoao", "zencpro.app", { hostname: "app.zencpro.app", port: "", protocol: "https:" })).toBe("https://barbeariadojoao.zencpro.app/");
    expect(shopUrl("shop-b", "localhost", { hostname: "shop-a.localhost", port: "8081", protocol: "http:" })).toBe("http://shop-b.localhost:8081/");
  });

  it("off the base domain (hosted dev address): the same origin with ?shop=<slug>", () => {
    expect(shopUrl("shop-b", "zencpro.app", { hostname: "zenc-dev.example.workers.dev", port: "", protocol: "https:" })).toBe("https://zenc-dev.example.workers.dev/?shop=shop-b");
  });
});

describe("validShopSlug", () => {
  it.each([["barbearia-1", "barbearia-1"], ["Barbearia-1", "barbearia-1"], [" shop-a ", "shop-a"]])("%j -> %j", (value, expected) => {
    expect(validShopSlug(value)).toBe(expected);
  });

  it.each(["", "ab", "-bad", "www", "login", "a.b", "has space", "x".repeat(33), null, undefined])("rejects %j", (value) => {
    expect(validShopSlug(value as never)).toBeNull();
  });
});

describe("isUnderBaseDomain", () => {
  it.each([
    ["zencpro.app", "zencpro.app", true],
    ["www.zencpro.app", "zencpro.app", true],
    ["shop-a.localhost:4173", "localhost", true],
    ["localhost:8081", "localhost", true],
    ["evilzencpro.app", "zencpro.app", false],
    ["zenc-dev.example.workers.dev", "zencpro.app", false],
    ["127.0.0.1:4173", "localhost", false],
  ])("%s under %s -> %s", (host, base, expected) => {
    expect(isUnderBaseDomain(host, base)).toBe(expected);
  });
});

describe("resolveCurrentSlug", () => {
  const base = { baseDomain: "zencpro.app", devSlug: undefined, remembered: null, search: "" };

  it("under the base domain the host decides and the query and dev slug are ignored", () => {
    expect(resolveCurrentSlug({ ...base, devSlug: "shop-dev", host: "alfa.zencpro.app", search: "?shop=beta" })).toBe("alfa");
    expect(resolveCurrentSlug({ ...base, devSlug: "shop-dev", host: "zencpro.app", search: "?shop=beta" })).toBeNull();
    expect(resolveCurrentSlug({ ...base, host: "www.zencpro.app", remembered: "beta", search: "?shop=beta" })).toBeNull();
    expect(resolveCurrentSlug({ ...base, baseDomain: "localhost", devSlug: "shop-dev", host: "shop-a.localhost:4173", search: "?shop=beta" })).toBe("shop-a");
  });

  it("off the base domain: ?shop= first, then the remembered slug, then the dev slug, then nothing", () => {
    const off = { ...base, host: "zenc-dev.example.workers.dev" };

    expect(resolveCurrentSlug({ ...off, devSlug: "shop-dev", remembered: "shop-r", search: "?shop=shop-q" })).toBe("shop-q");
    expect(resolveCurrentSlug({ ...off, devSlug: "shop-dev", remembered: "shop-r" })).toBe("shop-r");
    expect(resolveCurrentSlug({ ...off, devSlug: "shop-dev" })).toBe("shop-dev");
    expect(resolveCurrentSlug(off)).toBeNull();
  });

  it("off the base domain an invalid or reserved ?shop= is rejected (falls through)", () => {
    const off = { ...base, host: "zenc-dev.example.workers.dev", devSlug: "shop-dev" };

    expect(resolveCurrentSlug({ ...off, search: "?shop=www" })).toBe("shop-dev");
    expect(resolveCurrentSlug({ ...off, search: "?shop=a" })).toBe("shop-dev");
    expect(resolveCurrentSlug({ ...off, search: "?shop=../x" })).toBe("shop-dev");
    expect(resolveCurrentSlug({ ...off, remembered: "bad slug" , search: "" })).toBe("shop-dev");
  });

  it("an invalid dev slug is ignored", () => {
    expect(resolveCurrentSlug({ ...base, devSlug: "WWW", host: "zenc-dev.example.workers.dev" })).toBeNull();
  });
});
