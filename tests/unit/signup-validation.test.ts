import { parseSignupInput } from "../../src/features/auth/validation";

const valid = { acceptedTerms: true, email: "Ana@Example.com ", fullName: " Ana Silva ", password: "12345678", phone: "" };

describe("parseSignupInput", () => {
  it("normalizes a valid input (trim, lowercase email, empty phone -> null)", () => {
    expect(parseSignupInput(valid)).toEqual({
      ok: true,
      value: { acceptedTerms: true, email: "ana@example.com", fullName: "Ana Silva", password: "12345678", phone: null },
    });
  });

  it("requires accepting the terms", () => {
    const result = parseSignupInput({ ...valid, acceptedTerms: false });
    expect(result).toMatchObject({ ok: false, errors: { acceptedTerms: expect.any(String) } });
  });

  it.each([
    ["fullName", { fullName: "A" }],
    ["email", { email: "not-an-email" }],
    ["password", { password: "short" }],
    ["phone", { phone: "abc" }],
  ])("rejects a bad %s", (field, patch) => {
    const result = parseSignupInput({ ...valid, ...patch });
    expect(result).toMatchObject({ ok: false });
    expect((result as { errors: Record<string, string> }).errors[field]).toEqual(expect.any(String));
  });
});
