import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { useSupabaseSession } from "../../providers/AppProviders";
import { disableNativePush, enableNativePush, nativePushSupported, readNativePermission } from "./native-push";
import { isNativePushDisabled } from "./native-push-preference";
import { useWebPush } from "./use-web-push";

export type ChannelState = "denied" | "install" | "off" | "on" | "unsupported";

const FROM_WEB = { default: "off", denied: "denied", hidden: "unsupported", "ios-install": "install", on: "on" } as const;

// One view of "can this device get notifications, and are they on": Web Push in a browser, the Expo push token on a phone.
export function useNotificationChannel(): { busy: boolean; disable: () => Promise<void>; enable: () => Promise<void>; error: boolean; state: ChannelState } {
  const { supabase } = useSupabaseSession();
  const web = useWebPush();
  const [native, setNative] = useState<ChannelState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [nativeError, setNativeError] = useState(false);
  const onWeb = Platform.OS === "web";

  const readNative = useCallback(async () => {
    if (!nativePushSupported()) return setNative("unsupported");
    const permission = await readNativePermission();

    if (permission === "denied") return setNative("denied");
    setNative(permission === "granted" && !(await isNativePushDisabled()) ? "on" : "off");
  }, []);

  useEffect(() => {
    if (!onWeb) void readNative();
  }, [onWeb, readNative]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setNativeError(false);
    try {
      await action();
      await readNative();
    } catch {
      setNativeError(true);
    } finally {
      setBusy(false);
    }
  };

  if (onWeb) return { busy: false, disable: web.disable, enable: web.enable, error: web.error, state: FROM_WEB[web.state] };

  return { busy, disable: () => run(() => disableNativePush(supabase)), enable: () => run(() => enableNativePush(supabase)), error: nativeError, state: native };
}
