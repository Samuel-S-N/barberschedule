import { Platform } from "react-native";

jest.mock("expo-notifications", () => ({ getExpoPushTokenAsync: jest.fn(), getPermissionsAsync: jest.fn() }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: "storeClient" },
  default: { easConfig: { projectId: "proj" }, executionEnvironment: "bare", expoConfig: { extra: {} } },
}));
const mockModuleProbe = jest.fn();

jest.mock("expo-modules-core", () => ({ requireOptionalNativeModule: (name: string) => mockModuleProbe(name) }));
jest.mock("../../src/features/notifications/api", () => ({ deactivateMyNotificationToken: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/features/notifications/native-push-preference", () => ({ isNativePushDisabled: jest.fn(), setNativePushDisabled: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/features/notifications/use-push-registration", () => ({ registerPushToken: jest.fn() }));

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { deactivateMyNotificationToken } from "../../src/features/notifications/api";
import { disableNativePush, enableNativePush, nativePushSupported, readNativePermission } from "../../src/features/notifications/native-push";
import { setNativePushDisabled } from "../../src/features/notifications/native-push-preference";
import { registerPushToken } from "../../src/features/notifications/use-push-registration";

const setOs = (os: string) => jest.replaceProperty(Platform, "OS", os as never);

describe("native push helpers", () => {
  beforeEach(() => mockModuleProbe.mockReturnValue({}));
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("is unsupported on the web, in Expo Go and on Android without the native module", () => {
    setOs("web");
    expect(nativePushSupported()).toBe(false);
    setOs("android");
    jest.replaceProperty(Constants as { executionEnvironment: string }, "executionEnvironment", "storeClient");
    expect(nativePushSupported()).toBe(false);
    jest.replaceProperty(Constants as { executionEnvironment: string }, "executionEnvironment", "bare");
    mockModuleProbe.mockReturnValueOnce(null);
    expect(nativePushSupported()).toBe(false);
  });

  it("is supported on a real build", () => {
    setOs("ios");
    jest.replaceProperty(Constants as { executionEnvironment: string }, "executionEnvironment", "bare");

    expect(nativePushSupported()).toBe(true);
  });

  it("reads the permission as granted, denied, undetermined or unsupported", async () => {
    setOs("ios");
    jest.replaceProperty(Constants as { executionEnvironment: string }, "executionEnvironment", "bare");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ status: "granted" } as never).mockResolvedValueOnce({ status: "denied" } as never).mockResolvedValueOnce({ status: "undetermined" } as never);

    expect(await readNativePermission()).toBe("granted");
    expect(await readNativePermission()).toBe("denied");
    expect(await readNativePermission()).toBe("undetermined");
    setOs("web");
    expect(await readNativePermission()).toBe("unsupported");
  });

  it("enable clears the off flag and asks for permission through the registration", async () => {
    setOs("ios");
    jest.replaceProperty(Constants as { executionEnvironment: string }, "executionEnvironment", "bare");
    jest.mocked(registerPushToken).mockResolvedValueOnce("ExponentPushToken[a]").mockResolvedValueOnce(null);

    expect(await enableNativePush({} as never)).toBe("on");
    expect(setNativePushDisabled).toHaveBeenCalledWith(false);
    expect(registerPushToken).toHaveBeenCalledWith({}, { ask: true });
    expect(await enableNativePush({} as never)).toBe("denied");
  });

  it("disable deactivates this device's token and sets the off flag", async () => {
    setOs("ios");
    jest.replaceProperty(Constants as { executionEnvironment: string }, "executionEnvironment", "bare");
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "ExponentPushToken[a]", type: "expo" } as never);

    await disableNativePush({} as never);

    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj" });
    expect(deactivateMyNotificationToken).toHaveBeenCalledWith({}, "ExponentPushToken[a]");
    expect(setNativePushDisabled).toHaveBeenCalledWith(true);
  });
});
