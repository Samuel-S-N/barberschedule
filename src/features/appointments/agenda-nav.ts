export type AgendaNavView = "day" | "week" | "month";

const SUFFIX = { day: "Day", month: "Month", week: "Week" } as const;

// i18n keys for the owner agenda title and the previous/next buttons of the selected view.
export function agendaNavKeys<V extends AgendaNavView>(view: V) {
  const suffix = SUFFIX[view];

  return {
    next: `owner.agenda.next${suffix}` as const,
    previous: `owner.agenda.previous${suffix}` as const,
    // The day view already shows its date in the date box, so it has no range line.
    range: (view === "day" ? null : `owner.agenda.range${suffix}`) as "owner.agenda.rangeMonth" | "owner.agenda.rangeWeek" | null,
    title: `owner.agenda.title${suffix}` as const,
  };
}
