import { fourWeekTotalCents, recurrenceLabel, sessionsPer4Weeks } from "../../src/features/recurrence/pricing";
import { planValue, recurrencePriceText } from "../../src/features/recurrence/price-text";

const t = ((key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ""}`) as never;

it("counts sessions in 4 weeks", () => {
  expect(sessionsPer4Weeks(1)).toBe(4);
  expect(sessionsPer4Weeks(2)).toBe(2);
  expect(sessionsPer4Weeks(4)).toBe(1);
});

it("totals the owner's example and hides the total when 4 weeks is not a whole number of sessions", () => {
  expect(fourWeekTotalCents(2500, 1)).toBe(10000);
  expect(fourWeekTotalCents(2500, 2)).toBe(5000);
  expect(fourWeekTotalCents(2500, 4)).toBe(2500);
  expect(fourWeekTotalCents(2500, 3)).toBeNull();
});

it("labels the common periodicities and the free ones", () => {
  expect(recurrenceLabel(t, 1)).toBe("recurrence.weekly");
  expect(recurrenceLabel(t, 2)).toBe("recurrence.biweekly");
  expect(recurrenceLabel(t, 3)).toBe('recurrence.everyNWeeks{"count":3}');
});

it("price text has the total only when it exists", () => {
  expect(recurrencePriceText(t, 2500, 1)).toContain("recurrence.fourWeeks");
  expect(recurrencePriceText(t, 2500, 3)).not.toContain("recurrence.fourWeeks");
});

describe("planValue", () => {
  const t = ((key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ""}`) as never;

  it("shows the plan's value for 4 weeks and how many sessions it covers", () => {
    expect(planValue(t, 3000, 1)).toEqual({ amountCents: 12000, caption: 'recurrence.sessionsPerMonth{"count":4}' });
    expect(planValue(t, 3000, 2)).toEqual({ amountCents: 6000, caption: 'recurrence.sessionsPerMonth{"count":2}' });
    expect(planValue(t, 3000, 4)).toEqual({ amountCents: 3000, caption: 'recurrence.sessionsPerMonth{"count":1}' });
  });

  it("falls back to the price per session when 4 weeks is not a whole number of sessions", () => {
    expect(planValue(t, 3000, 3)).toEqual({ amountCents: 3000, caption: "recurrence.perSessionCaption" });
  });
});
