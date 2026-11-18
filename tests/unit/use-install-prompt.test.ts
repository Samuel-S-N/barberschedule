import { act, renderHook } from "@testing-library/react-native";

jest.mock("../../src/features/install/environment", () => ({ readInstallEnvironment: jest.fn() }));

import { readInstallEnvironment } from "../../src/features/install/environment";
import { useInstallPrompt } from "../../src/features/install/use-install-prompt";

const base = { capturedPrompt: null, isWeb: true, maxTouchPoints: 0, standalone: false, userAgent: "Firefox" };

function fakeWindow() {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const target = {
    addEventListener: jest.fn((type: string, listener: (event: unknown) => void) => { (listeners[type] ??= []).push(listener); }),
    removeEventListener: jest.fn((type: string, listener: (event: unknown) => void) => { listeners[type] = (listeners[type] ?? []).filter((item) => item !== listener); }),
  };

  return { emit: (type: string, event: unknown) => (listeners[type] ?? []).forEach((listener) => listener(event)), listeners, target };
}

describe("useInstallPrompt", () => {
  const originalWindow = globalThis.window;
  afterEach(() => { Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow }); });

  it("starts from the environment", async () => {
    jest.mocked(readInstallEnvironment).mockReturnValue({ ...base, isWeb: false });
    const { result } = await renderHook(() => useInstallPrompt());

    expect(result.current).toEqual({ status: "native" });
  });

  it("switches to the Chrome card when the browser fires beforeinstallprompt, and to installed after appinstalled", async () => {
    const fake = fakeWindow();
    Object.defineProperty(globalThis, "window", { configurable: true, value: fake.target });
    jest.mocked(readInstallEnvironment).mockReturnValue(base);
    const { result } = await renderHook(() => useInstallPrompt());
    const event = { preventDefault: jest.fn(), prompt: jest.fn(), userChoice: Promise.resolve({ outcome: "accepted" }) };

    expect(result.current).toEqual({ status: "unsupported" });
    await act(async () => fake.emit("beforeinstallprompt", event));
    expect(result.current).toEqual({ promptEvent: event, status: "installable-chrome" });
    expect(event.preventDefault).toHaveBeenCalled();

    await act(async () => fake.emit("appinstalled", {}));
    expect(result.current).toEqual({ status: "installed" });
  });

  it("removes its listeners on unmount", async () => {
    const fake = fakeWindow();
    Object.defineProperty(globalThis, "window", { configurable: true, value: fake.target });
    jest.mocked(readInstallEnvironment).mockReturnValue(base);
    const { unmount } = await renderHook(() => useInstallPrompt());

    await act(async () => unmount());

    expect(fake.listeners.beforeinstallprompt).toEqual([]);
    expect(fake.listeners.appinstalled).toEqual([]);
  });
});
