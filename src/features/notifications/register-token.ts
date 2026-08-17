import type { SupabaseClient } from "@supabase/supabase-js";

import { registerNotificationToken } from "./api";

type NotificationsSupabaseClient = Pick<SupabaseClient, "rpc">;

export async function saveExpoPushToken(
  supabase: NotificationsSupabaseClient,
  expoPushToken: string,
  platform: string | null = null,
) {
  if (!expoPushToken.trim()) {
    throw new Error("A push token is required.");
  }

  return registerNotificationToken(supabase, expoPushToken, platform);
}
