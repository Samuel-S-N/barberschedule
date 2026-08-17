import { registerNotificationToken } from "../../src/features/notifications/api";
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
      target_platform: "ios",
    });
  });

  it("rejects an empty token before making a request", async () => {
    await expect(saveExpoPushToken({ rpc: jest.fn() } as never, " ", "android"))
      .rejects.toThrow("A push token is required.");
  });
});
