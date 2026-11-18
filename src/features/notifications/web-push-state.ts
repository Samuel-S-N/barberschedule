export type WebPushEnvironment = {
  hasNotification: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  ios: boolean;
  isWeb: boolean;
  permission: "default" | "denied" | "granted";
  standalone: boolean;
  subscribed: boolean;
};

export type WebPushState = "hidden" | "ios-install" | "default" | "denied" | "on";

// What the "Turn on notifications" card should offer. iPhone and iPad only have Web Push for an app added to the Home Screen
// (iOS 16.4+), and a plain Safari tab has no PushManager at all, so "iPhone, not installed" is decided before the support check.
export function resolveWebPushState(env: WebPushEnvironment): WebPushState {
  if (!env.isWeb) return "hidden";
  if (env.ios && !env.standalone) return "ios-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "hidden";
  if (env.permission === "denied") return "denied";

  return env.permission === "granted" && env.subscribed ? "on" : "default";
}
