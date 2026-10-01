import { clearRecovery, hasRecovery, markRecovery, parseRecoveryUrl } from "../../src/features/auth/recovery";

describe("parseRecoveryUrl", () => {
  it("reads tokens from a deep link fragment", () => {
    expect(parseRecoveryUrl("barberschedule://reset-password#access_token=a&refresh_token=r&type=recovery")).toEqual({
      accessToken: "a", kind: "tokens", refreshToken: "r",
    });
  });

  it("reads tokens from an Expo Go link", () => {
    expect(parseRecoveryUrl("exp://192.168.0.2:8081/--/reset-password#access_token=a&refresh_token=r&type=recovery&expires_in=3600")).toEqual({
      accessToken: "a", kind: "tokens", refreshToken: "r",
    });
  });

  it("reports an expired or invalid link", () => {
    expect(parseRecoveryUrl("http://localhost:8081/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toEqual({ kind: "error" });
    expect(parseRecoveryUrl("barberschedule://reset-password?error=access_denied")).toEqual({ kind: "error" });
  });

  it("ignores anything that is not a recovery link", () => {
    for (const url of [null, undefined, "", "barberschedule://reset-password", "x://y#access_token=a&refresh_token=r&type=signup"]) {
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
