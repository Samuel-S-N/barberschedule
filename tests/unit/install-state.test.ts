import { isIos, resolveInstallState } from "../../src/features/install/install-state";
import type { InstallEnvironment } from "../../src/features/install/install-state";

const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";

const env = (patch: Partial<InstallEnvironment>): InstallEnvironment => ({ capturedPrompt: null, isWeb: true, maxTouchPoints: 0, standalone: false, userAgent: FIREFOX, ...patch });
const prompt = { prompt: jest.fn(), userChoice: Promise.resolve({ outcome: "accepted" as const }) } as never;

describe("resolveInstallState", () => {
  it.each([
    ["the native app", env({ isWeb: false }), { status: "native" }],
    ["an installed web app", env({ standalone: true, userAgent: CHROME_ANDROID }), { status: "installed" }],
    ["Chrome with a captured prompt", env({ capturedPrompt: prompt, userAgent: CHROME_ANDROID }), { promptEvent: prompt, status: "installable-chrome" }],
    ["Safari on iPhone", env({ maxTouchPoints: 5, userAgent: SAFARI_IPHONE }), { browser: "other", status: "installable-ios" }],
    ["Chrome on iPhone", env({ maxTouchPoints: 5, userAgent: CHROME_IPHONE }), { browser: "chrome", status: "installable-ios" }],
    ["an iPad in desktop mode", env({ maxTouchPoints: 5, userAgent: SAFARI_MAC }), { browser: "other", status: "installable-ios" }],
    ["Safari on a Mac", env({ userAgent: SAFARI_MAC }), { status: "installable-mac-safari" }],
    ["Chrome on a Mac without a prompt", env({ userAgent: CHROME_MAC }), { status: "unsupported" }],
    ["Firefox", env({}), { status: "unsupported" }],
  ])("%s", (_name, environment, expected) => {
    expect(resolveInstallState(environment)).toEqual(expected);
  });

  it("an installed app wins over a stale captured prompt", () => {
    expect(resolveInstallState(env({ capturedPrompt: prompt, standalone: true }))).toEqual({ status: "installed" });
  });
});

describe("isIos", () => {
  it("is true for iPhone and for an iPad that reports as a Mac with touch", () => {
    expect(isIos(env({ userAgent: SAFARI_IPHONE }))).toBe(true);
    expect(isIos(env({ maxTouchPoints: 5, userAgent: SAFARI_MAC }))).toBe(true);
  });

  it("is false for a real Mac and for Android", () => {
    expect(isIos(env({ userAgent: SAFARI_MAC }))).toBe(false);
    expect(isIos(env({ userAgent: CHROME_ANDROID }))).toBe(false);
  });
});
