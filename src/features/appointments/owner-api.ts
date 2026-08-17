import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { bookAppointment, toAppointment } from "./api";
import type { Appointment, AppointmentRow, BookingInput } from "./types";

type OwnerAppointmentsSupabaseClient = Pick<SupabaseClient, "rpc">;

export type OwnerBookingInput = Omit<BookingInput, "source">;
export type OwnerAppointmentStatus = "completed" | "no_show";

export function bookOwnerAppointment(
  supabase: OwnerAppointmentsSupabaseClient,
  input: OwnerBookingInput,
) {
  return bookAppointment(supabase, { ...input, source: "owner" });
}

export async function setOwnerAppointmentStatus(
  supabase: OwnerAppointmentsSupabaseClient,
  appointmentId: string,
  status: OwnerAppointmentStatus,
): Promise<Appointment> {
  const { data, error } = await supabase.rpc("set_owner_appointment_status", {
    appointment_id: appointmentId,
    new_status: status,
  });

  if (error) {
    const domainError = toDomainError(error);
    throw domainError.code === "BOOKING_REQUEST_FAILED"
      ? new DomainError("OWNER_STATUS_REQUEST_FAILED", "Unable to update the appointment status.")
      : domainError;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new DomainError("OWNER_STATUS_REQUEST_FAILED", "Unable to update the appointment status.");
  }

  return toAppointment(row as AppointmentRow);
}
