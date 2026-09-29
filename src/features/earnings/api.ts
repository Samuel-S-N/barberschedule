import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import type { EarningsRow } from "./calculate";

export const MAX_EARNINGS_DAYS = 92;

function daysInclusive(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
}

export async function getMyBarberEarnings(
  supabase: Pick<SupabaseClient, "rpc">,
  periodStart: string,
  periodEnd: string,
): Promise<EarningsRow[]> {
  if (!(daysInclusive(periodStart, periodEnd) >= 1 && daysInclusive(periodStart, periodEnd) <= MAX_EARNINGS_DAYS)) {
    throw new DomainError("EARNINGS_INVALID_RANGE", "Choose a period of up to 92 days.");
  }

  const { data, error } = await supabase.rpc("get_my_barber_earnings", {
    period_end: periodEnd,
    period_start: periodStart,
  });

  if (error) {
    const domainError = toDomainError(error);
    throw domainError.code === "BOOKING_REQUEST_FAILED"
      ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the barber request.")
      : domainError;
  }

  return (data ?? []).map((row: unknown) => {
    const r = row as { completed_count: number | string; gross_cents: number | string; service_id: string; service_name_snapshot: string };

    return {
      completedCount: Number(r.completed_count),
      grossCents: Number(r.gross_cents),
      serviceId: r.service_id,
      serviceName: r.service_name_snapshot,
    };
  });
}
