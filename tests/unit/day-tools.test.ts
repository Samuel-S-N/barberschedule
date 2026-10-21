import { closedDates, copyDayToOthers } from "../../src/features/shops/day-tools";

const day = { breaks: [{ end: "13:00", start: "12:00" }], enabled: true, end: "18:00", start: "09:00" };

it("copies a day to the other weekdays without sharing break arrays", () => {
  const out = copyDayToOthers({ 1: day, 2: { breaks: [], enabled: false, end: "17:00", start: "10:00" } }, 1, [2]);

  expect(out[2]).toEqual(day);
  expect(out[2].breaks).not.toBe(day.breaks);
  expect(out[1]).toBe(day);
});

it("never copies a day onto itself", () => {
  const closed = { breaks: [], enabled: false, end: "17:00", start: "10:00" };

  expect(copyDayToOthers({ 1: day, 2: closed }, 1, [1, 2])[1]).toBe(day);
});

it("a date is closed when every active barber has an all-day block", () => {
  const o = (barberId: string, localDate: string, startTime: string | null = null, kind = "block") => ({ barberId, kind, localDate, startTime });

  expect(closedDates([o("a", "2026-12-25"), o("b", "2026-12-25"), o("a", "2026-12-26"), o("b", "2026-12-24"), o("a", "2026-12-24", "10:00")], ["a", "b"], "2026-12-01")).toEqual(["2026-12-25"]);
  expect(closedDates([o("a", "2026-11-01"), o("b", "2026-11-01")], ["a", "b"], "2026-12-01")).toEqual([]);
  expect(closedDates([o("a", "2026-12-25")], [], "2026-12-01")).toEqual([]);
});
