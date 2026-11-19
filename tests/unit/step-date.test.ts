import { stepDate } from "../../src/lib/dates/step-date";

describe("stepDate", () => {
  it("moves by a day", () => {
    expect(stepDate("2026-11-30", "day", 1)).toBe("2026-12-01");
    expect(stepDate("2026-03-01", "day", -1)).toBe("2026-02-28");
  });

  it("moves by a week", () => {
    expect(stepDate("2026-11-25", "week", 1)).toBe("2026-12-02");
    expect(stepDate("2026-11-03", "week", -1)).toBe("2026-10-27");
  });

  it("moves by a calendar month and clamps the day", () => {
    expect(stepDate("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(stepDate("2028-01-31", "month", 1)).toBe("2028-02-29");
    expect(stepDate("2026-03-31", "month", -1)).toBe("2026-02-28");
    expect(stepDate("2026-12-15", "month", 1)).toBe("2027-01-15");
    expect(stepDate("2026-01-15", "month", -1)).toBe("2025-12-15");
  });
});
