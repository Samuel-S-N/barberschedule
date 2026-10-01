import type { AvailableSlot } from "../availability/types";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import type { BarberAgendaAppointment } from "./barber-agenda";

export type DayEntry =
  | { appointment: BarberAgendaAppointment; kind: "appointment"; time: string }
  | { kind: "free"; slot: AvailableSlot; time: string };

export function buildDayTimeline(appointments: BarberAgendaAppointment[], slots: AvailableSlot[], now = new Date()): DayEntry[] {
  const live = appointments.filter((appointment) => appointment.status !== "cancelled");
  // The server rejects bookings that start in the past, so those times are not offered.
  const free = slots.filter((slot) => new Date(slot.startsAt) > now && !live.some((a) => slot.startsAt >= a.startsAt && slot.startsAt < a.occupiedUntil));

  const entries: Array<{ at: string; entry: DayEntry }> = [
    ...live.map((appointment) => ({
      at: appointment.startsAt,
      entry: { appointment, kind: "appointment" as const, time: formatInstantInShopTime(new Date(appointment.startsAt)).localTime },
    })),
    ...free.map((slot) => ({ at: slot.startsAt, entry: { kind: "free" as const, slot, time: slot.localTime } })),
  ];

  return entries.sort((a, b) => a.at.localeCompare(b.at)).map(({ entry }) => entry);
}

export function slotFitsService(slot: AvailableSlot, nextBusyStart: string | null, durationMinutes: number) {
  if (!nextBusyStart) return true;

  return new Date(slot.startsAt).getTime() + durationMinutes * 60_000 <= new Date(nextBusyStart).getTime();
}
