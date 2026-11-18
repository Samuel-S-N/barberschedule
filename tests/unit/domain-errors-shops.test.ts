import i18n from "../../src/i18n";
import { errorMessage } from "../../src/i18n/errors";
import { toDomainError } from "../../src/lib/errors/domain-errors";

describe("shop creation errors", () => {
  it.each([
    ["P0041", "SHOP_SLUG_INVALID"],
    ["P0042", "SHOP_OWNER_INVALID"],
  ])("%s maps to %s", (pgCode, domainCode) => {
    expect(toDomainError({ code: pgCode }).code).toBe(domainCode);
  });

  it.each([
    ["en", "SHOP_SLUG_INVALID", "That business link is taken or not allowed."],
    ["pt", "SHOP_OWNER_INVALID", "Esta conta não pode ser dona de um novo estabelecimento."],
    ["es", "SHOP_SLUG_INVALID", "Ese enlace del negocio está en uso o no es válido."],
  ])("%s translates %s", async (language, code, text) => {
    await i18n.changeLanguage(language);

    expect(errorMessage({ code }, i18n.t as never, "fallback")).toBe(text);
    await i18n.changeLanguage("en");
  });
});
