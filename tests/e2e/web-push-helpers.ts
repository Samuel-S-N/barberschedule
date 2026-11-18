import type { Page } from "@playwright/test";

// Chrome's real push service needs the network and a real VAPID key; the e2e fakes only the subscription itself.
export async function stubPushSubscription(page: Page) {
  await page.addInitScript(() => {
    const subscription = { endpoint: "https://push.example/e2e", keys: { auth: "e2e-auth", p256dh: "e2e-p256dh" } };

    PushManager.prototype.subscribe = async function subscribe() {
      return { endpoint: subscription.endpoint, toJSON: () => subscription } as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function getSubscription() {
      return (window as unknown as { __subscribed?: boolean }).__subscribed ? ({ endpoint: subscription.endpoint, toJSON: () => subscription } as unknown as PushSubscription) : null;
    };
  });
}
