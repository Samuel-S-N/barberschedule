import type { SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type { Language } from "../../i18n/language";
import { isIos } from "../install/install-state";
import { readInstallEnvironment } from "../install/environment";
import { deactivateMyWebSubscription, registerWebPushSubscription } from "./api";
import type { WebSubscriptionJson } from "./api";
import type { WebPushEnvironment } from "./web-push-state";

// A promise that never settles (the service worker failed to register, an offline RPC) must not hang a tap or a sign-out forever.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

// The VAPID public key is a URL-safe base64 string; pushManager.subscribe wants the raw bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = atob(padded);

  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

type Registration = { pushManager: { subscribe: (options: { applicationServerKey: Uint8Array<ArrayBuffer>; userVisibleOnly: true }) => Promise<{ toJSON: () => unknown }> } };

type EnableDeps = {
  getRegistration: () => Promise<Registration>;
  locale: Language | null;
  origin: string;
  publicKey: string;
  requestPermission: () => Promise<NotificationPermission>;
  save: (subscription: WebSubscriptionJson, origin: string, locale: Language | null) => Promise<void>;
};

// Permission is asked FIRST and synchronously inside the tap (iPhone/Safari drop the user activation after an await); part 3 already
// registered public/sw.js at app start, so waiting for it afterwards is quick.
export async function enableWebPush({ getRegistration, locale, origin, publicKey, requestPermission, save }: EnableDeps): Promise<"on" | "denied"> {
  const permission = await requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await getRegistration();
  const subscription = await registration.pushManager.subscribe({ applicationServerKey: urlBase64ToUint8Array(publicKey), userVisibleOnly: true });
  await save(subscription.toJSON() as WebSubscriptionJson, origin, locale);

  return "on";
}

export async function readWebPushEnvironment(): Promise<WebPushEnvironment> {
  const install = readInstallEnvironment();
  const isWeb = install.isWeb;
  const hasServiceWorker = isWeb && "serviceWorker" in navigator;
  const hasPushManager = isWeb && "PushManager" in window;
  const hasNotification = isWeb && "Notification" in window;
  let subscribed = false;

  if (hasServiceWorker && hasPushManager) {
    try {
      subscribed = Boolean(await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription());
    } catch {
      subscribed = false;
    }
  }

  return {
    hasNotification, hasPushManager, hasServiceWorker, isWeb, ios: isIos(install), standalone: install.standalone, subscribed,
    permission: hasNotification ? (Notification.permission as WebPushEnvironment["permission"]) : "default",
  };
}

// Saves the browser's existing subscription for whoever is signed in now (a shared browser's row is re-bound to the new account).
export async function registerCurrentSubscription(supabase: Pick<SupabaseClient, "rpc">, locale: Language | null) {
  const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();

  if (subscription) await registerWebPushSubscription(supabase, subscription.toJSON() as WebSubscriptionJson, window.location.origin, locale);
}

// Called by signOut while the session still exists. Best effort: never blocks signing out.
export async function unsubscribeWebPush(supabase: Pick<SupabaseClient, "rpc">) {
  if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  // Bounded: an offline or hung network must not delay signing out.
  await withTimeout((async () => {
    const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();

    if (subscription) await deactivateMyWebSubscription(supabase, subscription.endpoint);
  })(), 4000);
}

// Settings > Notifications > off: this browser stops receiving pushes. The server row is deactivated first, so a failure keeps the
// browser subscribed and the switch honest; then the browser's own subscription is dropped (a later "on" subscribes afresh).
export async function disableWebPush(supabase: Pick<SupabaseClient, "rpc">) {
  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();

  if (!subscription) return;
  await deactivateMyWebSubscription(supabase, subscription.endpoint);
  await subscription.unsubscribe();
}
