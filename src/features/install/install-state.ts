export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallEnvironment = {
  capturedPrompt: BeforeInstallPromptEvent | null;
  isWeb: boolean;
  maxTouchPoints: number;
  standalone: boolean;
  userAgent: string;
};

export type InstallState =
  | { status: "native" }
  | { status: "installed" }
  | { promptEvent: BeforeInstallPromptEvent; status: "installable-chrome" }
  | { browser: "chrome" | "other"; status: "installable-ios" }
  | { status: "installable-mac-safari" }
  | { status: "unsupported" };

const lower = (env: InstallEnvironment) => env.userAgent.toLowerCase();

// iPadOS 13+ announces itself as "Macintosh" (desktop mode): only multi-touch gives an iPad away.
const isTouchMac = (env: InstallEnvironment) => /macintosh/.test(lower(env)) && env.maxTouchPoints > 1;

// Every browser on iOS/iPadOS runs on Apple's WebKit and has the same "Add to Home Screen" in the system share sheet,
// so Chrome, Firefox and Edge on iPhone need the same guide as Safari.
export const isIos = (env: InstallEnvironment) => /iphone|ipad|ipod/.test(lower(env)) || isTouchMac(env);

// Only Chrome on iOS has a fixed position for the item (the browser's own ⋯ menu); Safari's toolbar layout varies with the user's
// settings, so its guide covers both possibilities in the step text.
const iosBrowser = (env: InstallEnvironment) => (/crios/.test(lower(env)) ? "chrome" : "other");

// Safari on macOS never fires beforeinstallprompt and says "Add to Dock", not "Add to Home Screen".
const isMacSafari = (env: InstallEnvironment) =>
  /macintosh/.test(lower(env)) && !isTouchMac(env) && /safari/.test(lower(env)) && !/chrome|chromium|crios|edg|opr|firefox|fxios/.test(lower(env));

export function resolveInstallState(env: InstallEnvironment): InstallState {
  if (!env.isWeb) return { status: "native" };
  if (env.standalone) return { status: "installed" };
  if (env.capturedPrompt) return { promptEvent: env.capturedPrompt, status: "installable-chrome" };
  if (isIos(env)) return { browser: iosBrowser(env), status: "installable-ios" };
  if (isMacSafari(env)) return { status: "installable-mac-safari" };

  return { status: "unsupported" };
}
