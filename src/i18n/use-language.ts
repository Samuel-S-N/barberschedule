import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getLanguagePreference, setLanguagePreference } from "./index";
import { resolveLanguage } from "./language";
import type { Language, LanguagePreference } from "./language";

export function useLanguage(): Language {
  const { i18n } = useTranslation();

  return resolveLanguage(i18n.language);
}

// The saved preference is applied before the first screen (AppProviders), so the initial state is already right.
export function useLanguagePreference() {
  const [preference, setPreference] = useState<LanguagePreference>(getLanguagePreference());

  const choose = async (next: LanguagePreference) => {
    setPreference(next);
    await setLanguagePreference(next);
  };

  return [preference, choose] as const;
}
