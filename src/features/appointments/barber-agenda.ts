import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { toAppointment } from "./api";
import type { Appointment, AppointmentRow } from "./types";

type BarberAgendaClient = Pick<SupabaseClient, "rpc">;

export type BarberAgendaInput = {
  limit: number;
  offset: number;
  rangeEnd: string;
  rangeStart: string;
};

export type BarberAgendaAppointment = Appointment & {
  barberName: string;
  customerName: string;
};

export type BarberAppointmentStatus = "confirmed" | "completed" | "no_show";

function toBarberError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("OWNER_AGENDA_REQUEST_FAILED", "Unable to load the owner agenda.")
    : domainError;
}

export async function listMyBarberAgenda(
  supabase: BarberAgendaClient,
  input: BarberAgendaInput,
): Promise<BarberAgendaAppointment[]> {
  const { data, error } = await supabase.rpc("list_my_barber_agenda", {
    page_limit: input.limit,
    page_offset: input.offset,
    range_end: input.rangeEnd,
    range_start: input.rangeStart,
  });

  if (error) {
    throw toBarberError(error);
  }

  return (data ?? []).map((row: unknown) => {
    const agendaRow = row as AppointmentRow & { barber_name: string; customer_name: string };

    return {
      ...toAppointment(agendaRow),
      barberName: agendaRow.barber_name,
      customerName: agendaRow.customer_name,
    };
  });
}

export async function setMyAppointmentStatus(
  supabase: BarberAgendaClient,
  appointmentId: string,
  status: BarberAppointmentStatus,
): Promise<Appointment> {
  const { data, error } = await supabase.rpc("set_my_appointment_status", {
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
