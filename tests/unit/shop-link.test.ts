import { shopLink } from "../../src/features/shops/shop-link";

describe("shopLink", () => {
  it("production: the shop subdomain over https", () => {
    expect(shopLink("barbeariadojoao", "zencpro.app", { hostname: "barbeariadojoao.zencpro.app", port: "", protocol: "https:" })).toEqual({
      display: "barbeariadojoao.zencpro.app",
      url: "https://barbeariadojoao.zencpro.app/",
    });
  });

  it("local development keeps the protocol and port", () => {
    expect(shopLink("shop-a", "localhost", { hostname: "shop-a.localhost", port: "4173", protocol: "http:" })).toEqual({
      display: "shop-a.localhost:4173",
      url: "http://shop-a.localhost:4173/",
    });
  });

  it("native has no location: the production address", () => {
    expect(shopLink("shop-a", "zencpro.app")).toEqual({ display: "shop-a.zencpro.app", url: "https://shop-a.zencpro.app/" });
  });

  it("a host off the base domain uses the ?shop= form", () => {
    expect(shopLink("shop-a", "zencpro.app", { hostname: "dev.example.com", port: "", protocol: "https:" })).toEqual({
      display: "dev.example.com/?shop=shop-a",
      url: "https://dev.example.com/?shop=shop-a",
    });
  });
});
