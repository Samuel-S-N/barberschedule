import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";

type Rpc = Pick<SupabaseClient, "rpc">;

export type RentPayment = { amountCents: number; professionalId: string; id: string; note: string | null; paidOn: string };
export type RentPaymentListItem = RentPayment & { professionalName: string };

function fail(error: { code?: string }): never {
  const domainError = toDomainError(error);

  throw domainError.code === "BOOKING_REQUEST_FAILED" ? new DomainError("PROFESSIONAL_REQUEST_FAILED", "Unable to complete the request.") : domainError;
}

export async function recordRentPayment(
  supabase: Rpc,
  input: { amountCents: number; professionalId: string; note?: string | null; paidOn: string },
): Promise<RentPayment> {
  const { data, error } = await supabase.rpc("record_rent_payment", {
    payment_amount_cents: input.amountCents,
    payment_note: input.note?.trim() || null,
    payment_paid_on: input.paidOn,
    target_professional_id: input.professionalId,
  });
  if (error) fail(error);

  const row = (Array.isArray(data) ? data[0] : data) as { amount_cents: number; professional_id: string; id: string; note: string | null; paid_on: string } | null;
  if (!row) fail({ code: "unknown" });

  return { amountCents: row.amount_cents, professionalId: row.professional_id, id: row.id, note: row.note, paidOn: row.paid_on };
}

export async function listRentPayments(supabase: Rpc, start: string, end: string): Promise<RentPaymentListItem[]> {
  const { data, error } = await supabase.rpc("list_rent_payments", { period_end: end, period_start: start });
  if (error) fail(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as { amount_cents: number; professional_id: string; professional_name: string; id: string; note: string | null; paid_on: string };

    return { amountCents: r.amount_cents, professionalId: r.professional_id, professionalName: r.professional_name, id: r.id, note: r.note, paidOn: r.paid_on };
  });
}

export async function deleteRentPayment(supabase: Rpc, paymentId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_rent_payment", { payment_id: paymentId });
  if (error) fail(error);
}
