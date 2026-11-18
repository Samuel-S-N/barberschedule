import { Platform } from "react-native";

type Deps = { platform?: string; serviceWorker?: Pick<ServiceWorkerContainer, "register"> | undefined };

// Web only. Registration is best effort: an insecure context or a blocked worker must never break the app.
export async function registerServiceWorker({
  platform = Platform.OS,
  serviceWorker = typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
}: Deps = {}): Promise<void> {
  if (platform !== "web" || !serviceWorker) return;

  try {
    await serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // ignored on purpose
  }
}
