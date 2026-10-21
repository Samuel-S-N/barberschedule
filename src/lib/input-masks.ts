import type { Language } from "../i18n/language";

const digits = (text: string) => text.replace(/\D/g, "");

export function formatDateInput(input: string, language: Language) {
  const d = digits(input).slice(0, 8);
  const parts = language === "en" ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)];

  return parts.filter(Boolean).join(language === "en" ? "-" : "/");
}

export function parseDateInput(display: string, language: Language) {
  const d = digits(display);
  if (d.length !== 8) return null;

  const [year, month, day] = language === "en" ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [d.slice(4, 8), d.slice(2, 4), d.slice(0, 2)];
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);

  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function formatTimeInput(input: string) {
  const d = digits(input).slice(0, 4);

  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}
