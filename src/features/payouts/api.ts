import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import type { MyPayoutSummary, OverviewRow, PayoutListItem, PayoutOverviewItem, PayoutRow, PayoutScheduleConfig, SummaryRow } from "./types";

type Rpc = Pick<SupabaseClient, "rpc">;

function fail(error: { code?: string }): never {
  const domainError = toDomainError(error);

  throw domainError.code === "BOOKING_REQUEST_FAILED" ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the request.") : domainError;
}

const first = <T>(data: unknown) => (Array.isArray(data) ? data[0] : data) as T | null;

export async function getPayoutOverview(supabase: Rpc): Promise<PayoutOverviewItem[]> {
  const { data, error } = await supabase.rpc("get_payout_overview");
  if (error) fail(error);

  return ((data ?? []) as OverviewRow[]).map((row) => ({
    balanceCents: row.balance_cents,
    barberId: row.barber_id,
    barberName: row.barber_name,
    config: { day1: row.payout_day_1, day2: row.payout_day_2, schedule: row.payout_schedule },
    earnedCents: row.earned_cents,
    lastDueDate: row.last_due_date,
    nextDueDate: row.next_due_date,
    paidCents: row.paid_cents,
    status: row.status,
    trackingStart: row.tracking_start,
  }));
}

export async function setBarberPayoutSchedule(supabase: Rpc, barberId: string, config: PayoutScheduleConfig, trackingStart?: string | null) {
  const { error } = await supabase.rpc("set_barber_payout_schedule", {
    new_day_1: config.day1,
    new_day_2: config.day2,
    new_schedule: config.schedule,
    new_tracking_start: trackingStart ?? null,
    target_barber_id: barberId,
  });
  if (error) fail(error);
}

export async function recordBarberPayout(supabase: Rpc, input: { amountCents: number; barberId: string; note?: string | null; paidOn: string }) {
  const { data, error } = await supabase.rpc("record_barber_payout", {
    payout_amount_cents: input.amountCents,
    payout_note: input.note?.trim() || null,
    payout_paid_on: input.paidOn,
    target_barber_id: input.barberId,
  });
  if (error) fail(error);

  const row = first<PayoutRow>(data);
  if (!row) fail({ code: "unknown" });

  return { amountCents: row.amount_cents, barberId: row.barber_id, id: row.id, note: row.note, paidOn: row.paid_on };
}

export async function listBarberPayouts(supabase: Rpc, start: string, end: string): Promise<PayoutListItem[]> {
  const { data, error } = await supabase.rpc("list_barber_payouts", { period_end: end, period_start: start });
  if (error) fail(error);

  return ((data ?? []) as PayoutRow[]).map((row) => ({ amountCents: row.amount_cents, barberId: row.barber_id, barberName: row.barber_name ?? "", id: row.id, note: row.note, paidOn: row.paid_on }));
}

export async function deleteBarberPayout(supabase: Rpc, id: string) {
  const { error } = await supabase.rpc("delete_barber_payout", { payout_id: id });
  if (error) fail(error);
}

export async function getMyPayoutSummary(supabase: Rpc): Promise<MyPayoutSummary | null> {
  const { data, error } = await supabase.rpc("get_my_payout_summary");
  if (error) fail(error);
  if (!data) return null;

  const row = data as SummaryRow;

  return {
    balanceCents: row.balance_cents,
    config: { day1: row.day_1, day2: row.day_2, schedule: row.schedule },
    nextDueDate: row.next_due_date,
    pastUnmarkedCount: row.past_unmarked_count,
    payouts: row.payouts.map((p) => ({ amountCents: p.amount_cents, id: p.id, note: p.note, paidOn: p.paid_on })),
    trackingStart: row.tracking_start,
  };
}
