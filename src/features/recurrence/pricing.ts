export type RecurrenceWeeks = 1 | 2;

// A month is counted as 4 weeks: weekly = 4 sessions, every 2 weeks = 2 sessions.
export const sessionsPer4Weeks = (weeks: RecurrenceWeeks) => 4 / weeks;
export const fourWeekTotalCents = (unitCents: number, weeks: RecurrenceWeeks) => unitCents * sessionsPer4Weeks(weeks);
export const recurrenceLabelKey = (weeks: number) => (weeks === 1 ? ("recurrence.weekly" as const) : ("recurrence.biweekly" as const));
