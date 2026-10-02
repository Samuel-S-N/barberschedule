import { focusManager } from "@tanstack/react-query";
import type { AppStateStatus } from "react-native";

type AppStateLike = { addEventListener: (type: "change", listener: (state: AppStateStatus) => void) => { remove: () => void } };

// React Native has no window focus: tell React Query the app is "focused" while it is in the foreground, so
// coming back to the app (from WhatsApp, the lock screen, another app) refetches whatever is on screen.
export function bindQueryFocusToAppState(appState: AppStateLike) {
  const subscription = appState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));

  return () => subscription.remove();
}
