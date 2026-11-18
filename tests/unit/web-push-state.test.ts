import { resolveWebPushState } from "../../src/features/notifications/web-push-state";
import type { WebPushEnvironment } from "../../src/features/notifications/web-push-state";

const env = (patch: Partial<WebPushEnvironment> = {}): WebPushEnvironment => ({
  hasNotification: true, hasPushManager: true, hasServiceWorker: true, ios: false, isWeb: true, permission: "default", standalone: false, subscribed: false, ...patch,
});

describe("resolveWebPushState", () => {
  it.each([
    ["the native app", env({ isWeb: false }), "hidden"],
    ["a browser without service workers", env({ hasServiceWorker: false }), "hidden"],
    ["a browser without the Push API", env({ hasPushManager: false }), "hidden"],
    ["a browser without Notifications", env({ hasNotification: false }), "hidden"],
    ["an iPhone where Zenc is not installed", env({ hasPushManager: false, ios: true }), "ios-install"],
    ["an installed iPhone app", env({ ios: true, standalone: true }), "default"],
    ["an installed iPhone app with notifications on", env({ ios: true, permission: "granted", standalone: true, subscribed: true }), "on"],
    ["permission not asked yet", env(), "default"],
    ["permission denied", env({ permission: "denied" }), "denied"],
    ["permission granted and saved", env({ permission: "granted", subscribed: true }), "on"],
    ["permission granted but the subscription is gone", env({ permission: "granted" }), "default"],
  ])("%s", (_name, environment, expected) => {
    expect(resolveWebPushState(environment)).toBe(expected);
  });
});
