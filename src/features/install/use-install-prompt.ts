import { useEffect, useState } from "react";

import { readInstallEnvironment } from "./environment";
import { resolveInstallState } from "./install-state";
import type { BeforeInstallPromptEvent, InstallState } from "./install-state";

// What the install card should offer right now. Chrome may have fired beforeinstallprompt before this mounted (the head script
// kept it); otherwise the listener below catches it.
export function useInstallPrompt(): InstallState {
  const [state, setState] = useState<InstallState>(() => resolveInstallState(readInstallEnvironment()));

  useEffect(() => {
    const environment = readInstallEnvironment();
    if (!environment.isWeb || environment.standalone) return undefined;
    // An event the head script stored between the first render and now would otherwise never reach the state.
    if (environment.capturedPrompt) setState(resolveInstallState(environment));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setState({ promptEvent: event as BeforeInstallPromptEvent, status: "installable-chrome" });
    };
    const onInstalled = () => setState({ status: "installed" });

    const target = window;

    target.addEventListener("beforeinstallprompt", onPrompt);
    target.addEventListener("appinstalled", onInstalled);

    return () => {
      target.removeEventListener("beforeinstallprompt", onPrompt);
      target.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return state;
}
