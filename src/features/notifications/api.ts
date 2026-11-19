import type { SupabaseClient } from "@supabase/supabase-js";

import type { Language } from "../../i18n/language";

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
  locale: Language | null = null,
) {
  const { data, error } = await supabase.rpc("register_notification_token", {
    target_expo_push_token: expoPushToken,
    target_locale: locale,
    target_platform: platform,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Unable to register notification token.");
  return row as NotificationToken;
}

export type WebSubscriptionJson = { endpoint: string; keys: { auth: string; p256dh: string } };

export async function registerWebPushSubscription(
  supabase: NotificationsSupabaseClient,
  subscription: WebSubscriptionJson,
  origin: string,
  locale: Language | null = null,
) {
  const { error } = await supabase.rpc("register_web_push_subscription", {
    target_locale: locale,
    target_origin: origin,
    target_subscription: subscription,
  });

  if (error) throw error;
}

export async function deactivateMyWebSubscription(supabase: NotificationsSupabaseClient, endpoint: string) {
  const { error } = await supabase.rpc("deactivate_my_web_subscription", { target_endpoint: endpoint });

  if (error) throw error;
}

export async function deactivateMyNotificationToken(supabase: NotificationsSupabaseClient, token: string) {
  const { error } = await supabase.rpc("deactivate_my_notification_token", { target_expo_push_token: token });

  if (error) throw error;
}
