import { completePasswordReset, completePasswordSetup, requestPasswordReset, startRecoverySession } from "../../src/features/auth/api";
import { clearRecovery, hasRecovery, isInvite, markInvite, markRecovery } from "../../src/features/auth/recovery";

const client = (auth: Record<string, jest.Mock>) => ({ auth }) as never;

describe("requestPasswordReset", () => {
  it("sends the redirect the e-mail link must open", async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });

    await requestPasswordReset(client({ resetPasswordForEmail }), "a@b.co", "zenc://reset-password");

    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "zenc://reset-password" });
  });
});

describe("startRecoverySession", () => {
  beforeEach(clearRecovery);

  it("marks an invite link as an invite session", async () => {
    const supabase = client({ setSession: jest.fn().mockResolvedValue({ error: null }) });

    await startRecoverySession(supabase, { accessToken: "a3", flow: "invite", refreshToken: "r3" });

    expect(isInvite()).toBe(true);
    expect(hasRecovery()).toBe(true);
  });

  it("keeps a recovery link a plain recovery", async () => {
    const supabase = client({ setSession: jest.fn().mockResolvedValue({ error: null }) });

    await startRecoverySession(supabase, { accessToken: "a4", flow: "recovery", refreshToken: "r4" });

    expect(isInvite()).toBe(false);
  });

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

describe("completePasswordSetup", () => {
  it("an invite saves the password and STAYS signed in (the proof is cleared, no sign-out)", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    markInvite();

    await expect(completePasswordSetup(client({ signOut, updateUser }), "new-pass-1", { invite: true })).resolves.toBe("signed-in");

    expect(updateUser).toHaveBeenCalledWith({ password: "new-pass-1" });
    expect(signOut).not.toHaveBeenCalled();
    // A later visit to /reset-password must not behave as an invite (or as a recovery) any more.
    expect(isInvite()).toBe(false);
    expect(hasRecovery()).toBe(false);
  });

  it("a forgotten-password recovery still signs out everywhere and goes back to the login", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    markRecovery();

    await expect(completePasswordSetup(client({ signOut, updateUser }), "new-pass-1", { invite: false })).resolves.toBe("signed-out");

    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(hasRecovery()).toBe(false);
  });

  it("a failed update keeps the invite proof and the session", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: new Error("weak") });
    const signOut = jest.fn();
    markInvite();

    await expect(completePasswordSetup(client({ signOut, updateUser }), "x", { invite: true })).rejects.toThrow("weak");
    expect(signOut).not.toHaveBeenCalled();
    expect(isInvite()).toBe(true);
    clearRecovery();
  });
});
