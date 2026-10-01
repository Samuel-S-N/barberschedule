import type { AvailableSlot } from "../availability/types";
import type { BarberAgendaAppointment } from "./barber-agenda";
import { buildDayTimeline } from "./day-slots";

export type DaySummary = { completed: number; freeSlots: number; next: BarberAgendaAppointment | null; total: number };

export function buildDaySummary(appointments: BarberAgendaAppointment[], slots: AvailableSlot[], now: Date): DaySummary {
  const live = appointments.filter((a) => a.status !== "cancelled");
  const upcoming = live
    .filter((a) => (a.status === "scheduled" || a.status === "confirmed") && new Date(a.endsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    completed: live.filter((a) => a.status === "completed").length,
    freeSlots: buildDayTimeline(appointments, slots, now).filter((entry) => entry.kind === "free").length,
    next: upcoming[0] ?? null,
    total: live.length,
  };
}
