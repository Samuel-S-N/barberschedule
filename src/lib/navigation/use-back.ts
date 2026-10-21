import { useGlobalSearchParams, useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

import { HISTORY_ROUTES, parentOf, routePattern } from "./parents";

export function useParentHref() {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const pattern = routePattern(segments);

  return { group: segments[0] as string | undefined, href: parentOf(pattern, params), pattern };
}

// Back always goes to the screen's fixed parent, never through the history: after a notification or a tab hop the
// history is not the user's mental model. Customer screens sit in a root Stack (pop back to the parent), owner and
// barber screens are hidden tab screens (switch to the parent), auth screens replace.
export function useBack() {
  const router = useRouter();
  const { group, href, pattern } = useParentHref();

  return () => {
    if (href) {
      if (group === "(customer)") router.dismissTo(href as never);
      else if (group === "(auth)") router.replace(href as never);
      else router.navigate(href as never);

      return;
    }
    if (HISTORY_ROUTES.has(pattern) && router.canGoBack()) router.back();
    else router.replace("/");
  };
}

// Android's hardware/gesture back follows the same parent map; roots keep the default (leave the app).
export function useHardwareBack() {
  const back = useBack();
  const { href } = useParentHref();
  const latest = useRef(back);

  latest.current = back;
  useEffect(() => {
    if (Platform.OS !== "android" || !href) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      latest.current();

      return true;
    });

    return () => subscription.remove();
  }, [href]);
}
