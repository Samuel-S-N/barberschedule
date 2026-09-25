import { resolveLanguage } from "../../src/i18n/language";

describe("resolveLanguage", () => {
  it.each([
    ["pt", "pt"],
    ["pt-BR", "pt"],
    ["PT", "pt"],
    ["pt_PT", "pt"],
    ["es", "es"],
    ["es-419", "es"],
    ["en", "en"],
    ["en-US", "en"],
    ["fr", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
  ])("resolves %p to %p", (code, expected) => {
    expect(resolveLanguage(code)).toBe(expected);
  });
});
