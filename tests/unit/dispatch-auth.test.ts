import { dispatchToken, isServiceRequest } from "../../supabase/functions/dispatch-notifications/auth";

describe("isServiceRequest", () => {
  it("accepts the service-role bearer", () => expect(isServiceRequest("Bearer s3cret", "s3cret")).toBe(true));
  it("rejects a missing header", () => expect(isServiceRequest(null, "s3cret")).toBe(false));
  it("rejects another key, such as the public anon key", () => expect(isServiceRequest("Bearer anon-key", "s3cret")).toBe(false));
  it("rejects a prefix of the key", () => expect(isServiceRequest("Bearer s3cre", "s3cret")).toBe(false));
  it("rejects the bare key without the Bearer scheme", () => expect(isServiceRequest("s3cret", "s3cret")).toBe(false));
});

describe("isServiceRequest with a second key", () => {
  const token = "t".repeat(32);

  it("accepts the dispatch token as well as the service-role key", () => {
    expect(isServiceRequest(`Bearer ${token}`, "s3cret", token)).toBe(true);
    expect(isServiceRequest("Bearer s3cret", "s3cret", token)).toBe(true);
  });
  it("ignores an unset or empty second key", () => {
    expect(isServiceRequest("Bearer ", "s3cret", "")).toBe(false);
    expect(isServiceRequest("Bearer undefined", "s3cret", undefined)).toBe(false);
  });
});

describe("dispatchToken", () => {
  it("only trusts a token of at least 32 characters", () => {
    expect(dispatchToken("short")).toBeUndefined();
    expect(dispatchToken(undefined)).toBeUndefined();
    expect(dispatchToken("a".repeat(32))).toBe("a".repeat(32));
  });
});
