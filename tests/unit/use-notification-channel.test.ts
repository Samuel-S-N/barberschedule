import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";

jest.mock("../../src/features/notifications/use-web-push", () => ({ useWebPush: jest.fn() }));
jest.mock("../../src/features/notifications/native-push", () => ({
  disableNativePush: jest.fn(), enableNativePush: jest.fn(), nativePushSupported: jest.fn(), readNativePermission: jest.fn(),
}));
jest.mock("../../src/features/notifications/native-push-preference", () => ({ isNativePushDisabled: jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));

import * as native from "../../src/features/notifications/native-push";
import { isNativePushDisabled } from "../../src/features/notifications/native-push-preference";
import { useNotificationChannel } from "../../src/features/notifications/use-notification-channel";
import { useWebPush } from "../../src/features/notifications/use-web-push";

const disableWeb = jest.fn();
const web = (state: string) => jest.mocked(useWebPush).mockReturnValue({ disable: disableWeb, enable: jest.fn(), error: false, state } as never);

describe("useNotificationChannel on the web", () => {
  beforeEach(() => jest.replaceProperty(Platform, "OS", "web" as never));
  afterEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });

  it.each([["hidden", "unsupported"], ["ios-install", "install"], ["default", "off"], ["denied", "denied"], ["on", "on"]] as const)("maps web state %s to %s", async (webState, expected) => {
    web(webState);
    const { result } = await renderHook(() => useNotificationChannel());

    expect(result.current.state).toBe(expected);
  });

  it("disable goes to Web Push", async () => {
    web("on");
    const { result } = await renderHook(() => useNotificationChannel());

    await act(async () => { await result.current.disable(); });

    expect(disableWeb).toHaveBeenCalledTimes(1);
  });
});

describe("useNotificationChannel on a phone", () => {
  beforeEach(() => { jest.replaceProperty(Platform, "OS", "android" as never); web("hidden"); });
  afterEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });

  it("is unsupported where remote push cannot work (Expo Go)", async () => {
    jest.mocked(native.nativePushSupported).mockReturnValue(false);
    const { result } = await renderHook(() => useNotificationChannel());

    await act(async () => undefined);

    expect(result.current.state).toBe("unsupported");
  });

  it.each([["granted", false, "on"], ["granted", true, "off"], ["undetermined", false, "off"], ["denied", false, "denied"]] as const)("permission %s (switched off: %s) is %s", async (permission, off, expected) => {
    jest.mocked(native.nativePushSupported).mockReturnValue(true);
    jest.mocked(native.readNativePermission).mockResolvedValue(permission);
    jest.mocked(isNativePushDisabled).mockResolvedValue(off);
    const { result } = await renderHook(() => useNotificationChannel());

    await act(async () => undefined);

    expect(result.current.state).toBe(expected);
  });

  it("enable and disable go to the Expo registration and refresh the state", async () => {
    jest.mocked(native.nativePushSupported).mockReturnValue(true);
    jest.mocked(native.readNativePermission).mockResolvedValue("granted");
    jest.mocked(isNativePushDisabled).mockResolvedValue(false);
    jest.mocked(native.enableNativePush).mockResolvedValue("on");
    jest.mocked(native.disableNativePush).mockResolvedValue(undefined);
    const { result } = await renderHook(() => useNotificationChannel());

    await act(async () => { await result.current.enable(); });
    await act(async () => { await result.current.disable(); });

    expect(native.enableNativePush).toHaveBeenCalledTimes(1);
    expect(native.disableNativePush).toHaveBeenCalledTimes(1);
  });
});
