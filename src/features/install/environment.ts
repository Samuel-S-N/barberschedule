import { Platform } from "react-native";

import type { BeforeInstallPromptEvent, InstallEnvironment } from "./install-state";

declare global {
  interface Window {
    __zencInstallPromptEvent?: BeforeInstallPromptEvent | null;
  }
}

export function readInstallEnvironment(): InstallEnvironment {
  const isWeb = Platform.OS === "web" && typeof window !== "undefined";
  if (!isWeb) return { capturedPrompt: null, isWeb: false, maxTouchPoints: 0, standalone: false, userAgent: "" };

  const nav = navigator as Navigator & { standalone?: boolean };

  return {
    capturedPrompt: window.__zencInstallPromptEvent ?? null,
    isWeb: true,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || nav.standalone === true,
    userAgent: nav.userAgent ?? "",
  };
}
