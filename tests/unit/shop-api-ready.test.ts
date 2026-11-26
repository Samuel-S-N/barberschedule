import { getShopBySlug, listPublicShops } from "../../src/features/shops/api";

const fakeSupabase = (rows: unknown[]) => ({
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: rows, error: null }) }), order: async () => ({ data: rows, error: null }) }) }),
});

describe("PublicShop.ready", () => {
  it("is false only when setup_completed_at is explicitly null", async () => {
    expect((await getShopBySlug(fakeSupabase([{ id: "s", name: "A", setup_completed_at: null, slug: "a" }]) as never, "a"))?.ready).toBe(false);
    expect((await getShopBySlug(fakeSupabase([{ id: "s", name: "A", setup_completed_at: "2026-11-01T00:00:00Z", slug: "a" }]) as never, "a"))?.ready).toBe(true);
    expect((await getShopBySlug(fakeSupabase([{ id: "s", name: "A", slug: "a" }]) as never, "a"))?.ready).toBe(true);
  });

  it("listPublicShops carries it too", async () => {
    expect((await listPublicShops(fakeSupabase([{ id: "s", name: "A", setup_completed_at: null, slug: "a" }]) as never))[0].ready).toBe(false);
  });
});
