import { buildCalendarStripDays } from "../../src/lib/dates/calendar-strip-days";

describe("buildCalendarStripDays", () => {
  it("generates the requested number of consecutive days", () => {
    const days = buildCalendarStripDays(new Date("2026-09-18T12:00:00Z"), 3);

    expect(days).toEqual([
      { date: "2026-09-18", dayNumber: "18", weekdayLabel: "Fri" },
      { date: "2026-09-19", dayNumber: "19", weekdayLabel: "Sat" },
      { date: "2026-09-20", dayNumber: "20", weekdayLabel: "Sun" },
    ]);
  });

  it("starts from the shop-local date, not the UTC date, near a timezone boundary", () => {
    // 2026-09-19T01:00:00Z is 2026-09-18T22:00 in America/Sao_Paulo (UTC-3) —
    // still the 18th locally, even though the UTC calendar date is the 19th.
    const days = buildCalendarStripDays(new Date("2026-09-19T01:00:00Z"), 1);

    expect(days).toEqual([{ date: "2026-09-18", dayNumber: "18", weekdayLabel: "Fri" }]);
  });

  it("returns an empty array when count is 0", () => {
    expect(buildCalendarStripDays(new Date("2026-09-18T12:00:00Z"), 0)).toEqual([]);
  });
});
