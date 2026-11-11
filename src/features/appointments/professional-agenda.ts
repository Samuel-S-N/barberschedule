import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { toAppointment } from "./api";
import type { Appointment, AppointmentRow } from "./types";

type ProfessionalAgendaClient = Pick<SupabaseClient, "rpc">;

export type ProfessionalAgendaInput = {
  limit: number;
  offset: number;
  rangeEnd: string;
  rangeStart: string;
};

export type ProfessionalAgendaAppointment = Appointment & {
  professionalName: string;
  customerName: string;
  // Set only for customers without an account (they get no push); null otherwise.
  customerPhone: string | null;
};

export type ProfessionalAppointmentStatus = "confirmed" | "completed" | "no_show";

function toProfessionalError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("OWNER_AGENDA_REQUEST_FAILED", "Unable to load the owner agenda.")
    : domainError;
}

export async function listMyProfessionalAgenda(
  supabase: ProfessionalAgendaClient,
  input: ProfessionalAgendaInput,
): Promise<ProfessionalAgendaAppointment[]> {
  const { data, error } = await supabase.rpc("list_my_professional_agenda", {
    page_limit: input.limit,
    page_offset: input.offset,
    range_end: input.rangeEnd,
    range_start: input.rangeStart,
  });

  if (error) {
    throw toProfessionalError(error);
  }

  return (data ?? []).map((row: unknown) => {
    const agendaRow = row as AppointmentRow & { professional_name: string; customer_name: string; customer_phone?: string | null };

    return {
      ...toAppointment(agendaRow),
      professionalName: agendaRow.professional_name,
      customerName: agendaRow.customer_name,
      customerPhone: agendaRow.customer_phone ?? null,
    };
  });
}

export async function setMyAppointmentStatus(
  supabase: ProfessionalAgendaClient,
  appointmentId: string,
  status: ProfessionalAppointmentStatus,
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
