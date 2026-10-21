import { en } from "../../src/i18n/locales/en";
import { es } from "../../src/i18n/locales/es";
import { pt } from "../../src/i18n/locales/pt";

const FORMAT_HINT = /\((HH:?mm|HH:?MM|YYYY-MM-DD|AAAA-MM-DD|DD\/MM\/(YYYY|AAAA)|0-100)\)/i;

function strings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key));

  return [];
}

describe.each([["en", en], ["es", es], ["pt", pt]])("%s locale", (_name, locale) => {
  it("has no format hints in any text (the example lives in the field's placeholder)", () => {
    expect(strings(locale).filter(([, text]) => FORMAT_HINT.test(text))).toEqual([]);
  });
});
