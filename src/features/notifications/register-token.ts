import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentLanguage } from "../../i18n";
import type { Language } from "../../i18n/language";
import { registerNotificationToken } from "./api";

type NotificationsSupabaseClient = Pick<SupabaseClient, "rpc">;

export async function saveExpoPushToken(
  supabase: NotificationsSupabaseClient,
  expoPushToken: string,
  platform: string | null = null,
  locale: Language | null = getCurrentLanguage(),
) {
  if (!expoPushToken.trim()) {
    throw new Error("A push token is required.");
  }

  return registerNotificationToken(supabase, expoPushToken, platform, locale);
}
