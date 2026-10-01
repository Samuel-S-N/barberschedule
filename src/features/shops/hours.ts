import type { Language } from "../../i18n/language";
import { formatWeekdayShort } from "../../lib/i18n/format";

export type Period = { end: string; start: string };
export type ShopPeriod = Period & { weekday: number };
export type DayDraft = { breaks: Period[]; enabled: boolean; end: string; start: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// A break is the gap between two periods of the same day, so a draft with breaks becomes several periods.
export function draftToPeriods(day: DayDraft):
  | { ok: true; periods: Period[] }
  | { error: "break" | "range" | "time"; ok: false } {
  if (!day.enabled) return { ok: true, periods: [] };
  const times = [day.start, day.end, ...day.breaks.flatMap((pause) => [pause.start, pause.end])];
  if (!times.every((value) => TIME.test(value))) return { error: "time", ok: false };
  if (day.start >= day.end) return { error: "range", ok: false };

  const periods: Period[] = [];
  let cursor = day.start;
  for (const pause of [...day.breaks].sort((a, b) => a.start.localeCompare(b.start))) {
    if (pause.start >= pause.end || pause.start <= cursor || pause.end >= day.end) return { error: "break", ok: false };
    periods.push({ end: pause.start, start: cursor });
    cursor = pause.end;
  }
  periods.push({ end: day.end, start: cursor });

  return { ok: true, periods };
}

export function periodsToDraft(periods: Period[]): DayDraft {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.length === 0) return { breaks: [], enabled: false, end: "18:00", start: "09:00" };

  return {
    breaks: sorted.slice(1).map((period, index) => ({ end: period.start, start: sorted[index].end })),
    enabled: true,
    end: sorted[sorted.length - 1].end,
    start: sorted[0].start,
  };
}

export function formatPeriods(periods: Period[]) {
  return periods.map((period) => `${period.start}–${period.end}`).join(" · ");
}

export function groupWeek(rows: ShopPeriod[]) {
  const groups: Array<{ from: number; periods: Period[]; to: number }> = [];
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const periods = rows
      .filter((row) => row.weekday === weekday)
      .map(({ end, start }) => ({ end, start }))
      .sort((a, b) => a.start.localeCompare(b.start));
    if (periods.length === 0) continue;
    const last = groups[groups.length - 1];
    if (last && last.to === weekday - 1 && formatPeriods(last.periods) === formatPeriods(periods)) {
      last.to = weekday;
    } else {
      groups.push({ from: weekday, periods, to: weekday });
    }
  }

  return groups;
}

// 2026-01-05 is a Monday, so weekday 1..7 maps to the 5th..11th.
export function weekdayLabel(weekday: number, language: Language) {
  return formatWeekdayShort(`2026-01-${String(4 + weekday).padStart(2, "0")}`, language);
}
