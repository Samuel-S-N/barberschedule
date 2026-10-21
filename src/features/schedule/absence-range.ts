import { formatInstantInShopTime } from "../../lib/dates/shop-time";

const MAX_DAYS = 31;

// Inclusive ISO dates from `startDate` to `endDate` (or just `startDate`).
export function expandAbsenceDates(startDate: string, endDate: string | null) {
  const last = new Date(`${endDate ?? startDate}T12:00:00Z`);
  const dates: string[] = [];

  for (const day = new Date(`${startDate}T12:00:00Z`); day <= last && dates.length <= MAX_DAYS; day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  if (dates.length === 0 || dates.length > MAX_DAYS) throw new RangeError("ABSENCE_RANGE_INVALID");

  return dates;
}

// Open appointments that fall on the absence dates and, when a time range is given, overlap it.
export function appointmentsInAbsence<T extends { endsAt: string; startsAt: string; status: string }>(
  appointments: T[],
  dates: string[],
  startTime: string | null,
  endTime: string | null,
) {
  return appointments.filter((appointment) => {
    if (appointment.status !== "scheduled" && appointment.status !== "confirmed") return false;
    const start = formatInstantInShopTime(new Date(appointment.startsAt));
    if (!dates.includes(start.localDate)) return false;
    if (!startTime || !endTime) return true;

    return start.localTime < endTime && formatInstantInShopTime(new Date(appointment.endsAt)).localTime > startTime;
  });
}
