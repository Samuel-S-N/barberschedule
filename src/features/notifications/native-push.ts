import Constants, { ExecutionEnvironment } from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deactivateMyNotificationToken } from "./api";
import { setNativePushDisabled } from "./native-push-preference";
import { registerPushToken } from "./use-push-registration";

// Remote push needs a real build: Expo Go (SDK 53+) removed it, and Android needs the topic-subscription native module.
export function nativePushSupported() {
  if (Platform.OS === "web") return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  if (Platform.OS === "android" && !requireOptionalNativeModule("ExpoTopicSubscriptionModule")) return false;

  return true;
}

export async function readNativePermission(): Promise<"denied" | "granted" | "undetermined" | "unsupported"> {
  if (!nativePushSupported()) return "unsupported";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");
  const { status } = await Notifications.getPermissionsAsync();

  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

export async function enableNativePush(supabase: Parameters<typeof registerPushToken>[0]): Promise<"denied" | "on" | "unsupported"> {
  if (!nativePushSupported()) return "unsupported";
  await setNativePushDisabled(false);
  const token = await registerPushToken(supabase, { ask: true });

  return token ? "on" : "denied";
}

export async function disableNativePush(supabase: Pick<SupabaseClient, "rpc">) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");
  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

  if (projectId) await deactivateMyNotificationToken(supabase, (await Notifications.getExpoPushTokenAsync({ projectId })).data);
  await setNativePushDisabled(true);
}
