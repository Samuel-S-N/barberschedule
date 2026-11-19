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

export type PromptKind = "ask" | "install";

// What the first-sign-in pop-up should do: ask (permission not decided yet), point an iPhone to the install guide, or stay silent
// (unsupported browser, or the permission is already granted/denied).
export function resolvePromptKind(env: WebPushEnvironment): PromptKind | null {
  if (!env.isWeb) return null;
  if (env.ios && !env.standalone) return "install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return null;

  return env.permission === "default" ? "ask" : null;
}
