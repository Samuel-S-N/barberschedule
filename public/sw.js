// Minimal service worker: it exists so the browser offers installation (Chrome requires a registered worker with a "fetch"
// listener). It deliberately caches nothing: the app depends on live Supabase data and a stale cache would serve old answers.
// Offline support would need its own design (cache only the static bundle, never API responses).
// Web push (multi-shop part 4) adds its `push` and `notificationclick` handlers below.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty: without event.respondWith() the browser uses the network as usual.
});
