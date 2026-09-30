import { isValidEmail, validateNewPassword } from "../../src/features/account/security";

describe("security validation", () => {
  it("validates e-mails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail(" a@b.co ")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });

  it("requires 8+ characters and a matching confirmation", () => {
    expect(validateNewPassword("short", "short")).toBe("password");
    expect(validateNewPassword("longenough", "different1")).toBe("mismatch");
    expect(validateNewPassword("longenough", "longenough")).toBeNull();
  });
});
