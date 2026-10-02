import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { daysBetween } from "../reports/build-report";
import type { ShopReport } from "./build";

const MAX_REPORT_DAYS = 92;

export async function getShopReport(supabase: Pick<SupabaseClient, "rpc">, start: string, end: string): Promise<ShopReport> {
  const length = daysBetween(start, end);

  if (!(length >= 1 && length <= MAX_REPORT_DAYS)) {
    throw new DomainError("EARNINGS_INVALID_RANGE", "Choose a period of up to 92 days.");
  }

  const { data, error } = await supabase.rpc("get_shop_report", { period_end: end, period_start: start });

  if (error) {
    const domainError = toDomainError(error);
    throw domainError.code === "BOOKING_REQUEST_FAILED"
      ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the request.")
      : domainError;
  }

  const payload = (data ?? {}) as {
    barbers?: Array<{ barber_id: string; barber_share_cents: number; compensation_type: "chair_rental" | "commission"; completed: number; gross_cents: number; name: string; rent_estimate_cents: number; rent_paid_cents?: number }>;
    days?: Array<{ cancelled: number; completed: number; date: string; gross_cents: number; no_show: number; upcoming: number }>;
    services?: Array<{ completed: number; gross_cents: number; name: string; service_id: string }>;
  };

  return {
    barbers: (payload.barbers ?? []).map((b) => ({
      barberId: b.barber_id, barberShareCents: b.barber_share_cents, compensationType: b.compensation_type, completed: b.completed,
      grossCents: b.gross_cents, name: b.name, rentEstimateCents: b.rent_estimate_cents, rentPaidCents: b.rent_paid_cents ?? 0,
    })),
    days: (payload.days ?? []).map((d) => ({ cancelled: d.cancelled, completed: d.completed, date: d.date, grossCents: d.gross_cents, noShow: d.no_show, upcoming: d.upcoming })),
    services: (payload.services ?? []).map((s) => ({ completed: s.completed, grossCents: s.gross_cents, name: s.name, serviceId: s.service_id })),
  };
}
