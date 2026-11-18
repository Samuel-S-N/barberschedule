jest.mock("../../src/features/notifications/web-push", () => ({ unsubscribeWebPush: jest.fn() }));

import { signOut } from "../../src/features/auth/api";
import { unsubscribeWebPush } from "../../src/features/notifications/web-push";

describe("signOut", () => {
  afterEach(() => jest.clearAllMocks());

  it("switches this browser's push subscription off first, then ends the session", async () => {
    const order: string[] = [];
    jest.mocked(unsubscribeWebPush).mockImplementation(async () => { order.push("unsubscribe"); });
    const supabase = { auth: { signOut: jest.fn().mockImplementation(async () => { order.push("signOut"); return { error: null }; }) }, rpc: jest.fn() };

    await signOut(supabase as never);

    expect(order).toEqual(["unsubscribe", "signOut"]);
  });

  it("still signs out when the unsubscribe fails", async () => {
    jest.mocked(unsubscribeWebPush).mockRejectedValue(new Error("offline"));
    const supabase = { auth: { signOut: jest.fn().mockResolvedValue({ error: null }) }, rpc: jest.fn() };

    await expect(signOut(supabase as never)).resolves.toBeUndefined();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
