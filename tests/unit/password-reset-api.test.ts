import { completePasswordReset, requestPasswordReset, startRecoverySession } from "../../src/features/auth/api";
import { clearRecovery, hasRecovery, markRecovery } from "../../src/features/auth/recovery";

const client = (auth: Record<string, jest.Mock>) => ({ auth }) as never;

describe("requestPasswordReset", () => {
  it("sends the redirect the e-mail link must open", async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });

    await requestPasswordReset(client({ resetPasswordForEmail }), "a@b.co", "barberschedule://reset-password");

    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "barberschedule://reset-password" });
  });
});

describe("startRecoverySession", () => {
  beforeEach(clearRecovery);

  it("sets the session once per token, marks the recovery and survives a remount", async () => {
    const setSession = jest.fn().mockResolvedValue({ error: null });
    const supabase = client({ setSession });
    const link = { accessToken: "a1", refreshToken: "r1" };

    await expect(startRecoverySession(supabase, link)).resolves.toBe(true);
    await expect(startRecoverySession(supabase, link)).resolves.toBe(true);

    expect(setSession).toHaveBeenCalledTimes(1);
    expect(setSession).toHaveBeenCalledWith({ access_token: "a1", refresh_token: "r1" });
    expect(hasRecovery()).toBe(true);
  });

  it("returns false and allows a retry when the tokens are rejected", async () => {
    const setSession = jest.fn().mockResolvedValue({ error: new Error("expired") });
    const supabase = client({ setSession });
    const link = { accessToken: "a2", refreshToken: "r2" };

    await expect(startRecoverySession(supabase, link)).resolves.toBe(false);
    await expect(startRecoverySession(supabase, link)).resolves.toBe(false);

    expect(setSession).toHaveBeenCalledTimes(2);
    expect(hasRecovery()).toBe(false);
  });
});

describe("completePasswordReset", () => {
  it("updates the password, signs out everywhere and clears the proof", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    markRecovery();

    await completePasswordReset(client({ signOut, updateUser }), "new-pass-1");

    expect(updateUser).toHaveBeenCalledWith({ password: "new-pass-1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(hasRecovery()).toBe(false);
  });

  it("does not sign out when the update fails", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: new Error("weak") });
    const signOut = jest.fn();

    await expect(completePasswordReset(client({ signOut, updateUser }), "x")).rejects.toThrow("weak");
    expect(signOut).not.toHaveBeenCalled();
  });
});
