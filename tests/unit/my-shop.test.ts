import { getMyShop } from "../../src/features/shops/my-shop";

describe("getMyShop", () => {
  it("maps the RPC row", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ shop_id: "s1", slug: "alfa" }], error: null });

    await expect(getMyShop({ rpc } as never)).resolves.toEqual({ shopId: "s1", slug: "alfa" });
    expect(rpc).toHaveBeenCalledWith("get_my_shop");
  });

  it("returns null when the account has no staff shop", async () => {
    await expect(getMyShop({ rpc: jest.fn().mockResolvedValue({ data: [], error: null }) } as never)).resolves.toBeNull();
  });

  it("throws the RPC error", async () => {
    await expect(getMyShop({ rpc: jest.fn().mockResolvedValue({ data: null, error: new Error("boom") }) } as never)).rejects.toThrow("boom");
  });
});
