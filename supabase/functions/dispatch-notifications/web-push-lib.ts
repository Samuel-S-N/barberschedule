// @ts-expect-error The Edge runtime (Deno) resolves `npm:` specifiers; the Node TypeScript project cannot.
import webpush from "npm:web-push@3.6.7";

import type { WebSubscription } from "./dispatch.ts";

type Vapid = { privateKey: string; publicKey: string; subject: string };

// The push service answers 201 on success and 404/410 when the subscription is gone; web-push throws a WebPushError for any
// non-2xx, which is turned back into a plain status here so the dispatcher decides what each status means.
export function createWebSender({ privateKey, publicKey, subject }: Vapid) {
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return async (subscription: WebSubscription, message: { body: string; title: string; url: string }) => {
    try {
      const result = await webpush.sendNotification(subscription, JSON.stringify(message), // A hung push service must not stall the whole batch (deliveries run one after another).
      { TTL: 24 * 60 * 60, timeout: 10_000, urgency: "normal" });

      return { status: result.statusCode };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      if (typeof status === "number") return { status };
      throw error;
    }
  };
}
