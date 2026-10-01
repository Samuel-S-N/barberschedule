import { Platform } from "react-native";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  getExpoPushTokenAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: "storeClient" },
  default: { easConfig: { projectId: "proj" }, executionEnvironment: "bare", expoConfig: { extra: {} } },
}));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/notifications/register-token", () => ({
  saveExpoPushToken: jest.fn().mockResolvedValue(undefined),
}));

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { saveExpoPushToken } from "../../src/features/notifications/register-token";
import { registerPushToken } from "../../src/features/notifications/use-push-registration";

const supabase = {} as never;
const setOs = (os: string) => jest.replaceProperty(Platform, "OS", os as never);

describe("registerPushToken", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("does nothing on web", async () => {
    setOs("web");

    expect(await registerPushToken(supabase)).toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("skips Expo Go, where expo-notifications throws when loaded", async () => {
    setOs("android");
    jest.replaceProperty(Constants as { executionEnvironment: string }, "executionEnvironment", "storeClient");

    expect(await registerPushToken(supabase)).toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks for permission, then saves the Expo token", async () => {
    setOs("ios");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined" } as never);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "ExponentPushToken[abc]", type: "expo" } as never);

    expect(await registerPushToken(supabase)).toBe("ExponentPushToken[abc]");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj" });
    expect(saveExpoPushToken).toHaveBeenCalledWith(supabase, "ExponentPushToken[abc]", "ios");
  });

  it("does not ask again when permission is already granted", async () => {
    setOs("ios");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "T", type: "expo" } as never);

    await registerPushToken(supabase);

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("saves nothing when permission is denied", async () => {
    setOs("ios");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "denied" } as never);

    expect(await registerPushToken(supabase)).toBeNull();
    expect(saveExpoPushToken).not.toHaveBeenCalled();
  });
});
