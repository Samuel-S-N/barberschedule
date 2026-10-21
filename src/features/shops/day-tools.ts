import type { DayDraft } from "./hours";

// Copy one weekday's hours (and breaks) onto other weekdays, never onto itself.
export function copyDayToOthers(days: Record<number, DayDraft>, fromWeekday: number, targets: number[]) {
  const source = days[fromWeekday];
  const next = { ...days };

  for (const weekday of targets) {
    if (weekday !== fromWeekday) next[weekday] = { ...source, breaks: source.breaks.map((pause) => ({ ...pause })), enabled: true };
  }

  return next;
}

type Override = { barberId: string; kind: string; localDate: string; startTime: string | null };

// Dates (today or later) on which every active barber has an all-day block, i.e. the shop is closed.
export function closedDates(overrides: Override[], activeBarberIds: string[], today: string) {
  if (activeBarberIds.length === 0) return [];
  const byDate = new Map<string, Set<string>>();

  for (const override of overrides) {
    if (override.kind !== "block" || override.startTime !== null || override.localDate < today) continue;
    byDate.set(override.localDate, (byDate.get(override.localDate) ?? new Set()).add(override.barberId));
  }

  return [...byDate].filter(([, ids]) => activeBarberIds.every((id) => ids.has(id))).map(([date]) => date).sort();
}
