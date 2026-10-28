import { parseSignupInput } from "../../src/features/auth/validation";
import { parseBarberInput } from "../../src/features/barbers/validation";
import { parseCustomerInput } from "../../src/features/customers/validation";
import { parseServiceInput } from "../../src/features/services/validation";

// Same limits as the CHECK constraints in migration 0064: the app refuses before the database does.
const shopId = "a1000000-0000-0000-0000-000000000001";

describe("text limits", () => {
  it("signup refuses a full name over 100 characters", () => {
    const base = { acceptedTerms: true, confirmPassword: "12345678", email: "ana@example.com", nickname: "", password: "12345678", phone: "" };

    expect(parseSignupInput({ ...base, fullName: "a".repeat(100) })).toMatchObject({ ok: true });
    expect(parseSignupInput({ ...base, fullName: "a".repeat(101) })).toEqual({ errors: { fullName: "auth.validation.fullNameTooLong" }, ok: false });
  });

  it("customers cap name 100, email 254, phone 30", () => {
    expect(() => parseCustomerInput({ fullName: "a".repeat(100), phone: "11 99999-0000", shopId })).not.toThrow();
    expect(() => parseCustomerInput({ fullName: "a".repeat(101), phone: "11 99999-0000", shopId })).toThrow("100");
    const longEmail = `${"e".repeat(60)}@${Array(4).fill("d".repeat(60)).join(".")}.com`; // well-formed, 308 characters
    expect(() => parseCustomerInput({ email: longEmail, fullName: "Ana", shopId })).toThrow("254");
    expect(() => parseCustomerInput({ fullName: "Ana", phone: "1".repeat(31), shopId })).toThrow("30");
  });

  it("barbers cap the name at 80", () => {
    expect(() => parseBarberInput({ name: "b".repeat(80), shopId })).not.toThrow();
    expect(() => parseBarberInput({ name: "b".repeat(81), shopId })).toThrow();
  });

  it("services cap name 80 and description 500", () => {
    const base = { durationMinutes: 30, name: "Corte", priceCents: 4000, shopId };

    expect(() => parseServiceInput({ ...base, description: "d".repeat(500), name: "s".repeat(80) })).not.toThrow();
    expect(() => parseServiceInput({ ...base, name: "s".repeat(81) })).toThrow();
    expect(() => parseServiceInput({ ...base, description: "d".repeat(501) })).toThrow();
  });
});
