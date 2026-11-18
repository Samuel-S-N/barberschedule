import { useCallback, useEffect, useRef, useState } from "react";

import { getCurrentLanguage } from "../../i18n";
import { useSupabaseSession } from "../../providers/AppProviders";
import { registerWebPushSubscription } from "./api";
import { enableWebPush, readWebPushEnvironment, registerCurrentSubscription, withTimeout } from "./web-push";
import { resolveWebPushState } from "./web-push-state";
import type { WebPushState } from "./web-push-state";

// Expo inlines EXPO_PUBLIC_* only for literal reads.
const vapidPublicKey = () => process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function useWebPush(): { enable: () => Promise<void>; error: boolean; state: WebPushState } {
  const { profile, supabase } = useSupabaseSession();
  const [state, setState] = useState<WebPushState>("hidden");
  const [error, setError] = useState(false);
  const rebound = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    void readWebPushEnvironment().then((environment) => {
      if (!active) return;
      setState(resolveWebPushState(environment));

      // Permission already granted and a subscription exists: make sure it belongs to this signed-in user (once per user).
      if (environment.permission === "granted" && environment.subscribed && profile?.userId && rebound.current !== profile.userId) {
        rebound.current = profile.userId;
        void registerCurrentSubscription(supabase, getCurrentLanguage()).catch(() => undefined);
      }
    });

    return () => {
      active = false;
    };
  }, [profile?.userId, supabase]);

  const enable = useCallback(async () => {
    setError(false);
    try {
      const outcome = await enableWebPush({
        getRegistration: () => withTimeout(navigator.serviceWorker.ready, 8000),
        locale: getCurrentLanguage(),
        origin: window.location.origin,
        publicKey: vapidPublicKey(),
        requestPermission: () => Notification.requestPermission(),
        save: (subscription, origin, locale) => registerWebPushSubscription(supabase, subscription, origin, locale),
      });

      setState(outcome === "on" ? "on" : "denied");
    } catch {
      setError(true);
    }
  }, [supabase]);

  return { enable, error, state };
}
