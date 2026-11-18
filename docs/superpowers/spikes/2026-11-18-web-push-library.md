Decision: Path A (npm:web-push@3.6.7)

# Spike: `npm:web-push` on the Supabase Edge runtime (multi-shop part 4)

Date: 2026-11-18. Question: does `npm:web-push` run on the Supabase Edge runtime (local `supabase functions serve`, supabase-edge-runtime 1.74.3, Deno 2.1.4), or do we need a Deno-native Web Push library?

## What was run
A throwaway function (deleted) imported `npm:web-push@3.6.7`, called `setVapidDetails(subject, publicKey, privateKey)` with a freshly generated local VAPID pair (git-ignored `supabase/functions/.env`) and `sendNotification(subscription, JSON.stringify({ title, body, url }), { TTL: 60 })`. The subscription had a valid P-256 `p256dh` key (65 bytes) and a 16-byte `auth` secret generated with Node `crypto`, and the endpoint was `https://httpbin.org/status/201` (a public HTTPS server that answers 201 to any POST).

## Result: GO
- The function booted with no import or runtime error (`createECDH`, `http_ece`/aes128gcm payload encryption and the VAPID JWT signing all ran: the payload was non-empty, so the encryption path was exercised).
- The library did a real HTTPS POST and the function returned `{"status":201}`.
- Cold start: first call 12.4 s (npm install of the package inside the runtime), second call 1.4 s.

## What could not be verified here
A real push service (FCM) accepting and delivering the message to a browser. Chrome started by Playwright refuses `pushManager.subscribe` with "Registration failed - permission denied" even with the notification permission granted (headless and headed; `Notification.permission` is `granted` and the page is a secure context), so no real subscription could be created in this environment. Delivery to a real browser and a phone therefore stays on the user's checklist once hosted. The local browser check of this part instead stubs `PushManager.subscribe` (a fake subscription), triggers the dispatcher, and observes the payload at the service-worker level.

## Path
Path A: `createWebSender` uses `npm:web-push@3.6.7`; the fallbacks (a Deno-native library, then a hand-written RFC 8291/8292 sender) were not needed.
