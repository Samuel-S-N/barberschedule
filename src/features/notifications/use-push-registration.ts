import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useSupabaseSession } from "../../providers/AppProviders";
import { saveExpoPushToken } from "./register-token";

// Show pushes that arrive while the app is open, without sound or badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushToken(supabase: Parameters<typeof saveExpoPushToken>[0]) {
  if (Platform.OS === "web") return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: "default",
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return null;

  const projectId =
    Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await saveExpoPushToken(supabase, data, Platform.OS);

  return data;
}

// Best effort: simulators, denied permissions and offline starts must never break the app.
export function usePushRegistration(enabled: boolean) {
  const { supabase } = useSupabaseSession();

  useEffect(() => {
    if (enabled) void registerPushToken(supabase).catch(() => undefined);
  }, [enabled, supabase]);
}
