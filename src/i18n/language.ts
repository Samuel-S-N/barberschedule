export type Language = "pt" | "en" | "es";

export function resolveLanguage(code: string | null | undefined): Language {
  const base = (code ?? "").toLowerCase().split(/[-_]/)[0];

  return base === "pt" || base === "es" ? base : "en";
}

export type LanguagePreference = "device" | Language;

export function parseLanguagePreference(value: string | null | undefined): LanguagePreference {
  return value === "pt" || value === "es" || value === "en" ? value : "device";
}

export function effectiveLanguage(preference: LanguagePreference, deviceCode: string | null | undefined): Language {
  return preference === "device" ? resolveLanguage(deviceCode) : preference;
}

// The app's Portuguese is Brazilian; the other two are written without a region.
export function htmlLang(language: Language): string {
  return language === "pt" ? "pt-BR" : language;
}
