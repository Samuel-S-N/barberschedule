import type { Language } from "../../i18n/language";
import { addLocalDays } from "./calendar-strip-days";

export const BOOKING_DAYS_AHEAD = 30;

const LOCALE: Record<Language, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

export type MonthGrid = { label: string; weekdayLabels: string[]; weeks: (string | null)[][] };

export function addMonths(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function isDateBookable(date: string, today: string, maxDaysAhead = BOOKING_DAYS_AHEAD) {
  return date >= today && date <= addLocalDays(today, maxDaysAhead);
}

export function buildMonthGrid(month: string, language: Language): MonthGrid {
  const first = new Date(`${month}-01T12:00:00Z`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);

  for (let day = 1; day <= daysInMonth; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const weekday = new Intl.DateTimeFormat(LOCALE[language], { timeZone: "UTC", weekday: "narrow" });
  // 2026-08-30 is a Sunday, so seven consecutive days from it give the Sunday-first columns.
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => weekday.format(new Date(Date.UTC(2026, 7, 30 + index, 12))));
  const label = new Intl.DateTimeFormat(LOCALE[language], { month: "long", timeZone: "UTC", year: "numeric" }).format(first);

  return { label: label.charAt(0).toUpperCase() + label.slice(1), weekdayLabels, weeks };
}
