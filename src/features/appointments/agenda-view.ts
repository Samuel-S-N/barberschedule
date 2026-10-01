import type { CalendarStripDay } from "../../components/domain/CalendarStrip";
import type { Language } from "../../i18n/language";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { formatDateLabel } from "../../lib/i18n/format";
import type { Appointment } from "./types";

export function groupByLocalDate<T extends Appointment>(appointments: T[]) {
  const grouped = new Map<string, T[]>();
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

export function markAppointmentDays(days: CalendarStripDay[], grouped: Map<string, unknown[]>) {
  return days.map((day) => ({ ...day, hasAppointment: grouped.has(day.date) }));
}

export function visibleAppointments<T extends Appointment>(grouped: Map<string, T[]>, selectedDate: string | null) {
  return selectedDate ? grouped.get(selectedDate) ?? [] : [...grouped.values()].flat();
}

export function pendingClosure<T extends Appointment>(appointments: T[], now = new Date()) {
  return appointments
    .filter((a) => (a.status === "scheduled" || a.status === "confirmed") && new Date(a.endsAt) < now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
