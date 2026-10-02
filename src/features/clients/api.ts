import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { LAPSED_DAYS } from "./format";

type Rpc = Pick<SupabaseClient, "rpc">;

export type MyClient = {
  customerId: string; email: string | null; fullName: string; hasAccount: boolean; isLapsed: boolean;
  lastVisitAt: string | null; nextVisitAt: string | null; phone: string | null; visits: number;
};

export type ClientDetail = {
  customer: { email: string | null; fullName: string; hasAccount: boolean; id: string; phone: string | null };
  history: Array<{ id: string; serviceName: string; startsAt: string; status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show" }>;
  note: string | null;
  stats: { cancelled: number; favoriteService: string | null; lastVisitAt: string | null; nextVisitAt: string | null; noShow: number; visits: number };
};

export const MAX_NOTE_LENGTH = 500;

function toError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the barber request.")
    : domainError;
}

export async function listMyClients(
  supabase: Rpc,
  input: { limit?: number; offset?: number; onlyLapsed?: boolean; search?: string } = {},
): Promise<MyClient[]> {
  const { data, error } = await supabase.rpc("list_my_customers", {
    lapsed_days: LAPSED_DAYS,
    only_lapsed: input.onlyLapsed ?? false,
    page_limit: input.limit ?? 50,
    page_offset: input.offset ?? 0,
    search: input.search?.trim() || null,
  });
  if (error) throw toError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as {
      customer_id: string; email: string | null; full_name: string; has_account: boolean; is_lapsed: boolean;
      last_visit_at: string | null; next_visit_at: string | null; phone: string | null; visits: number;
    };

    return {
      customerId: r.customer_id, email: r.email, fullName: r.full_name, hasAccount: r.has_account, isLapsed: r.is_lapsed,
      lastVisitAt: r.last_visit_at, nextVisitAt: r.next_visit_at, phone: r.phone, visits: r.visits,
    };
  });
}

export async function getMyClient(supabase: Rpc, customerId: string): Promise<ClientDetail> {
  const { data, error } = await supabase.rpc("get_my_customer", { target_customer_id: customerId });
  if (error) throw toError(error);

  const d = data as {
    customer: { email: string | null; full_name: string; has_account: boolean; id: string; phone: string | null };
    history: Array<{ id: string; service_name: string; starts_at: string; status: ClientDetail["history"][number]["status"] }>;
    note: string | null;
    stats: { cancelled: number; favorite_service: string | null; last_visit_at: string | null; next_visit_at: string | null; no_show: number; visits: number };
  };

  return {
    customer: { email: d.customer.email, fullName: d.customer.full_name, hasAccount: d.customer.has_account, id: d.customer.id, phone: d.customer.phone },
    history: d.history.map((h) => ({ id: h.id, serviceName: h.service_name, startsAt: h.starts_at, status: h.status })),
    note: d.note,
    stats: {
      cancelled: d.stats.cancelled, favoriteService: d.stats.favorite_service, lastVisitAt: d.stats.last_visit_at,
      nextVisitAt: d.stats.next_visit_at, noShow: d.stats.no_show, visits: d.stats.visits,
    },
  };
}

export async function setMyClientNote(supabase: Rpc, customerId: string, note: string) {
  const clean = note.trim();

  if (clean.length > MAX_NOTE_LENGTH) throw new DomainError("CUSTOMER_NOTE_INVALID", "The note is too long.");

  const { error } = await supabase.rpc("set_my_customer_note", { new_note: clean, target_customer_id: customerId });
  if (error) throw toError(error);
}
