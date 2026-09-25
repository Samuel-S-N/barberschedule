import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { resolveLanguage } from "./language";
import type { Language } from "./language";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { pt } from "./locales/pt";

function deviceLanguage(): Language {
  return resolveLanguage(getLocales()[0]?.languageCode);
}

void i18n.use(initReactI18next).init({
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false },
  lng: deviceLanguage(),
  resources: { en: { translation: en }, es: { translation: es }, pt: { translation: pt } },
});

export function getCurrentLanguage(): Language {
  return resolveLanguage(i18n.language);
}

export async function syncLanguage() {
  const next = deviceLanguage();

  if (next !== i18n.language) {
    await i18n.changeLanguage(next);
  }
}

export default i18n;
