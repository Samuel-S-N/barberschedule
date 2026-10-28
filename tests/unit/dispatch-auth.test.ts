import { isServiceRequest } from "../../supabase/functions/dispatch-notifications/auth";

describe("isServiceRequest", () => {
  it("accepts the service-role bearer", () => expect(isServiceRequest("Bearer s3cret", "s3cret")).toBe(true));
  it("rejects a missing header", () => expect(isServiceRequest(null, "s3cret")).toBe(false));
  it("rejects another key, such as the public anon key", () => expect(isServiceRequest("Bearer anon-key", "s3cret")).toBe(false));
  it("rejects a prefix of the key", () => expect(isServiceRequest("Bearer s3cre", "s3cret")).toBe(false));
  it("rejects the bare key without the Bearer scheme", () => expect(isServiceRequest("s3cret", "s3cret")).toBe(false));
});
