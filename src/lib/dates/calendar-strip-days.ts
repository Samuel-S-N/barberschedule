import { formatInstantInShopTime } from "./shop-time";
import type { CalendarStripDay } from "../../components/domain/CalendarStrip";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });

function addLocalDays(localDate: string, days: number): string {
  const anchor = new Date(`${localDate}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

export function buildCalendarStripDays(startInstant: Date, count: number): CalendarStripDay[] {
  const startLocalDate = formatInstantInShopTime(startInstant).localDate;

  return Array.from({ length: count }, (_, index) => {
    const date = addLocalDays(startLocalDate, index);
    const anchor = new Date(`${date}T12:00:00Z`);

    return {
      date,
      dayNumber: date.slice(8, 10),
      weekdayLabel: weekdayFormatter.format(anchor),
    };
  });
}
