import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationsSupabaseClient = Pick<SupabaseClient, "rpc">;

export type NotificationToken = {
  active: boolean;
  expo_push_token: string;
  platform: string | null;
};

export async function registerNotificationToken(
  supabase: NotificationsSupabaseClient,
  expoPushToken: string,
  platform: string | null = null,
) {
  const { data, error } = await supabase.rpc("register_notification_token", {
    target_expo_push_token: expoPushToken,
    target_platform: platform,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Unable to register notification token.");
  return row as NotificationToken;
}
