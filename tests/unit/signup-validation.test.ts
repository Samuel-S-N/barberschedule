import { parseSignupInput } from "../../src/features/auth/validation";

const valid = { acceptedTerms: true, email: "Ana@Example.com ", fullName: " Ana Silva ", password: "12345678", phone: "" };

function errorsOf(result: ReturnType<typeof parseSignupInput>) {
  return (result as { errors: Record<string, string> }).errors;
}

describe("parseSignupInput", () => {
  it("normalizes a valid input (trim, lowercase email, empty phone -> null)", () => {
    expect(parseSignupInput(valid)).toEqual({
      ok: true,
      value: { acceptedTerms: true, email: "ana@example.com", fullName: "Ana Silva", password: "12345678", phone: null },
    });
  });

  it("uses a translation key for the terms error", () => {
    const result = parseSignupInput({ ...valid, acceptedTerms: false });

    expect(result).toMatchObject({ ok: false });
    expect(errorsOf(result).acceptedTerms).toBe("auth.validation.acceptTerms");
  });

  it.each([
    ["fullName", { fullName: "A" }, "auth.validation.fullName"],
    ["email", { email: "not-an-email" }, "auth.validation.email"],
    ["password", { password: "short" }, "auth.validation.password"],
    ["phone", { phone: "abc" }, "auth.validation.phone"],
  ])("rejects a bad %s with a translation key", (field, patch, key) => {
    const result = parseSignupInput({ ...valid, ...patch });

    expect(result).toMatchObject({ ok: false });
    expect(errorsOf(result)[field]).toBe(key);
  });
});
