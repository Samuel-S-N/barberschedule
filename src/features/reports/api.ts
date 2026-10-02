import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { daysBetween, type BarberReport } from "./build-report";

const MAX_REPORT_DAYS = 92;

export async function getMyBarberReport(supabase: Pick<SupabaseClient, "rpc">, start: string, end: string): Promise<BarberReport> {
  const length = daysBetween(start, end);

  if (!(length >= 1 && length <= MAX_REPORT_DAYS)) {
    throw new DomainError("EARNINGS_INVALID_RANGE", "Choose a period of up to 92 days.");
  }

  const { data, error } = await supabase.rpc("get_my_barber_report", { period_end: end, period_start: start });

  if (error) {
    const domainError = toDomainError(error);
    throw domainError.code === "BOOKING_REQUEST_FAILED"
      ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the barber request.")
      : domainError;
  }

  const payload = (data ?? {}) as {
    days?: Array<{ cancelled: number; completed: number; date: string; earnings_cents: number; no_show: number; upcoming: number }>;
    services?: Array<{ completed: number; name: string; service_id: string }>;
  };

  return {
    days: (payload.days ?? []).map((d) => ({
      cancelled: d.cancelled, completed: d.completed, date: d.date, earningsCents: d.earnings_cents, noShow: d.no_show, upcoming: d.upcoming,
    })),
    services: (payload.services ?? []).map((s) => ({ completed: s.completed, name: s.name, serviceId: s.service_id })),
  };
}
