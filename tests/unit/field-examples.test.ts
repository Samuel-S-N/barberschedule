import { en } from "../../src/i18n/locales/en";
import { es } from "../../src/i18n/locales/es";
import { pt } from "../../src/i18n/locales/pt";

const KEYS = ["date", "time", "fullName", "nickname", "email", "phone", "money", "minutes", "percent", "notes", "note", "bio", "search", "serviceName", "description", "address"] as const;

describe.each([["en", en], ["es", es], ["pt", pt]])("%s examples", (_name, locale) => {
  it.each(KEYS)("has a non-empty example for %s", (key) => {
    expect(locale.examples[key].trim().length).toBeGreaterThan(0);
  });
});

it("date examples follow the language's date format", () => {
  expect(en.examples.date).toBe("2026-10-25");
  expect(pt.examples.date).toBe("25/10/2026");
  expect(es.examples.date).toBe("25/10/2026");
});
