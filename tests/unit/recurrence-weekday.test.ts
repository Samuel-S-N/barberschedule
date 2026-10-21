import { isoWeekday, nextDateForWeekday } from "../../src/features/recurrence/weekday";

it("numbers weekdays Monday=1 to Sunday=7", () => {
  expect(isoWeekday("2026-10-19")).toBe(1); // Monday
  expect(isoWeekday("2026-10-21")).toBe(3); // Wednesday
  expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
});

it("the next date for a weekday is after today, never today", () => {
  expect(nextDateForWeekday("2026-10-21", 3)).toBe("2026-10-28"); // today is Wednesday: next Wednesday
  expect(nextDateForWeekday("2026-10-21", 4)).toBe("2026-10-22");
  expect(nextDateForWeekday("2026-10-21", 2)).toBe("2026-10-27");
  expect(nextDateForWeekday("2026-10-21", 1)).toBe("2026-10-26");
  expect(nextDateForWeekday("2026-12-31", 4)).toBe("2027-01-07");
});
