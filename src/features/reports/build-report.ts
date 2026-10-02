import { addLocalDays } from "../../lib/dates/calendar-strip-days";

export type ReportDay = { cancelled: number; completed: number; date: string; earningsCents: number; noShow: number; upcoming: number };
export type ReportService = { completed: number; name: string; serviceId: string };
export type BarberReport = { days: ReportDay[]; services: ReportService[] };
export type ReportTotals = { cancelled: number; cancellationRate: number | null; completed: number; earningsCents: number; noShow: number; upcoming: number };
export type SeriesPoint = { from: string; key: string; value: number };
export type DonutItem = { key: string; name: string; value: number };

// Longer ranges are shown per week so the chart stays readable.
export const WEEKLY_THRESHOLD_DAYS = 31;

export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
}

export function previousRange(start: string, end: string) {
  return { end: addLocalDays(start, -1), start: addLocalDays(start, -daysBetween(start, end)) };
}

export function sumDays(days: ReportDay[]): ReportTotals {
  const totals = days.reduce(
    (sum, d) => ({
      cancelled: sum.cancelled + d.cancelled,
      completed: sum.completed + d.completed,
      earningsCents: sum.earningsCents + d.earningsCents,
      noShow: sum.noShow + d.noShow,
      upcoming: sum.upcoming + d.upcoming,
    }),
    { cancelled: 0, completed: 0, earningsCents: 0, noShow: 0, upcoming: 0 },
  );
  const closed = totals.completed + totals.cancelled + totals.noShow;

  return { ...totals, cancellationRate: closed === 0 ? null : (totals.cancelled + totals.noShow) / closed };
}

export function percentChange(current: number, previous: number) {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

export function dailySeries(days: ReportDay[], start: string, end: string, pick: (day: ReportDay) => number): SeriesPoint[] {
  const length = daysBetween(start, end);
  const byDate = new Map(days.map((d) => [d.date, pick(d)]));
  const bucket = length > WEEKLY_THRESHOLD_DAYS ? 7 : 1;
  const points: SeriesPoint[] = [];

  for (let offset = 0; offset < length; offset += bucket) {
    let value = 0;
    for (let i = offset; i < Math.min(offset + bucket, length); i += 1) value += byDate.get(addLocalDays(start, i)) ?? 0;
    const from = addLocalDays(start, offset);
    points.push({ from, key: from, value });
  }

  return points;
}

// Monday first.
export function weekdayCounts(days: ReportDay[]) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) counts[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7] += d.completed;

  return counts;
}

export function topServices(services: ReportService[], max = 4): DonutItem[] {
  const sorted = [...services].sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));
  const head = sorted.slice(0, max).map((s) => ({ key: s.serviceId, name: s.name, value: s.completed }));
  const rest = sorted.slice(max).reduce((sum, s) => sum + s.completed, 0);

  return rest > 0 ? [...head, { key: "other", name: "", value: rest }] : head;
}
