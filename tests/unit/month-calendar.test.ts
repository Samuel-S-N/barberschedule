import {
  BOOKING_DAYS_AHEAD,
  addMonths,
  buildMonthGrid,
  isDateBookable,
} from "../../src/lib/dates/month-calendar";

describe("addMonths", () => {
  it.each([
    ["2026-09", 1, "2026-10"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-09", 0, "2026-09"],
  ])("%s %p -> %s", (month, delta, expected) => {
    expect(addMonths(month, delta)).toBe(expected);
  });
});

describe("isDateBookable", () => {
  const today = "2026-09-28";

  it("uses a 30 day window", () => {
    expect(BOOKING_DAYS_AHEAD).toBe(30);
  });

  it.each([
    ["2026-09-27", false],
    ["2026-09-28", true],
    ["2026-10-28", true],
    ["2026-10-29", false],
  ])("%s -> %p", (date, expected) => {
    expect(isDateBookable(date, today)).toBe(expected);
  });

  it("honours a custom window", () => {
    expect(isDateBookable("2026-09-30", today, 1)).toBe(false);
    expect(isDateBookable("2026-09-29", today, 1)).toBe(true);
  });
});

describe("buildMonthGrid", () => {
  it("pads the first and last week (September 2026 starts on a Tuesday)", () => {
    const { weeks } = buildMonthGrid("2026-09", "en");

    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(weeks[4]).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", null, null, null]);
  });

  it("fits February 2026 (Sunday to Saturday, 28 days) in exactly four full rows", () => {
    const { weeks } = buildMonthGrid("2026-02", "en");

    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every((cell) => cell !== null)).toBe(true);
    expect(weeks[3][6]).toBe("2026-02-28");
  });

  it("labels the month and the weekday columns in the requested language", () => {
    expect(buildMonthGrid("2026-09", "en").label).toBe("September 2026");
    expect(buildMonthGrid("2026-09", "pt").label).toBe("Setembro de 2026");
    expect(buildMonthGrid("2026-09", "es").label).toBe("Septiembre de 2026");
    expect(buildMonthGrid("2026-09", "en").weekdayLabels).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(buildMonthGrid("2026-09", "pt").weekdayLabels[0]).toBe("D");
  });
});
