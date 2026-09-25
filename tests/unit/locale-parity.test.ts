import { en } from "../../src/i18n/locales/en";
import { es } from "../../src/i18n/locales/es";
import { pt } from "../../src/i18n/locales/pt";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? { ...acc, [path]: child } : { ...acc, ...flatten(child, path) };
  }, {});
}

const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, "")).sort();

describe.each([
  ["pt", pt],
  ["es", es],
])("%s resources", (_name, resource) => {
  const base = flatten(en);
  const other = flatten(resource);

  it("has exactly the same keys as en", () => {
    expect(Object.keys(other).sort()).toEqual(Object.keys(base).sort());
  });

  it("has no empty strings", () => {
    expect(Object.entries(other).filter(([, text]) => text.trim() === "")).toEqual([]);
  });

  it("keeps the same {{placeholders}} as en for every key", () => {
    const mismatched = Object.keys(base).filter((key) => JSON.stringify(placeholders(base[key])) !== JSON.stringify(placeholders(other[key] ?? "")));

    expect(mismatched).toEqual([]);
  });
});

describe("en resources", () => {
  it("has no empty strings", () => {
    expect(Object.entries(flatten(en)).filter(([, text]) => text.trim() === "")).toEqual([]);
  });

  it("defines a title and body for every legal section", () => {
    const keys = Object.keys(flatten(en));

    for (const key of ["collect", "why", "who", "rights", "contact"]) {
      expect(keys).toContain(`legal.sections.${key}.title`);
      expect(keys).toContain(`legal.sections.${key}.body`);
    }
  });
});
