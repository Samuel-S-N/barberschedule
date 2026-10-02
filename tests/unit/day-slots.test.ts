import { buildDayTimeline, slotFitsService } from "../../src/features/appointments/day-slots";

const slot = (startsAt: string, localTime: string) => ({ endsAt: startsAt, localDate: "2026-10-02", localTime, startsAt });
const appt = (id: string, startsAt: string, occupiedUntil: string, status = "scheduled") =>
  ({ id, occupiedUntil, startsAt, status }) as never;

const NOW = new Date("2026-10-01T00:00:00.000Z");

describe("buildDayTimeline", () => {
  it("merges appointments and free slots in time order", () => {
    const timeline = buildDayTimeline(
      [appt("a1", "2026-10-02T13:00:00.000Z", "2026-10-02T13:30:00.000Z")],
      [slot("2026-10-02T12:00:00.000Z", "09:00"), slot("2026-10-02T14:00:00.000Z", "11:00")],
      NOW,
    );

    expect(timeline.map((entry) => entry.kind)).toEqual(["free", "appointment", "free"]);
  });

  it("drops free slots that start inside an appointment", () => {
    const timeline = buildDayTimeline(
      [appt("a1", "2026-10-02T13:00:00.000Z", "2026-10-02T14:00:00.000Z")],
      [slot("2026-10-02T13:30:00.000Z", "10:30")],
      NOW,
    );

    expect(timeline.map((entry) => entry.kind)).toEqual(["appointment"]);
  });

  it("drops free slots that already started", () => {
    const timeline = buildDayTimeline([], [slot("2026-10-01T12:00:00.000Z", "09:00"), slot("2026-10-01T20:00:00.000Z", "17:00")], new Date("2026-10-01T15:00:00.000Z"));

    expect(timeline.map((entry) => entry.time)).toEqual(["17:00"]);
  });

  it("ignores cancelled appointments", () => {
    const timeline = buildDayTimeline([appt("a1", "2026-10-02T13:00:00.000Z", "2026-10-02T13:30:00.000Z", "cancelled")], [], NOW);

    expect(timeline).toEqual([]);
  });
});

describe("slotFitsService", () => {
  const s = slot("2026-10-02T12:00:00.000Z", "09:00");

  it("fits when the service ends before the next busy start", () => {
    expect(slotFitsService(s, "2026-10-02T12:30:00.000Z", 30)).toBe(true);
  });

  it("does not fit when it would overlap the next appointment", () => {
    expect(slotFitsService(s, "2026-10-02T12:20:00.000Z", 30)).toBe(false);
  });

  it("always fits when nothing follows", () => {
    expect(slotFitsService(s, null, 90)).toBe(true);
  });
});
