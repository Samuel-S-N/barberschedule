import type { CalendarStripDay } from "../../components/domain/CalendarStrip";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import type { Appointment } from "./types";

const labelFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", timeZone: "UTC", weekday: "short",
});

export function groupByLocalDate(appointments: Appointment[]) {
  const grouped = new Map<string, Appointment[]>();
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  for (const appointment of sorted) {
    const { localDate } = formatInstantInShopTime(new Date(appointment.startsAt));
    grouped.set(localDate, [...(grouped.get(localDate) ?? []), appointment]);
  }

  return grouped;
}

export function formatAppointmentLabels(appointment: Appointment) {
  const { localDate, localTime } = formatInstantInShopTime(new Date(appointment.startsAt));

  return {
    dateLabel: labelFormatter.format(new Date(`${localDate}T12:00:00Z`)).replace(/^(\w+),? /, "$1, "),
    timeLabel: localTime,
  };
}

export function markAppointmentDays(days: CalendarStripDay[], grouped: Map<string, Appointment[]>) {
  return days.map((day) => ({ ...day, hasAppointment: grouped.has(day.date) }));
}

export function pickInitialDate(days: CalendarStripDay[], grouped: Map<string, Appointment[]>) {
  return days.find((day) => grouped.has(day.date))?.date ?? days[0].date;
}
