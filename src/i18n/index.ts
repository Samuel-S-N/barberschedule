import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { createKeyValueStorage } from "../lib/key-value-storage";
import { effectiveLanguage, parseLanguagePreference, resolveLanguage } from "./language";
import type { Language, LanguagePreference } from "./language";
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

const PREFERENCE_KEY = "barberschedule.language";
const storage = createKeyValueStorage();
let preference: LanguagePreference = "device";

function targetLanguage() {
  return effectiveLanguage(preference, getLocales()[0]?.languageCode);
}

export function getLanguagePreference() {
  return preference;
}

export async function syncLanguage() {
  const next = targetLanguage();

  if (next !== i18n.language) {
    await i18n.changeLanguage(next);
  }
}

export async function loadLanguagePreference() {
  try {
    preference = parseLanguagePreference(await storage.getItem(PREFERENCE_KEY));
  } catch {
    preference = "device";
  }

  await syncLanguage();
}

export async function setLanguagePreference(next: LanguagePreference) {
  preference = next;
  await storage.setItem(PREFERENCE_KEY, next).catch(() => undefined); // ponytail: applies for this session only if storage fails
  await syncLanguage();
}

export default i18n;
