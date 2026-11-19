export type AgendaNavView = "day" | "week" | "month";

const SUFFIX = { day: "Day", month: "Month", week: "Week" } as const;

// i18n keys for the owner agenda title and range line of the selected view (the arrows live in DateField).
export function agendaNavKeys<V extends AgendaNavView>(view: V) {
  const suffix = SUFFIX[view];

  return {
    // The day view already shows its date in the date box, so it has no range line.
    range: (view === "day" ? null : `owner.agenda.range${suffix}`) as "owner.agenda.rangeMonth" | "owner.agenda.rangeWeek" | null,
    title: `owner.agenda.title${suffix}` as const,
  };
}
