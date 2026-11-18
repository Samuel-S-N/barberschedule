import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "from" | "rpc">;

export type InboxKind =
  | "appointment_awaiting_confirmation"
  | "appointment_booked"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "recurrence_requested"
  | "recurrence_accepted"
  | "recurrence_rejected"
  | "recurrence_cancel_requested"
  | "recurrence_cancel_accepted"
  | "recurrence_cancel_declined"
  | "payout_due"
  | "payout_paid";

export type InboxItem = {
  appointmentId: string | null;
  createdAt: string;
  id: string;
  kind: InboxKind;
  params: { amountCents: number | null; professionalName: string; professionalNames: string; customerName: string; intervalWeeks: number | null; paidOn: string; serviceName: string; startsAt: string };
  readAt: string | null;
};

type Row = {
  appointment_id: string | null;
  created_at: string;
  id: string;
  kind: InboxKind;
  params: { amount_cents?: number; professional_name?: string; professional_names?: string[]; count?: number; customer_name?: string; interval_weeks?: number; paid_on?: string; service_name?: string; starts_at?: string };
  read_at: string | null;
};

// "Ana, Caio +2": the first names plus how many more are due than were listed.
function namesLabel(names: string[], count: number) {
  const extra = count - names.length;

  return `${names.join(", ")}${extra > 0 ? ` +${extra}` : ""}`;
}

// The shop's rows plus the unscoped ones (customer recurrence events carry no shop and show on every shop).
export async function listNotifications(supabase: Client, shopId: string, limit = 50): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, appointment_id, params, read_at, created_at")
    .or(`shop_id.eq.${shopId},shop_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as Row[]).map((row) => ({
    appointmentId: row.appointment_id,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    params: {
      amountCents: row.params.amount_cents ?? null,
      professionalName: row.params.professional_name ?? "",
      professionalNames: namesLabel(row.params.professional_names ?? [], row.params.count ?? 0),
      customerName: row.params.customer_name ?? "",
      intervalWeeks: row.params.interval_weeks ?? null,
      paidOn: row.params.paid_on ?? "",
      serviceName: row.params.service_name ?? "",
      startsAt: row.params.starts_at ?? "",
    },
    readAt: row.read_at,
  }));
}

export async function countUnread(supabase: Pick<SupabaseClient, "rpc">, shopId: string) {
  const { data, error } = await supabase.rpc("count_unread_notifications", { p_shop_id: shopId });
  if (error) throw error;

  return Number(data ?? 0);
}

export async function markRead(supabase: Pick<SupabaseClient, "rpc">, ids?: string[], shopId?: string) {
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_shop_id: shopId ?? null, target_ids: ids ?? null });
  if (error) throw error;

  return Number(data ?? 0);
}

export async function deleteNotifications(supabase: Pick<SupabaseClient, "rpc">, ids?: string[], shopId?: string) {
  const { data, error } = await supabase.rpc("delete_notifications", { p_shop_id: shopId ?? null, target_ids: ids ?? null });
  if (error) throw error;

  return Number(data ?? 0);
}
