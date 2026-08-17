import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { toAppointment } from "./api";
import type { Appointment, AppointmentRow } from "./types";

type AgendaSupabaseClient = Pick<SupabaseClient, "rpc">;

type OwnerAgendaRow = AppointmentRow & {
  barber_name: string;
  customer_name: string;
};

export type OwnerAgendaInput = {
  limit: number;
  offset: number;
  rangeEnd: string;
  rangeStart: string;
  shopId: string;
};

export type OwnerAgendaAppointment = Appointment & {
  barberName: string;
  customerName: string;
};

export type OwnerAgendaOverride = {
  barberId: string;
  barberName: string;
  endTime: string | null;
  id: string;
  kind: "block" | "opening";
  localDate: string;
  startTime: string | null;
};

function toAgendaError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("OWNER_AGENDA_REQUEST_FAILED", "Unable to load the owner agenda.")
    : domainError;
}

export async function listOwnerAgenda(
  supabase: AgendaSupabaseClient,
  input: OwnerAgendaInput,
): Promise<OwnerAgendaAppointment[]> {
  const { data, error } = await supabase.rpc("list_owner_agenda", {
    page_limit: input.limit,
    page_offset: input.offset,
    range_end: input.rangeEnd,
    range_start: input.rangeStart,
    target_shop_id: input.shopId,
  });

  if (error) {
    throw toAgendaError(error);
  }

  return (data ?? []).map((row: unknown) => {
    const agendaRow = row as OwnerAgendaRow;

    return {
      ...toAppointment(agendaRow),
      barberName: agendaRow.barber_name,
      customerName: agendaRow.customer_name,
    };
  });
}

export async function listOwnerAgendaOverrides(
  supabase: AgendaSupabaseClient,
  input: Pick<OwnerAgendaInput, "rangeEnd" | "rangeStart" | "shopId">,
): Promise<OwnerAgendaOverride[]> {
  const { data, error } = await supabase.rpc("list_owner_agenda_overrides", {
    range_end: input.rangeEnd,
    range_start: input.rangeStart,
    target_shop_id: input.shopId,
  });

  if (error) {
    throw toAgendaError(error);
  }

  return (data ?? []).map((row: unknown) => {
    const override = row as {
      barber_id: string;
      barber_name: string;
      end_time: string | null;
      id: string;
      kind: "block" | "opening";
      local_date: string;
      start_time: string | null;
    };

    return {
      barberId: override.barber_id,
      barberName: override.barber_name,
      endTime: override.end_time ? override.end_time.slice(0, 5) : null,
      id: override.id,
      kind: override.kind,
      localDate: override.local_date,
      startTime: override.start_time ? override.start_time.slice(0, 5) : null,
    };
  });
}
