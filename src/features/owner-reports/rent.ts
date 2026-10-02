import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";

type Rpc = Pick<SupabaseClient, "rpc">;

export type RentPayment = { amountCents: number; barberId: string; id: string; note: string | null; paidOn: string };
export type RentPaymentListItem = RentPayment & { barberName: string };

// "300", "300,50", "1.250,00", "R$ 75,90" -> cents. Null for anything that is not a positive amount with at most 2 decimals.
export function parseReaisToCents(input: string): number | null {
  const cleaned = input.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);

  return cents > 0 ? cents : null;
}

function fail(error: { code?: string }): never {
  const domainError = toDomainError(error);

  throw domainError.code === "BOOKING_REQUEST_FAILED" ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the request.") : domainError;
}

export async function recordRentPayment(
  supabase: Rpc,
  input: { amountCents: number; barberId: string; note?: string | null; paidOn: string },
): Promise<RentPayment> {
  const { data, error } = await supabase.rpc("record_rent_payment", {
    payment_amount_cents: input.amountCents,
    payment_note: input.note?.trim() || null,
    payment_paid_on: input.paidOn,
    target_barber_id: input.barberId,
  });
  if (error) fail(error);

  const row = (Array.isArray(data) ? data[0] : data) as { amount_cents: number; barber_id: string; id: string; note: string | null; paid_on: string } | null;
  if (!row) fail({ code: "unknown" });

  return { amountCents: row.amount_cents, barberId: row.barber_id, id: row.id, note: row.note, paidOn: row.paid_on };
}

export async function listRentPayments(supabase: Rpc, start: string, end: string): Promise<RentPaymentListItem[]> {
  const { data, error } = await supabase.rpc("list_rent_payments", { period_end: end, period_start: start });
  if (error) fail(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as { amount_cents: number; barber_id: string; barber_name: string; id: string; note: string | null; paid_on: string };

    return { amountCents: r.amount_cents, barberId: r.barber_id, barberName: r.barber_name, id: r.id, note: r.note, paidOn: r.paid_on };
  });
}

export async function deleteRentPayment(supabase: Rpc, paymentId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_rent_payment", { payment_id: paymentId });
  if (error) fail(error);
}
