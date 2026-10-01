import { effectiveLanguage, parseLanguagePreference, resolveLanguage } from "../../src/i18n/language";

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

describe("language preference", () => {
  it.each([
    ["pt", "pt"], ["es", "es"], ["en", "en"], ["device", "device"],
    ["fr", "device"], ["", "device"], [null, "device"], [undefined, "device"],
  ])("parses %p as %p", (raw, expected) => {
    expect(parseLanguagePreference(raw)).toBe(expected);
  });

  it("follows the device only for the device preference", () => {
    expect(effectiveLanguage("device", "pt-BR")).toBe("pt");
    expect(effectiveLanguage("device", "fr")).toBe("en");
    expect(effectiveLanguage("es", "pt-BR")).toBe("es");
  });
});
