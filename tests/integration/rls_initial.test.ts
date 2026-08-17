import { getCurrentProfile, isShopOwner } from "../../src/features/auth/api";

describe("task 2 auth database helpers", () => {
  it("reads the signed-in profile through get_current_profile()", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ role: "customer", user_id: "user-1" }],
      error: null,
    });

    await expect(getCurrentProfile({ rpc } as never)).resolves.toEqual({
      role: "customer",
      userId: "user-1",
    });
    expect(rpc).toHaveBeenCalledWith("get_current_profile");
  });

  it("checks ownership through is_shop_owner()", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });

    await expect(isShopOwner({ rpc } as never, "shop-1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("is_shop_owner", {
      shop_id: "shop-1",
    });
  });
});
