import i18n from "../../src/i18n";
import { errorMessage } from "../../src/i18n/errors";
import { en } from "../../src/i18n/locales/en";
import { DomainError } from "../../src/lib/errors/domain-errors";
import type { DomainErrorCode } from "../../src/lib/errors/domain-errors";

const t = (key: string) => i18n.t(key as never) as string;

describe("errorMessage", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("translates a DomainError by its code", async () => {
    await i18n.changeLanguage("pt");

    expect(errorMessage(new DomainError("SLOT_UNAVAILABLE", "English"), t, "fallback")).toBe("Esse horário não está mais disponível.");
  });

  it("has a real translation for every DomainError code in every language", async () => {
    for (const language of ["en", "pt", "es"]) {
      await i18n.changeLanguage(language);

      for (const code of Object.keys(en.errors.codes) as DomainErrorCode[]) {
        const message = errorMessage(new DomainError(code, "English"), t, "fallback");

        expect(message).not.toBe("fallback");
        expect(message).not.toContain("errors.codes");
      }
    }
  });

  it("maps known Supabase auth error codes", async () => {
    await i18n.changeLanguage("es");

    expect(errorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }, t, "fallback")).toBe("Correo o contraseña incorrectos.");
  });

  it("uses the given fallback for unknown errors", () => {
    expect(errorMessage(new Error("boom"), t, "Unable to sign in.")).toBe("Unable to sign in.");
    expect(errorMessage({ code: "something_else" }, t, "Unable to sign in.")).toBe("Unable to sign in.");
    expect(errorMessage(null, t, "Unable to sign in.")).toBe("Unable to sign in.");
  });
});
