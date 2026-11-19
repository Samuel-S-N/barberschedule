import { addLocalDays } from "./calendar-strip-days";
import { addMonths } from "./month-calendar";

export type StepUnit = "day" | "week" | "month";

// The date one step away: a day, a week, or a calendar month (the day of the month is kept, or clamped to the last day of a shorter month).
export function stepDate(date: string, unit: StepUnit, direction: -1 | 1): string {
  if (unit === "day") return addLocalDays(date, direction);
  if (unit === "week") return addLocalDays(date, direction * 7);

  const month = addMonths(date.slice(0, 7), direction);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return `${month}-${String(Math.min(Number(date.slice(8)), lastDay)).padStart(2, "0")}`;
}
