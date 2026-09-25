import { en } from "../../i18n/locales/en";

export const TERMS_VERSION = "2026-09-23";

export const LEGAL_SECTION_KEYS = ["collect", "why", "who", "rights", "contact"] as const;

// Temporary until app/legal.tsx reads the sections through t().
export const LEGAL_SECTIONS = LEGAL_SECTION_KEYS.map((key) => ({
  body: en.legal.sections[key].body,
  title: en.legal.sections[key].title,
}));
