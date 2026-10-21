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
  | "recurrence_rejected";

export type InboxItem = {
  appointmentId: string | null;
  createdAt: string;
  id: string;
  kind: InboxKind;
  params: { barberName: string; customerName: string; intervalWeeks: number | null; serviceName: string; startsAt: string };
  readAt: string | null;
};

type Row = {
  appointment_id: string | null;
  created_at: string;
  id: string;
  kind: InboxKind;
  params: { barber_name?: string; customer_name?: string; interval_weeks?: number; service_name?: string; starts_at?: string };
  read_at: string | null;
};

export async function listNotifications(supabase: Client, limit = 50): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, appointment_id, params, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as Row[]).map((row) => ({
    appointmentId: row.appointment_id,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    params: {
      barberName: row.params.barber_name ?? "",
      customerName: row.params.customer_name ?? "",
      intervalWeeks: row.params.interval_weeks ?? null,
      serviceName: row.params.service_name ?? "",
      startsAt: row.params.starts_at ?? "",
    },
    readAt: row.read_at,
  }));
}

export async function countUnread(supabase: Pick<SupabaseClient, "rpc">) {
  const { data, error } = await supabase.rpc("count_unread_notifications");
  if (error) throw error;

  return Number(data ?? 0);
}

export async function markRead(supabase: Pick<SupabaseClient, "rpc">, ids?: string[]) {
  const { data, error } = await supabase.rpc("mark_notifications_read", { target_ids: ids ?? null });
  if (error) throw error;

  return Number(data ?? 0);
}
