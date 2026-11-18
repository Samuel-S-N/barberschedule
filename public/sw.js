// Minimal service worker: it exists so the browser offers installation (Chrome requires a registered worker with a "fetch"
// listener). It deliberately caches nothing: the app depends on live Supabase data and a stale cache would serve old answers.
// Offline support would need its own design (cache only the static bundle, never API responses).
// The push handlers below show a notification and open the screen it is about.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty: without event.respondWith() the browser uses the network as usual.
});

// Web push. The dispatcher sends { title, body, url } (url = the shop's origin plus the screen the notification is about).
self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Zenc", {
      badge: "/icons/icon-192.png",
      body: data.body || "",
      data: { url: data.url || "/" },
      icon: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === new URL(target).origin);

      if (!open) return self.clients.openWindow(target);

      return open.focus().then((focused) => (focused && "navigate" in focused ? focused.navigate(target) : undefined));
    }),
  );
});
