import { completeShopSetup, getShopSetupStatus } from "../../src/features/setup/api";

it("getShopSetupStatus calls the RPC with the shop id", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: { completed: false, missing: ["hours"], professionals: [] }, error: null });

  expect(await getShopSetupStatus({ rpc } as never, "s1")).toEqual({ completed: false, missing: ["hours"], professionals: [] });
  expect(rpc).toHaveBeenCalledWith("shop_setup_status", { p_shop_id: "s1" });
});

it("completeShopSetup returns the timestamp and maps P0045", async () => {
  const ok = jest.fn().mockResolvedValue({ data: "2026-11-26T10:00:00Z", error: null });

  expect(await completeShopSetup({ rpc: ok } as never, "s1")).toBe("2026-11-26T10:00:00Z");
  expect(ok).toHaveBeenCalledWith("complete_shop_setup", { p_shop_id: "s1" });
  await expect(completeShopSetup({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: "P0045" } }) } as never, "s1")).rejects.toMatchObject({ code: "SHOP_SETUP_INCOMPLETE" });
});
