import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";
import type { Appointment, AppointmentRow, BookingInput } from "./types";

type AppointmentsSupabaseClient = Pick<SupabaseClient, "rpc">;

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    professionalBufferMinutesSnapshot: row.professional_buffer_minutes_snapshot,
    professionalId: row.professional_id,
    professionalServiceId: row.professional_service_id,
    createdAt: row.created_at,
    customerId: row.customer_id,
    endsAt: row.ends_at,
    id: row.id,
    notes: row.notes,
    occupiedUntil: row.occupied_until,
    serviceDurationMinutesSnapshot: row.service_duration_minutes_snapshot,
    serviceId: row.service_id,
    serviceNameSnapshot: row.service_name_snapshot,
    servicePriceCentsSnapshot: row.service_price_cents_snapshot,
    shopId: row.shop_id,
    source: row.source,
    startsAt: row.starts_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

const appointmentColumns =
  "id, shop_id, professional_id, customer_id, professional_service_id, service_id, starts_at, ends_at, occupied_until, status, source, notes, service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, professional_buffer_minutes_snapshot, created_at, updated_at";

export async function bookAppointment(
  supabase: AppointmentsSupabaseClient,
  input: BookingInput,
) {
  const { data, error } = await supabase.rpc("book_appointment", {
    professional_service_id: input.professionalServiceId,
    customer_id: input.customerId,
    notes: input.notes ?? null,
    source: input.source,
    starts_at: input.startsAt,
  });

  if (error) {
    throw toDomainError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw toDomainError({ code: "unknown" });
  }

  return toAppointment(row as AppointmentRow);
}

export { appointmentColumns };
