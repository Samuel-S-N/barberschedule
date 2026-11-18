import { deactivateMyWebSubscription, registerNotificationToken, registerWebPushSubscription } from "../../src/features/notifications/api";
import { saveExpoPushToken } from "../../src/features/notifications/register-token";

describe("notification token contracts", () => {
  it("registers a token through the authenticated RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ active: true, expo_push_token: "ExponentPushToken[test]", platform: "ios" }],
      error: null,
    });

    await expect(registerNotificationToken({ rpc } as never, "ExponentPushToken[test]", "ios"))
      .resolves.toMatchObject({ expo_push_token: "ExponentPushToken[test]" });

    expect(rpc).toHaveBeenCalledWith("register_notification_token", {
      target_expo_push_token: "ExponentPushToken[test]",
      target_locale: null,
      target_platform: "ios",
    });
  });

  it("sends the device locale when given", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ active: true, expo_push_token: "t", platform: "ios" }], error: null });

    await registerNotificationToken({ rpc } as never, "t", "ios", "pt");

    expect(rpc).toHaveBeenCalledWith("register_notification_token", {
      target_expo_push_token: "t",
      target_locale: "pt",
      target_platform: "ios",
    });
  });

  it("saveExpoPushToken defaults to the current app language", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ active: true, expo_push_token: "t", platform: "ios" }], error: null });

    await saveExpoPushToken({ rpc } as never, "t", "ios");

    expect(rpc).toHaveBeenCalledWith("register_notification_token", expect.objectContaining({ target_locale: "en" }));
  });

  it("rejects an empty token before making a request", async () => {
    await expect(saveExpoPushToken({ rpc: jest.fn() } as never, " ", "android"))
      .rejects.toThrow("A push token is required.");
  });
});


describe("web push subscription contracts", () => {
  it("registers a subscription through the authenticated RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ active: true }], error: null });
    const subscription = { endpoint: "https://push.example/a", keys: { auth: "a", p256dh: "p" } };

    await registerWebPushSubscription({ rpc } as never, subscription, "https://shop-a.zencpro.app", "pt");

    expect(rpc).toHaveBeenCalledWith("register_web_push_subscription", { target_locale: "pt", target_origin: "https://shop-a.zencpro.app", target_subscription: subscription });
  });

  it("throws the RPC error", async () => {
    await expect(registerWebPushSubscription({ rpc: jest.fn().mockResolvedValue({ data: null, error: new Error("nope") }) } as never, { endpoint: "https://x", keys: { auth: "a", p256dh: "p" } }, "https://a")).rejects.toThrow("nope");
  });

  it("switches the caller's own subscription off", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await deactivateMyWebSubscription({ rpc } as never, "https://push.example/a");

    expect(rpc).toHaveBeenCalledWith("deactivate_my_web_subscription", { target_endpoint: "https://push.example/a" });
  });
});
