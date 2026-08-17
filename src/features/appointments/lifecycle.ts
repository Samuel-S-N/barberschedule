import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { toAppointment, appointmentColumns } from "./api";
import type { Appointment, AppointmentRow } from "./types";
import { isLifecycleWindowOpen, parseLifecycleStart } from "./validation";

type LifecycleSupabaseClient = Pick<SupabaseClient, "from" | "rpc">;

export { isLifecycleWindowOpen };

function toLifecycleDomainError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("APPOINTMENT_REQUEST_FAILED", "Unable to change the appointment.")
    : domainError;
}

async function callLifecycleRpc(
  supabase: Pick<LifecycleSupabaseClient, "rpc">,
  rpc: "cancel_appointment" | "reschedule_appointment",
  input: Record<string, string>,
) {
  const { data, error } = await supabase.rpc(rpc, input);

  if (error) {
    throw toLifecycleDomainError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw toLifecycleDomainError({ code: "unknown" });
  }

  return toAppointment(row as AppointmentRow);
}

export function cancelAppointment(
  supabase: Pick<LifecycleSupabaseClient, "rpc">,
  appointmentId: string,
) {
  return callLifecycleRpc(supabase, "cancel_appointment", {
    appointment_id: appointmentId,
  });
}

export function rescheduleAppointment(
  supabase: Pick<LifecycleSupabaseClient, "rpc">,
  appointmentId: string,
  newStartsAt: string,
) {
  return callLifecycleRpc(supabase, "reschedule_appointment", {
    appointment_id: appointmentId,
    new_starts_at: parseLifecycleStart(newStartsAt),
  });
}

export async function listMyAppointments(
  supabase: Pick<LifecycleSupabaseClient, "from">,
  history = false,
): Promise<Appointment[]> {
  const statuses = history
    ? ["cancelled", "completed", "no_show"]
    : ["scheduled", "confirmed"];
  const { data, error } = await supabase
    .from("appointments")
    .select(appointmentColumns)
    .in("status", statuses)
    .order("starts_at", { ascending: !history });

  if (error) {
    throw toDomainError(error);
  }

  return (data ?? []).map((row) => toAppointment(row as AppointmentRow));
}
