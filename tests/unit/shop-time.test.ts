import {
  formatInstantInShopTime,
  localDateTimeToInstant,
} from "../../src/lib/dates/shop-time";
import {
  assertNoOverlappingWorkingPeriod,
  parseScheduleOverrideInput,
  parseWorkingPeriodInput,
} from "../../src/features/schedule/validation";

const shopId = "11111111-1111-4111-8111-111111111111";
const barberId = "22222222-2222-4222-8222-222222222222";

describe("shop-local schedule helpers", () => {
  it("converts America/Sao_Paulo local date and time to and from an instant", () => {
    expect(localDateTimeToInstant("2026-08-13", "09:30").toISOString()).toBe(
      "2026-08-13T12:30:00.000Z",
    );
    expect(
      formatInstantInShopTime(new Date("2026-08-13T12:30:00.000Z")),
    ).toEqual({ localDate: "2026-08-13", localTime: "09:30" });
  });

  it("rejects a historic Sao Paulo DST-gap local time", () => {
    expect(() => localDateTimeToInstant("2018-11-04", "00:30")).toThrow(
      "Local date and time do not exist in the shop timezone.",
    );
  });

  it("chooses the earlier instant for a historic Sao Paulo ambiguous local time", () => {
    expect(localDateTimeToInstant("2019-02-16", "23:30").toISOString()).toBe(
      "2019-02-17T01:30:00.000Z",
    );
  });

  it("rejects malformed and zero-length working periods", () => {
    expect(() =>
      parseWorkingPeriodInput({
        barberId,
        endTime: "09:00",
        shopId,
        startTime: "09:00",
        weekday: 1,
      }),
    ).toThrow("End time must be after start time.");

    expect(() =>
      parseWorkingPeriodInput({
        barberId,
        endTime: "10:00",
        shopId,
        startTime: "9:00",
        weekday: 1,
      }),
    ).toThrow("Time must use HH:mm.");
  });

  it("rejects working periods that overlap an existing period on the same weekday", () => {
    const existing = parseWorkingPeriodInput({
      barberId,
      endTime: "12:00",
      shopId,
      startTime: "09:00",
      weekday: 1,
    });
    const overlapping = parseWorkingPeriodInput({
      barberId,
      endTime: "13:00",
      shopId,
      startTime: "11:00",
      weekday: 1,
    });

    expect(() => assertNoOverlappingWorkingPeriod(overlapping, [existing])).toThrow(
      "Working periods cannot overlap.",
    );
  });

  it("accepts all-day and partial blocks plus timed extra openings", () => {
    expect(
      parseScheduleOverrideInput({
        barberId,
        kind: "block",
        localDate: "2026-08-20",
        shopId,
      }),
    ).toMatchObject({ endTime: null, kind: "block", startTime: null });
    expect(
      parseScheduleOverrideInput({
        barberId,
        endTime: "13:00",
        kind: "block",
        localDate: "2026-08-20",
        shopId,
        startTime: "12:00",
      }),
    ).toMatchObject({ kind: "block", startTime: "12:00" });
    expect(
      parseScheduleOverrideInput({
        barberId,
        endTime: "18:00",
        kind: "opening",
        localDate: "2026-08-20",
        shopId,
        startTime: "16:00",
      }),
    ).toMatchObject({ kind: "opening", startTime: "16:00" });
  });
});
