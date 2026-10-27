import { describeSchedule, isValidSchedule, scheduleText } from "../../src/features/payouts/schedule";

describe("isValidSchedule", () => {
  it("accepts none without days", () => expect(isValidSchedule({ day1: null, day2: null, schedule: "none" })).toBe(true));
  it("rejects none with a day", () => expect(isValidSchedule({ day1: 3, day2: null, schedule: "none" })).toBe(false));
  it("weekly needs a weekday 0 to 6", () => {
    expect(isValidSchedule({ day1: 0, day2: null, schedule: "weekly" })).toBe(true);
    expect(isValidSchedule({ day1: 7, day2: null, schedule: "weekly" })).toBe(false);
    expect(isValidSchedule({ day1: null, day2: null, schedule: "weekly" })).toBe(false);
  });
  it("biweekly needs two ascending days of the month", () => {
    expect(isValidSchedule({ day1: 5, day2: 20, schedule: "biweekly" })).toBe(true);
    expect(isValidSchedule({ day1: 20, day2: 5, schedule: "biweekly" })).toBe(false);
    expect(isValidSchedule({ day1: 5, day2: 5, schedule: "biweekly" })).toBe(false);
    expect(isValidSchedule({ day1: 5, day2: 32, schedule: "biweekly" })).toBe(false);
  });
  it("monthly needs one day 1 to 31", () => {
    expect(isValidSchedule({ day1: 31, day2: null, schedule: "monthly" })).toBe(true);
    expect(isValidSchedule({ day1: 0, day2: null, schedule: "monthly" })).toBe(false);
  });
});

describe("describeSchedule", () => {
  it("returns a translation key and params", () => {
    expect(describeSchedule({ day1: 1, day2: null, schedule: "weekly" })).toEqual({ key: "payouts.schedule.weekly", params: { weekdayKey: "payouts.everyWeekday.1" } });
    expect(describeSchedule({ day1: 5, day2: 20, schedule: "biweekly" })).toEqual({ key: "payouts.schedule.biweekly", params: { day1: 5, day2: 20 } });
    expect(describeSchedule({ day1: 15, day2: null, schedule: "monthly" })).toEqual({ key: "payouts.schedule.monthly", params: { day: 15 } });
    expect(describeSchedule({ day1: null, day2: null, schedule: "none" })).toEqual({ key: "payouts.schedule.none", params: {} });
  });
});

describe("scheduleText", () => {
  const t = (key: string, options?: Record<string, unknown>) => `${key}|${JSON.stringify(options ?? {})}`;

  it("resolves the weekday phrase before building the weekly sentence", () => {
    expect(scheduleText(t as never, { day1: 1, day2: null, schedule: "weekly" })).toBe('payouts.schedule.weekly|{"weekdayKey":"payouts.everyWeekday.1|{}"}');
  });

  it("passes plain params for the other schedules", () => {
    expect(scheduleText(t as never, { day1: 15, day2: null, schedule: "monthly" })).toBe('payouts.schedule.monthly|{"day":15}');
    expect(scheduleText(t as never, { day1: null, day2: null, schedule: "none" })).toBe("payouts.schedule.none|{}");
  });
});
