// Inlined in <head> (app/+html.tsx). Chrome fires `beforeinstallprompt` once, often before the React bundle has mounted, so the
// event is parked on `window` for useInstallPrompt to pick up.
export const INSTALL_CAPTURE_SCRIPT = `
window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  window.__zencInstallPromptEvent = event;
});
window.addEventListener("appinstalled", function () {
  window.__zencInstallPromptEvent = null;
});
`;
