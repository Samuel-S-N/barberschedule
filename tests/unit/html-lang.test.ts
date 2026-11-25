import i18n, { setLanguagePreference } from "../../src/i18n";
import { htmlLang } from "../../src/i18n/language";

describe("htmlLang", () => {
  it.each([["pt", "pt-BR"], ["en", "en"], ["es", "es"]] as const)("%s -> %s", (language, expected) => {
    expect(htmlLang(language)).toBe(expected);
  });
});

describe("document language", () => {
  const root = { lang: "" };

  beforeAll(() => {
    (globalThis as { document?: unknown }).document = { documentElement: root };
  });
  afterAll(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("follows i18n when the language changes", async () => {
    await i18n.changeLanguage("es");
    expect(root.lang).toBe("es");

    await i18n.changeLanguage("pt");
    expect(root.lang).toBe("pt-BR");
  });

  it("follows the Settings choice", async () => {
    await setLanguagePreference("en");
    expect(root.lang).toBe("en");

    await setLanguagePreference("pt");
    expect(root.lang).toBe("pt-BR");
  });
});

describe("without a document (native, static export)", () => {
  it("changing the language does not throw", async () => {
    await expect(i18n.changeLanguage("en")).resolves.toBeDefined();
  });
});
