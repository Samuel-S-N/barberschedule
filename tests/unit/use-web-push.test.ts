import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/notifications/web-push", () => ({
  enableWebPush: jest.fn(),
  readWebPushEnvironment: jest.fn(),
  registerCurrentSubscription: jest.fn(),
}));

import { enableWebPush, readWebPushEnvironment, registerCurrentSubscription } from "../../src/features/notifications/web-push";
import { useWebPush } from "../../src/features/notifications/use-web-push";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const env = { hasNotification: true, hasPushManager: true, hasServiceWorker: true, ios: false, isWeb: true, permission: "default", standalone: false, subscribed: false };

describe("useWebPush", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // enable() reads the page origin when it builds the subscribe request.
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://shop-a.zencpro.app" } } });
    jest.mocked(useSupabaseSession).mockReturnValue({ profile: { userId: "u1" }, supabase: {} } as never);
    jest.mocked(registerCurrentSubscription).mockResolvedValue(undefined);
  });
  afterEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });

  it("starts from the browser's state", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    const { result } = await renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.state).toBe("default"));
  });

  it("turns on after a granted permission", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    jest.mocked(enableWebPush).mockResolvedValue("on");
    const { result } = await renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("default"));

    await act(async () => result.current.enable());

    expect(result.current.state).toBe("on");
  });

  it("shows denied after a refused permission", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    jest.mocked(enableWebPush).mockResolvedValue("denied");
    const { result } = await renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("default"));

    await act(async () => result.current.enable());

    expect(result.current.state).toBe("denied");
  });

  it("reports an error when subscribing fails and keeps the card usable", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    jest.mocked(enableWebPush).mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("default"));

    await act(async () => result.current.enable());

    expect(result.current.error).toBe(true);
    expect(result.current.state).toBe("default");
  });

  it("re-saves an existing subscription for the signed-in user", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue({ ...env, permission: "granted", subscribed: true } as never);
    const { result } = await renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.state).toBe("on"));
    expect(registerCurrentSubscription).toHaveBeenCalledTimes(1);
  });
});
