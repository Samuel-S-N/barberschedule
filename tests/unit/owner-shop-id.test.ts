import { getOwnerShopId } from "../../src/features/shops/use-owner-shop-id";

describe("getOwnerShopId", () => {
  it("returns the caller's own shop, never the first shop by name", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ shop_id: "shop-b", slug: "beta" }], error: null });

    await expect(getOwnerShopId({ rpc } as never)).resolves.toBe("shop-b");
    expect(rpc).toHaveBeenCalledWith("get_my_shop");
  });

  it("returns null when the owner has no shop yet", async () => {
    await expect(getOwnerShopId({ rpc: jest.fn().mockResolvedValue({ data: [], error: null }) } as never)).resolves.toBeNull();
  });
});
