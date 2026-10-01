import { getLocales } from "expo-localization";

const mockStore = new Map<string, string>();
let mockStorageFails = false;

jest.mock("../../src/lib/key-value-storage", () => ({
  createKeyValueStorage: () => ({
    getItem: async (key: string) => {
      if (mockStorageFails) throw new Error("storage unavailable");
      return mockStore.get(key) ?? null;
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
    setItem: async (key: string, value: string) => {
      if (mockStorageFails) throw new Error("storage unavailable");
      mockStore.set(key, value);
    },
  }),
}));

const mockedGetLocales = jest.mocked(getLocales);

function setDevice(code: string) {
  mockedGetLocales.mockReturnValue([{ languageCode: code, languageTag: code }] as never);
}

function freshI18n() {
  let module!: typeof import("../../src/i18n");

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require("../../src/i18n");
  });

  return module;
}

describe("language preference", () => {
  beforeEach(() => {
    mockStore.clear();
    mockStorageFails = false;
    setDevice("en");
  });

  it("applies a saved language although the device language differs", async () => {
    mockStore.set("barberschedule.language", "pt");
    const i18n = freshI18n();

    await i18n.loadLanguagePreference();

    expect(i18n.getLanguagePreference()).toBe("pt");
    expect(i18n.getCurrentLanguage()).toBe("pt");
  });

  it("follows the device when nothing is saved or the storage cannot be read", async () => {
    setDevice("es");
    const first = freshI18n();
    await first.loadLanguagePreference();
    expect(first.getLanguagePreference()).toBe("device");
    expect(first.getCurrentLanguage()).toBe("es");

    mockStorageFails = true;
    const second = freshI18n();
    await second.loadLanguagePreference();
    expect(second.getLanguagePreference()).toBe("device");
    expect(second.getCurrentLanguage()).toBe("es");
  });

  it("ignores a saved value it does not know", async () => {
    mockStore.set("barberschedule.language", "klingon");
    const i18n = freshI18n();

    await i18n.loadLanguagePreference();

    expect(i18n.getLanguagePreference()).toBe("device");
  });

  it("changes the language at once and saves the choice", async () => {
    const i18n = freshI18n();

    await i18n.setLanguagePreference("es");

    expect(i18n.getCurrentLanguage()).toBe("es");
    expect(i18n.default.t("tabs.home")).toBe("Inicio");
    expect(mockStore.get("barberschedule.language")).toBe("es");
  });

  it("still applies the choice for this session when saving fails", async () => {
    mockStorageFails = true;
    const i18n = freshI18n();

    await expect(i18n.setLanguagePreference("pt")).resolves.toBeUndefined();

    expect(i18n.getCurrentLanguage()).toBe("pt");
  });

  it("keeps an explicit language when the device language is re-read, and follows the device again on request", async () => {
    const i18n = freshI18n();
    await i18n.setLanguagePreference("pt");

    setDevice("es");
    await i18n.syncLanguage();
    expect(i18n.getCurrentLanguage()).toBe("pt");

    await i18n.setLanguagePreference("device");
    expect(i18n.getCurrentLanguage()).toBe("es");
    expect(mockStore.get("barberschedule.language")).toBe("device");

    setDevice("fr");
    await i18n.syncLanguage();
    expect(i18n.getCurrentLanguage()).toBe("en");
  });
});
