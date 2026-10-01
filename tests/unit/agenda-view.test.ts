import {
  formatAppointmentLabels, groupByLocalDate, markAppointmentDays, pendingClosure, stripLength, visibleAppointments,
} from "../../src/features/appointments/agenda-view";
import type { Appointment } from "../../src/features/appointments/types";

function appointment(id: string, startsAt: string): Appointment {
  return {
    barberBufferMinutesSnapshot: 0, barberId: "b", barberServiceId: "bs", createdAt: startsAt,
    customerId: "c", endsAt: startsAt, id, notes: null, occupiedUntil: startsAt,
    serviceDurationMinutesSnapshot: 30, serviceId: "s", serviceNameSnapshot: "Cut",
    servicePriceCentsSnapshot: 4000, shopId: "shop", source: "customer", startsAt,
    status: "scheduled", updatedAt: startsAt,
  };
}

const days = [
  { date: "2026-08-17", dayNumber: "17", weekdayLabel: "Mon" },
  { date: "2026-08-18", dayNumber: "18", weekdayLabel: "Tue" },
];

describe("agenda view helpers", () => {
  it("groups by shop-local date, not UTC date", () => {
    // 2026-08-18T01:00Z is 2026-08-17 22:00 in America/Sao_Paulo
    const grouped = groupByLocalDate([appointment("late", "2026-08-18T01:00:00Z"), appointment("early", "2026-08-17T12:00:00Z")]);

    expect([...grouped.keys()]).toEqual(["2026-08-17"]);
    expect(grouped.get("2026-08-17")?.map((a) => a.id)).toEqual(["early", "late"]);
  });

  it("formats labels in shop-local time", () => {
    expect(formatAppointmentLabels(appointment("a", "2026-08-17T12:00:00Z"))).toEqual({
      dateLabel: "Mon, 17 Aug",
      timeLabel: "09:00",
    });
  });

  it("formats the date label in the requested language", () => {
    expect(formatAppointmentLabels(appointment("a", "2026-08-17T12:00:00Z"), "pt").dateLabel).toMatch(/^seg.*17.*ago/i);
  });

  it("marks days that have appointments", () => {
    const grouped = groupByLocalDate([appointment("a", "2026-08-18T13:00:00Z")]);

    expect(markAppointmentDays(days, grouped).map((d) => d.hasAppointment)).toEqual([false, true]);
  });

  it("lists every appointment in order when no date is selected, else only that day", () => {
    const grouped = groupByLocalDate([
      appointment("b", "2026-08-18T13:00:00Z"), appointment("a", "2026-08-17T12:00:00Z"), appointment("c", "2026-08-18T15:00:00Z"),
    ]);

    expect(visibleAppointments(grouped, null).map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(visibleAppointments(grouped, "2026-08-18").map((a) => a.id)).toEqual(["b", "c"]);
    expect(visibleAppointments(grouped, "2026-08-19")).toEqual([]);
  });
});

describe("pendingClosure", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  const ended = (id: string, endsAt: string, status: Appointment["status"] = "scheduled") => ({
    ...appointment(id, endsAt), endsAt, status,
  });

  it("keeps only finished appointments still scheduled or confirmed, oldest first", () => {
    const result = pendingClosure(
      [
        ended("later", "2026-08-17T15:00:00Z", "confirmed"),
        ended("earlier", "2026-08-16T15:00:00Z"),
        ended("running", "2026-08-18T12:30:00Z"),
        ended("done", "2026-08-16T10:00:00Z", "completed"),
        ended("gone", "2026-08-16T11:00:00Z", "cancelled"),
      ],
      now,
    );

    expect(result.map((a) => a.id)).toEqual(["earlier", "later"]);
  });
});

describe("stripLength", () => {
  const from = new Date("2026-10-01T15:00:00Z");

  it("keeps the 30-day minimum", () => {
    expect(stripLength([], from)).toBe(30);
    expect(stripLength([appointment("a", "2026-10-11T15:00:00Z")], from)).toBe(30);
  });

  it("grows to cover the last appointment, inclusive", () => {
    expect(stripLength([appointment("a", "2026-11-30T15:00:00Z")], from)).toBe(61);
  });

  it("stops at the 90-day recurrence horizon", () => {
    expect(stripLength([appointment("a", "2027-04-01T15:00:00Z")], from)).toBe(90);
  });
});
