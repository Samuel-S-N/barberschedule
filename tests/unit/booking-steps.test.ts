import { BOOKING_STEPS, stepHref, stepNumber } from "../../src/features/booking/steps";

it("numbers the six steps", () => {
  expect(BOOKING_STEPS).toHaveLength(6);
  expect(stepNumber("professional")).toBe(1);
  expect(stepNumber("time")).toBe(4);
  expect(stepNumber("confirm")).toBe(6);
});

it("builds the route of a completed step from the choices so far", () => {
  const ids = { professionalId: "b 1", professionalServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" };

  expect(stepHref("professional", ids)).toBe("/book/professional?shopId=s1");
  expect(stepHref("service", ids)).toBe("/book/service?shopId=s1&professionalId=b%201");
  expect(stepHref("date", ids)).toBe("/book/date?shopId=s1&professionalId=b%201&professionalServiceId=bs1");
  expect(stepHref("time", ids)).toBe("/book/time?shopId=s1&professionalId=b%201&professionalServiceId=bs1&localDate=2026-11-02");
});

it("returns null when a needed choice is missing or the step has no screen", () => {
  expect(stepHref("service", { shopId: "s1" })).toBeNull();
  expect(stepHref("date", { professionalId: "b1", shopId: "s1" })).toBeNull();
  expect(stepHref("review", { professionalId: "b1", professionalServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" })).toBeNull();
  expect(stepHref("confirm", { shopId: "s1" })).toBeNull();
});
