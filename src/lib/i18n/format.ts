import type { Language } from "../../i18n/language";

const WEEKDAY_LOCALE: Record<Language, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };
const DATE_LOCALE: Record<Language, string> = { en: "en-GB", es: "es-ES", pt: "pt-BR" };

function noonUtc(localDate: string) {
  return new Date(`${localDate}T12:00:00Z`);
}

export function formatWeekdayShort(localDate: string, language: Language) {
  return new Intl.DateTimeFormat(WEEKDAY_LOCALE[language], { timeZone: "UTC", weekday: "short" }).format(noonUtc(localDate));
}

export function formatDateLabel(localDate: string, language: Language) {
  const text = new Intl.DateTimeFormat(DATE_LOCALE[language], {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(noonUtc(localDate));

  return language === "en" ? text.replace(/^(\w+),? /, "$1, ") : text;
}
