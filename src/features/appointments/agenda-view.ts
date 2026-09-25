import type { CalendarStripDay } from "../../components/domain/CalendarStrip";
import type { Language } from "../../i18n/language";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { formatDateLabel } from "../../lib/i18n/format";
import type { Appointment } from "./types";

export function groupByLocalDate(appointments: Appointment[]) {
  const grouped = new Map<string, Appointment[]>();
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  for (const appointment of sorted) {
    const { localDate } = formatInstantInShopTime(new Date(appointment.startsAt));
    grouped.set(localDate, [...(grouped.get(localDate) ?? []), appointment]);
  }

  return grouped;
}

export function formatAppointmentLabels(appointment: Appointment, language: Language = "en") {
  const { localDate, localTime } = formatInstantInShopTime(new Date(appointment.startsAt));

  return {
    dateLabel: formatDateLabel(localDate, language),
    timeLabel: localTime,
  };
}

export function markAppointmentDays(days: CalendarStripDay[], grouped: Map<string, Appointment[]>) {
  return days.map((day) => ({ ...day, hasAppointment: grouped.has(day.date) }));
}

export function pickInitialDate(days: CalendarStripDay[], grouped: Map<string, Appointment[]>) {
  return days.find((day) => grouped.has(day.date))?.date ?? days[0].date;
}
