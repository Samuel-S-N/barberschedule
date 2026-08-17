import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import type {
  RecurrenceConflict,
  RecurrenceSeries,
  RecurrenceSeriesInput,
  RecurrenceSeriesRow,
} from "./types";
import { parseRecurrenceSeriesInput } from "./validation";

type RecurrenceSupabaseClient = Pick<SupabaseClient, "rpc">;

function toRecurrenceError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("RECURRENCE_REQUEST_FAILED", "Unable to update recurring bookings.")
    : domainError;
}

function singleRow<T>(data: T | T[] | null, error: { code?: string } | null): T {
  if (error) throw toRecurrenceError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DomainError("RECURRENCE_REQUEST_FAILED", "Unable to update recurring bookings.");
  return row;
}

function toRecurrenceSeries(row: RecurrenceSeriesRow): RecurrenceSeries {
  return {
    active: row.active,
    barberServiceId: row.barber_service_id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? "",
    endedAt: row.ended_at,
    endsOn: row.ends_on,
    id: row.id,
    intervalWeeks: row.interval_weeks,
    localStartDate: row.local_start_date,
    localStartTime: row.local_start_time.slice(0, 5),
    specialPriceCents: row.special_price_cents,
  };
}

export async function createRecurrenceSeries(
  supabase: RecurrenceSupabaseClient,
  input: RecurrenceSeriesInput,
) {
  const parsed = parseRecurrenceSeriesInput(input);
  const { data, error } = await supabase.rpc("create_recurrence_series", {
    interval_weeks: parsed.intervalWeeks,
    local_start_date: parsed.localStartDate,
    local_start_time: parsed.localStartTime,
    special_price_cents: parsed.specialPriceCents,
    target_barber_service_id: parsed.barberServiceId,
    target_customer_id: parsed.customerId,
  });

  return toRecurrenceSeries(singleRow(data as RecurrenceSeriesRow[] | null, error));
}

export async function editRecurrenceSeries(
  supabase: RecurrenceSupabaseClient,
  seriesId: string,
  input: Omit<RecurrenceSeriesInput, "barberServiceId" | "customerId" | "localStartDate"> & { endsOn?: string | null },
) {
  const parsed = parseRecurrenceSeriesInput({
    ...input,
    barberServiceId: "00000000-0000-0000-0000-000000000000",
    customerId: "00000000-0000-0000-0000-000000000000",
    localStartDate: "2000-01-01",
  });
  const { data, error } = await supabase.rpc("edit_recurrence_series", {
    target_ends_on: input.endsOn ?? null,
    target_interval_weeks: parsed.intervalWeeks,
    target_local_start_time: parsed.localStartTime,
    target_series_id: seriesId,
    target_special_price_cents: parsed.specialPriceCents,
  });

  return toRecurrenceSeries(singleRow(data as RecurrenceSeriesRow[] | null, error));
}

export async function ensureRecurrenceWindow(
  supabase: RecurrenceSupabaseClient,
  shopId: string,
  throughDate: string,
) {
  const { data, error } = await supabase.rpc("ensure_recurrence_window", {
    target_shop_id: shopId,
    through_date: throughDate,
  });
  const row = singleRow(data as { appointments_created: number; conflicts_created: number }[] | null, error);

  return {
    appointmentsCreated: row.appointments_created,
    conflictsCreated: row.conflicts_created,
  };
}

export async function setRecurrenceSeriesActive(
  supabase: RecurrenceSupabaseClient,
  seriesId: string,
  active: boolean,
) {
  const { data, error } = await supabase.rpc("set_recurrence_series_active", {
    target_active: active,
    target_series_id: seriesId,
  });
  return toRecurrenceSeries(singleRow(data as RecurrenceSeriesRow[] | null, error));
}

export async function cancelRecurrenceOccurrence(
  supabase: RecurrenceSupabaseClient,
  seriesId: string,
  occurrenceDate: string,
) {
  const { error } = await supabase.rpc("cancel_recurrence_occurrence", {
    target_occurrence_date: occurrenceDate,
    target_series_id: seriesId,
  });
  if (error) throw toRecurrenceError(error);
}

export async function endRecurrenceSeries(supabase: RecurrenceSupabaseClient, seriesId: string) {
  const { data, error } = await supabase.rpc("end_recurrence_series", { target_series_id: seriesId });
  return toRecurrenceSeries(singleRow(data as RecurrenceSeriesRow[] | null, error));
}

export async function listOwnerRecurrenceSeries(supabase: RecurrenceSupabaseClient, shopId: string) {
  const { data, error } = await supabase.rpc("list_owner_recurrence_series", { target_shop_id: shopId });
  if (error) throw toRecurrenceError(error);
  return (data ?? []).map((row: unknown) => toRecurrenceSeries(row as RecurrenceSeriesRow));
}

export async function listOwnerRecurrenceConflicts(supabase: RecurrenceSupabaseClient, shopId: string) {
  const { data, error } = await supabase.rpc("list_owner_recurrence_conflicts", { target_shop_id: shopId });
  if (error) throw toRecurrenceError(error);

  return (data ?? []).map((row: unknown) => {
    const conflict = row as {
      customer_name: string;
      customer_phone: string | null;
      id: string;
      local_start_time: string;
      occurrence_date: string;
      reason: string;
      series_id: string;
      service_name: string;
      status: "open" | "resolved";
    };
    return {
      customerName: conflict.customer_name,
      customerPhone: conflict.customer_phone,
      id: conflict.id,
      localStartTime: conflict.local_start_time.slice(0, 5),
      occurrenceDate: conflict.occurrence_date,
      reason: conflict.reason,
      seriesId: conflict.series_id,
      serviceName: conflict.service_name,
      status: conflict.status,
    } satisfies RecurrenceConflict;
  });
}

export function buildWhatsAppRecurrenceConflictUrl(input: {
  customerName: string;
  localDate: string;
  phone: string | null;
  serviceName: string;
}) {
  const phone = input.phone?.replace(/\D/g, "");
  if (!phone) return null;
  const message = `Olá ${input.customerName}, seu ${input.serviceName} recorrente em ${input.localDate} precisa ser reagendado. Qual horário você prefere?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
