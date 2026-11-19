import { clearRecovery, hasRecovery, inviteTokenFromUrl, isInvite, markInvite, promoteInvite, rememberInviteToken, markRecovery, parseRecoveryUrl, resolveRecoveryStatus } from "../../src/features/auth/recovery";

describe("parseRecoveryUrl", () => {
  it("reads tokens from a deep link fragment", () => {
    expect(parseRecoveryUrl("zenc://reset-password#access_token=a&refresh_token=r&type=recovery")).toEqual({
      accessToken: "a", flow: "recovery", kind: "tokens", refreshToken: "r",
    });
  });

  it("reads tokens from an Expo Go link", () => {
    expect(parseRecoveryUrl("exp://192.168.0.2:8081/--/reset-password#access_token=a&refresh_token=r&type=recovery&expires_in=3600")).toEqual({
      accessToken: "a", flow: "recovery", kind: "tokens", refreshToken: "r",
    });
  });

  it("reports an expired or invalid link", () => {
    expect(parseRecoveryUrl("http://localhost:8081/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toEqual({ kind: "error" });
    expect(parseRecoveryUrl("zenc://reset-password?error=access_denied")).toEqual({ kind: "error" });
  });

  it("ignores anything that is not a recovery link", () => {
    for (const url of [null, undefined, "", "zenc://reset-password", "x://y#access_token=a&refresh_token=r&type=signup"]) {
      expect(parseRecoveryUrl(url)).toEqual({ kind: "none" });
    }
  });
});

describe("recovery proof", () => {
  it("is set by markRecovery and cleared by clearRecovery", () => {
    clearRecovery();
    expect(hasRecovery()).toBe(false);
    markRecovery();
    expect(hasRecovery()).toBe(true);
    clearRecovery();
    expect(hasRecovery()).toBe(false);
  });
});

describe("resolveRecoveryStatus", () => {
  const base = { hasSession: false, isLoading: false, platform: "ios", proof: false };

  it("waits while the session is loading", () => {
    expect(resolveRecoveryStatus({ ...base, hasSession: true, isLoading: true, proof: true })).toBe("checking");
  });

  it("is ready once a recovery session exists, on any platform (a remount after setSession must not lose it)", () => {
    expect(resolveRecoveryStatus({ ...base, hasSession: true, proof: true })).toBe("ready");
    expect(resolveRecoveryStatus({ ...base, hasSession: true, platform: "web", proof: true })).toBe("ready");
  });

  it("rejects an ordinary session that did not come from a recovery link", () => {
    expect(resolveRecoveryStatus({ ...base, hasSession: true, platform: "web" })).toBe("invalid");
  });

  it("is invalid on web without a session, but keeps waiting on native for the deep link", () => {
    expect(resolveRecoveryStatus({ ...base, platform: "web" })).toBe("invalid");
    expect(resolveRecoveryStatus(base)).toBe("checking");
  });
});

describe("invite links", () => {
  it("parses an invite deep link as a tokens link with the invite flow", () => {
    expect(parseRecoveryUrl("zenc://reset-password#access_token=a&refresh_token=r&type=invite")).toEqual({
      accessToken: "a", flow: "invite", kind: "tokens", refreshToken: "r",
    });
  });

  it("reads the invite token from the URL hash only", () => {
    expect(inviteTokenFromUrl("https://alfa.zencpro.app/reset-password#access_token=tok&refresh_token=r&type=invite")).toBe("tok");
    expect(inviteTokenFromUrl("https://alfa.zencpro.app/reset-password?access_token=tok&type=invite")).toBeNull();
    expect(inviteTokenFromUrl("https://alfa.zencpro.app/reset-password#access_token=tok&refresh_token=r&type=recovery")).toBeNull();
    expect(inviteTokenFromUrl(null)).toBeNull();
  });

  it("only a session carrying the captured token becomes an invite session", () => {
    clearRecovery();
    rememberInviteToken("tok");
    promoteInvite({ access_token: "someone-elses-token" } as never);
    promoteInvite(null);
    expect(isInvite()).toBe(false);

    promoteInvite({ access_token: "tok" } as never);
    expect(isInvite()).toBe(true);
    expect(hasRecovery()).toBe(true);
  });

  it("a bogus invite link next to an existing session never grants the proof", () => {
    clearRecovery();
    rememberInviteToken("forged");
    promoteInvite({ access_token: "the-real-existing-session-token" } as never);

    expect(isInvite()).toBe(false);
    expect(hasRecovery()).toBe(false);
  });

  it("an invite proof counts as recovery proof and is cleared with it", () => {
    clearRecovery();
    markInvite();
    expect(hasRecovery()).toBe(true);
    expect(isInvite()).toBe(true);
    clearRecovery();
    expect(hasRecovery()).toBe(false);
    expect(isInvite()).toBe(false);
  });
});
