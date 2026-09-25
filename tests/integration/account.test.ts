import {
  buildExportFile,
  deleteMyAccount,
  ensureMyCustomer,
  exportMyData,
  updateMyProfile,
} from "../../src/features/account/api";

const customerRow = {
  active: true, archived_at: null, email: "ana@example.com", full_name: "Ana",
  id: "customer-1", phone: null, shop_id: "shop-1", user_id: "user-1",
};

describe("account api", () => {
  it("ensureMyCustomer calls the RPC and maps the row", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: customerRow, error: null });

    await expect(ensureMyCustomer({ rpc } as never)).resolves.toMatchObject({
      fullName: "Ana", id: "customer-1", userId: "user-1",
    });
    expect(rpc).toHaveBeenCalledWith("ensure_my_customer");
  });

  it("updateMyProfile sends p_-prefixed parameters", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { ...customerRow, full_name: "Ana B", phone: "+55 11 90000-0000" }, error: null });

    await expect(updateMyProfile({ rpc } as never, { fullName: "Ana B", phone: "+55 11 90000-0000" }))
      .resolves.toMatchObject({ fullName: "Ana B", phone: "+55 11 90000-0000" });
    expect(rpc).toHaveBeenCalledWith("update_my_profile", { p_full_name: "Ana B", p_phone: "+55 11 90000-0000" });
  });

  it("maps P0017 to PROFILE_INVALID", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0017" } });

    await expect(updateMyProfile({ rpc } as never, { fullName: " ", phone: null }))
      .rejects.toMatchObject({ code: "PROFILE_INVALID" });
  });

  it("maps other RPC failures to ACCOUNT_REQUEST_FAILED, not a booking error", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "XX000" } });

    await expect(ensureMyCustomer({ rpc } as never)).rejects.toMatchObject({ code: "ACCOUNT_REQUEST_FAILED" });
  });

  it("exportMyData returns the JSON document", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { appointments: [] }, error: null });

    await expect(exportMyData({ rpc } as never)).resolves.toEqual({ appointments: [] });
    expect(rpc).toHaveBeenCalledWith("export_my_data");
  });

  it("buildExportFile names the file by UTC date and pretty-prints", () => {
    const file = buildExportFile({ a: 1 }, new Date("2026-09-23T15:00:00Z"));

    expect(file).toEqual({
      content: JSON.stringify({ a: 1 }, null, 2),
      filename: "barberschedule-my-data-2026-09-23.json",
      mimeType: "application/json",
    });
  });

  it("deleteMyAccount resolves on success", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: {}, error: null });

    await expect(deleteMyAccount({ functions: { invoke } } as never)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("delete-account", { method: "POST" });
  });

  it("deleteMyAccount maps a blocked response to ACCOUNT_DELETION_BLOCKED", async () => {
    const error = { context: { json: async () => ({ code: "ACCOUNT_DELETION_BLOCKED" }) } };
    const invoke = jest.fn().mockResolvedValue({ data: null, error });

    await expect(deleteMyAccount({ functions: { invoke } } as never))
      .rejects.toMatchObject({ code: "ACCOUNT_DELETION_BLOCKED" });
  });

  it("deleteMyAccount maps unknown failures to ACCOUNT_REQUEST_FAILED", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: new Error("boom") });

    await expect(deleteMyAccount({ functions: { invoke } } as never))
      .rejects.toMatchObject({ code: "ACCOUNT_REQUEST_FAILED" });
  });
});
