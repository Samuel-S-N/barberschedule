import { fourWeekTotalCents, recurrenceLabelKey, sessionsPer4Weeks } from "../../src/features/recurrence/pricing";

it("counts sessions in 4 weeks", () => {
  expect(sessionsPer4Weeks(1)).toBe(4);
  expect(sessionsPer4Weeks(2)).toBe(2);
});

it("totals the owner's example: weekly 25 → 100", () => {
  expect(fourWeekTotalCents(2500, 1)).toBe(10000);
  expect(fourWeekTotalCents(2500, 2)).toBe(5000);
});

it("labels", () => {
  expect(recurrenceLabelKey(1)).toBe("recurrence.weekly");
  expect(recurrenceLabelKey(2)).toBe("recurrence.biweekly");
});
