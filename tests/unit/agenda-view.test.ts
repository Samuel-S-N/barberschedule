import {
  formatAppointmentLabels, groupByLocalDate, markAppointmentDays, pickInitialDate,
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

  it("selects the first day with an appointment, else the first day", () => {
    expect(pickInitialDate(days, groupByLocalDate([appointment("a", "2026-08-18T13:00:00Z")]))).toBe("2026-08-18");
    expect(pickInitialDate(days, new Map())).toBe("2026-08-17");
  });
});
