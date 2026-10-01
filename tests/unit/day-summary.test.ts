import { buildDaySummary } from "../../src/features/appointments/day-summary";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const appt = (id: string, startsAt: string, endsAt: string, status: string) =>
  ({ endsAt, id, occupiedUntil: endsAt, startsAt, status }) as never;
const slot = (startsAt: string) => ({ endsAt: startsAt, localDate: "2026-10-02", localTime: "12:00", startsAt });

describe("buildDaySummary", () => {
  const appointments = [
    appt("done", "2026-10-02T12:00:00.000Z", "2026-10-02T12:30:00.000Z", "completed"),
    appt("gone", "2026-10-02T13:00:00.000Z", "2026-10-02T13:30:00.000Z", "cancelled"),
    appt("soon", "2026-10-02T16:00:00.000Z", "2026-10-02T16:30:00.000Z", "scheduled"),
    appt("later", "2026-10-02T18:00:00.000Z", "2026-10-02T18:30:00.000Z", "confirmed"),
  ];

  it("counts non-cancelled appointments and the completed ones", () => {
    expect(buildDaySummary(appointments, [], NOW)).toMatchObject({ completed: 1, total: 3 });
  });

  it("picks the earliest scheduled or confirmed appointment that has not ended", () => {
    expect(buildDaySummary(appointments, [], NOW).next?.id).toBe("soon");
    expect(buildDaySummary([appointments[0]], [], NOW).next).toBeNull();
  });

  it("counts only future free slots that are not inside an appointment", () => {
    const slots = [slot("2026-10-02T14:00:00.000Z"), slot("2026-10-02T16:15:00.000Z"), slot("2026-10-02T17:00:00.000Z"), slot("2026-10-02T19:00:00.000Z")];

    expect(buildDaySummary(appointments, slots, NOW).freeSlots).toBe(2);
  });
});
