// Monday = 1 ... Sunday = 7, from a local date (YYYY-MM-DD).
export function isoWeekday(localDate: string) {
  const day = new Date(`${localDate}T12:00:00Z`).getUTCDay();

  return day === 0 ? 7 : day;
}

// The first date after `today` that falls on `weekday` (1-7 days ahead, never today).
export function nextDateForWeekday(today: string, weekday: number) {
  const ahead = ((weekday - isoWeekday(today) + 6) % 7) + 1;
  const date = new Date(`${today}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + ahead);

  return date.toISOString().slice(0, 10);
}
