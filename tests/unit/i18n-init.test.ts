import { getLocales } from "expo-localization";

import i18n, { getCurrentLanguage, syncLanguage } from "../../src/i18n";

const mockedGetLocales = jest.mocked(getLocales);
const english = [{ languageCode: "en", languageTag: "en-US" }] as never;

describe("i18n init", () => {
  afterEach(async () => {
    mockedGetLocales.mockReturnValue(english);
    await i18n.changeLanguage("en");
  });

  it("starts synchronously in the device language", () => {
    mockedGetLocales.mockReturnValue([{ languageCode: "pt", languageTag: "pt-BR" }] as never);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require("../../src/i18n") as typeof import("../../src/i18n");

      expect(fresh.getCurrentLanguage()).toBe("pt");
      expect(fresh.default.t("tabs.home")).toBe("Início");
    });
  });

  it("re-reads the device language on syncLanguage", async () => {
    mockedGetLocales.mockReturnValue([{ languageCode: "es", languageTag: "es-ES" }] as never);
    await syncLanguage();
    expect(getCurrentLanguage()).toBe("es");

    mockedGetLocales.mockReturnValue([{ languageCode: "fr", languageTag: "fr-FR" }] as never);
    await syncLanguage();
    expect(getCurrentLanguage()).toBe("en");
  });
});
