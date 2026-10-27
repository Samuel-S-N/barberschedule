// "2026-10-05" -> "05/10". Dates here are shop-local calendar dates, so no timezone maths is involved.
export function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split("-");

  return `${day}/${month}`;
}
