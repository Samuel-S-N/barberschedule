import { signUpCustomer } from "../../src/features/auth/api";

describe("signUpCustomer", () => {
  const input = { acceptedTerms: true as const, email: "ana@example.com", fullName: "Ana", nickname: "Aninha", password: "12345678", phone: "+55 11 90000-0000" };

  it("sends profile data and the accepted terms version as auth metadata", async () => {
    const signUp = jest.fn().mockResolvedValue({ data: { session: null }, error: null });

    await expect(signUpCustomer({ auth: { signUp } } as never, input, "https://alfa.zencpro.app/")).resolves.toEqual({ needsEmailConfirmation: true });
    expect(signUp).toHaveBeenCalledWith({
      email: "ana@example.com",
      options: { data: { accepted_terms_version: "2026-09-23", full_name: "Ana", nickname: "Aninha", phone: "+55 11 90000-0000" }, emailRedirectTo: "https://alfa.zencpro.app/" },
      password: "12345678",
    });
  });

  it("omits phone metadata when none was given", async () => {
    const signUp = jest.fn().mockResolvedValue({ data: { session: null }, error: null });

    await signUpCustomer({ auth: { signUp } } as never, { ...input, nickname: null, phone: null }, "https://alfa.zencpro.app/");

    expect(signUp.mock.calls[0][0].options.data).toEqual({ accepted_terms_version: "2026-09-23", full_name: "Ana" });
  });

  it("reports no confirmation needed when a session is returned", async () => {
    const signUp = jest.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    await expect(signUpCustomer({ auth: { signUp } } as never, input, "https://alfa.zencpro.app/")).resolves.toEqual({ needsEmailConfirmation: false });
  });

  it("throws the auth error", async () => {
    const signUp = jest.fn().mockResolvedValue({ data: {}, error: new Error("User already registered") });

    await expect(signUpCustomer({ auth: { signUp } } as never, input, "https://alfa.zencpro.app/")).rejects.toThrow("User already registered");
  });
});
