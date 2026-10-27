import type { PayoutScheduleConfig } from "./types";

const inRange = (value: number | null, min: number, max: number) => value !== null && Number.isInteger(value) && value >= min && value <= max;

export function isValidSchedule({ day1, day2, schedule }: PayoutScheduleConfig): boolean {
  if (schedule === "none") return day1 === null && day2 === null;
  if (schedule === "weekly") return inRange(day1, 0, 6) && day2 === null;
  if (schedule === "biweekly") return inRange(day1, 1, 31) && inRange(day2, 1, 31) && (day1 as number) < (day2 as number);

  return inRange(day1, 1, 31) && day2 === null;
}

// Resolved by the caller with `t(key, params)`; the weekly case carries the key of the weekday phrase ("toda segunda").
export function describeSchedule({ day1, day2, schedule }: PayoutScheduleConfig): { key: string; params: Record<string, number | string> } {
  if (schedule === "weekly") return { key: "payouts.schedule.weekly", params: { weekdayKey: `payouts.everyWeekday.${day1}` } };
  if (schedule === "biweekly") return { key: "payouts.schedule.biweekly", params: { day1: day1 as number, day2: day2 as number } };
  if (schedule === "monthly") return { key: "payouts.schedule.monthly", params: { day: day1 as number } };

  return { key: "payouts.schedule.none", params: {} };
}

type Translate = (key: never, options?: never) => string;

// The full sentence for a schedule. The weekly phrase ("toda segunda") is its own translation, resolved here.
export function scheduleText(t: Translate, config: PayoutScheduleConfig): string {
  const { key, params } = describeSchedule(config);
  const translate = t as unknown as (k: string, o?: unknown) => string;
  const weekdayKey = params.weekdayKey;

  return translate(key, weekdayKey ? { ...params, weekdayKey: translate(String(weekdayKey)) } : params);
}
