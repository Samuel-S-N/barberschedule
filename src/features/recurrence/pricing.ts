import type { TFunction } from "i18next";

export type RecurrenceWeeks = number;

// A month is counted as 4 weeks.
export const sessionsPer4Weeks = (weeks: number) => 4 / weeks;

// null when 4 weeks is not a whole number of sessions (3, 5, 6... weeks): show only the per-session price then.
export function fourWeekTotalCents(unitCents: number, weeks: number) {
  const sessions = sessionsPer4Weeks(weeks);

  return Number.isInteger(sessions) ? unitCents * sessions : null;
}

export function recurrenceLabel(t: TFunction, weeks: number) {
  if (weeks === 1) return t("recurrence.weekly");
  if (weeks === 2) return t("recurrence.biweekly");

  return t("recurrence.everyNWeeks", { count: weeks });
}
