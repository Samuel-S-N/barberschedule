import { useTranslation } from "react-i18next";

import { resolveLanguage } from "./language";
import type { Language } from "./language";

export function useLanguage(): Language {
  const { i18n } = useTranslation();

  return resolveLanguage(i18n.language);
}
