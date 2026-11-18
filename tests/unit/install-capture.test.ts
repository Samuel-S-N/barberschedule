import vm from "vm";

import { INSTALL_CAPTURE_SCRIPT } from "../../src/features/install/capture-script";

function run() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const window: Record<string, unknown> = { addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => { listeners[type] = listener; } };

  vm.runInNewContext(INSTALL_CAPTURE_SCRIPT, { window });

  return { listeners, window };
}

describe("INSTALL_CAPTURE_SCRIPT", () => {
  it("keeps the beforeinstallprompt event for the app and stops the browser's own mini-infobar", () => {
    const { listeners, window } = run();
    const event = { preventDefault: jest.fn() };

    listeners.beforeinstallprompt(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.__zencInstallPromptEvent).toBe(event);
  });

  it("forgets the event once the app is installed", () => {
    const { listeners, window } = run();

    listeners.beforeinstallprompt({ preventDefault: jest.fn() });
    listeners.appinstalled({});

    expect(window.__zencInstallPromptEvent).toBeNull();
  });
});
