import { BOOKING_STEPS, stepHref, stepNumber } from "../../src/features/booking/steps";

it("numbers the six steps", () => {
  expect(BOOKING_STEPS).toHaveLength(6);
  expect(stepNumber("barber")).toBe(1);
  expect(stepNumber("time")).toBe(4);
  expect(stepNumber("confirm")).toBe(6);
});

it("builds the route of a completed step from the choices so far", () => {
  const ids = { barberId: "b 1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" };

  expect(stepHref("barber", ids)).toBe("/book/barber?shopId=s1");
  expect(stepHref("service", ids)).toBe("/book/service?shopId=s1&barberId=b%201");
  expect(stepHref("date", ids)).toBe("/book/date?shopId=s1&barberId=b%201&barberServiceId=bs1");
  expect(stepHref("time", ids)).toBe("/book/time?shopId=s1&barberId=b%201&barberServiceId=bs1&localDate=2026-11-02");
});

it("returns null when a needed choice is missing or the step has no screen", () => {
  expect(stepHref("service", { shopId: "s1" })).toBeNull();
  expect(stepHref("date", { barberId: "b1", shopId: "s1" })).toBeNull();
  expect(stepHref("review", { barberId: "b1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" })).toBeNull();
  expect(stepHref("confirm", { shopId: "s1" })).toBeNull();
});
