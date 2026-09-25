import type { Language } from "../../i18n/language";
import { formatWeekdayShort } from "../i18n/format";
import { formatInstantInShopTime } from "./shop-time";
import type { CalendarStripDay } from "../../components/domain/CalendarStrip";

function addLocalDays(localDate: string, days: number): string {
  const anchor = new Date(`${localDate}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

export function buildCalendarStripDays(startInstant: Date, count: number, language: Language = "en"): CalendarStripDay[] {
  const startLocalDate = formatInstantInShopTime(startInstant).localDate;

  return Array.from({ length: count }, (_, index) => {
    const date = addLocalDays(startLocalDate, index);

    return {
      date,
      dayNumber: date.slice(8, 10),
      weekdayLabel: formatWeekdayShort(date, language),
    };
  });
}
