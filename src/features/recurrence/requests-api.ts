import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";
import type { RecurrenceWeeks } from "./pricing";

type Client = Pick<SupabaseClient, "rpc">;
type Row = Record<string, unknown>;

async function call(supabase: Client, name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toDomainError(error);

  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}

const time = (value: unknown) => String(value).slice(0, 5);
const cents = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export type RecurrenceQuote = { normalCents: number; recurrenceCents: number | null; weeks: RecurrenceWeeks };

export type RecurrenceRequest = {
  barberName: string;
  id: string;
  recurrenceCents: number | null;
  serviceName: string;
  startDate: string;
  startTime: string;
  status: "accepted" | "cancelled" | "pending" | "rejected";
  weeks: RecurrenceWeeks;
};

export type StaffRecurrenceRequest = {
  barberId: string;
  barberName: string;
  customerName: string;
  customerPhone: string | null;
  id: string;
  normalCents: number;
  recurrenceCents: number | null;
  serviceName: string;
  startDate: string;
  startTime: string;
  weeks: RecurrenceWeeks;
};

type SeriesInput = { barberServiceId: string; startDate: string; startTime: string; weeks: RecurrenceWeeks };

export async function getRecurrenceQuote(supabase: Client, barberServiceId: string): Promise<RecurrenceQuote[]> {
  const rows = await call(supabase, "get_recurrence_quote", { target_barber_service_id: barberServiceId });

  return rows.map((row) => ({ normalCents: Number(row.normal_cents), recurrenceCents: cents(row.recurrence_cents), weeks: Number(row.interval_weeks) as RecurrenceWeeks }));
}

export async function requestRecurrence(supabase: Client, input: SeriesInput) {
  await call(supabase, "request_recurrence", {
    target_barber_service_id: input.barberServiceId,
    target_interval_weeks: input.weeks,
    target_start_date: input.startDate,
    target_start_time: input.startTime,
  });
}

export async function createRecurrenceForCustomer(supabase: Client, input: SeriesInput & { customerId: string }) {
  await call(supabase, "create_recurrence_for_customer", {
    target_barber_service_id: input.barberServiceId,
    target_customer_id: input.customerId,
    target_interval_weeks: input.weeks,
    target_start_date: input.startDate,
    target_start_time: input.startTime,
  });
}

export async function cancelMyRecurrenceRequest(supabase: Client, id: string) {
  await call(supabase, "cancel_my_recurrence_request", { target_request_id: id });
}

export async function listMyRecurrenceRequests(supabase: Client): Promise<RecurrenceRequest[]> {
  const rows = await call(supabase, "list_my_recurrence_requests");

  return rows.map((row) => ({
    barberName: String(row.barber_name),
    id: String(row.id),
    recurrenceCents: cents(row.recurrence_cents),
    serviceName: String(row.service_name),
    startDate: String(row.local_start_date),
    startTime: time(row.local_start_time),
    status: row.status as RecurrenceRequest["status"],
    weeks: Number(row.interval_weeks) as RecurrenceWeeks,
  }));
}

export async function listRecurrenceRequests(supabase: Client, shopId: string): Promise<StaffRecurrenceRequest[]> {
  const rows = await call(supabase, "list_recurrence_requests", { target_shop_id: shopId });

  return rows.map((row) => ({
    barberId: String(row.barber_id),
    barberName: String(row.barber_name),
    customerName: String(row.customer_name),
    customerPhone: (row.customer_phone as string | null) ?? null,
    id: String(row.id),
    normalCents: Number(row.normal_cents),
    recurrenceCents: cents(row.recurrence_cents),
    serviceName: String(row.service_name),
    startDate: String(row.local_start_date),
    startTime: time(row.local_start_time),
    weeks: Number(row.interval_weeks) as RecurrenceWeeks,
  }));
}

export async function decideRecurrenceRequest(supabase: Client, id: string, accept: boolean) {
  await call(supabase, "decide_recurrence_request", { accept, target_request_id: id });
}

export async function listRecurrencePrices(supabase: Client, shopId: string) {
  const rows = await call(supabase, "list_recurrence_prices", { target_shop_id: shopId });

  return rows.map((row) => ({ priceCents: Number(row.price_cents), serviceId: String(row.service_id), weeks: Number(row.interval_weeks) as RecurrenceWeeks }));
}

export async function setRecurrencePrice(supabase: Client, serviceId: string, weeks: RecurrenceWeeks, priceCents: number | null) {
  await call(supabase, "set_recurrence_price", { target_interval_weeks: weeks, target_price_cents: priceCents, target_service_id: serviceId });
}
