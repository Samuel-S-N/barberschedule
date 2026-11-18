# Web push (multi-shop, part 4) — design

Date: 2026-11-18
Status: draft, waiting for the user's review
Depends on: part 1 (subdomains) and part 3 (service worker, installable app)

## Why

Zenc sends booking, cancellation, reminder and payout notifications through Expo push, which only reaches the native
app. Launching web-first, those notifications would reach nobody outside the in-app inbox. Decided with the user on
2026-11-18: add Web Push next to Expo push and keep the inbox unchanged.

## How it fits today's pipeline

Today: events write rows to `notification_outbox` (and the inbox table); the `dispatch-notifications` Edge Function
calls `claim_notification_batch`, which returns one row per notification and active row in `notification_tokens`, and
posts each to Expo. This part adds a second kind of row in `notification_tokens` and a second sender in the same
function. No new queue, no new job.

## Scope

### 1. Storing web subscriptions

- `notification_tokens` gains `web_subscription jsonb` (the browser's `PushSubscription`: endpoint and keys) and
  `web_origin text` (the shop subdomain it was created on). `expo_push_token` becomes nullable; a check requires
  exactly one of `expo_push_token` / `web_subscription`. Unique on the web endpoint.
- Registration goes through the same RPC path as Expo tokens (extended, own row per browser), and sign-out deactivates
  it like it does Expo tokens.
- `claim_notification_batch` also returns `web_subscription` and `web_origin`.

### 2. Asking permission (client)

- Browsers (and iPhone always) only allow the permission prompt after a tap, so there is no automatic prompt: a
  "Turn on notifications" card next to the install card on each role's profile hub.
- On tap: register `public/sw.js`, `Notification.requestPermission()`, `pushManager.subscribe` with the VAPID public
  key (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`), save the subscription.
- iPhone not installed → the card says to add Zenc to the Home Screen first and opens part 3's guide.
- Denied → the card explains how to re-enable it in the browser settings. Granted and saved → the card shows "on".

### 3. Sending (Edge Function)

- `dispatch-notifications` sends rows with `web_subscription` through Web Push (VAPID; private key and subject as
  function secrets). Library: `npm:web-push` under Deno; the plan starts with a spike to confirm it runs on the Edge
  runtime, with a Deno-native Web Push library as fallback.
- Same localized title and body as Expo (`messages.ts`), plus a `url` to open: `web_origin` + the screen the
  notification is about (the same route the inbox opens).
- A user with subscriptions on several shop subdomains: only the subscription on the notification's own shop gets
  it; if there is none, all of the user's web subscriptions get it.
- 404/410 from the push service → that subscription row is deactivated (like Expo's `DeviceNotRegistered`).

### 4. Service worker

`public/sw.js` adds `push` (show the notification with the Zenc icon and badge) and `notificationclick` (focus an
open Zenc tab on that origin or open the `url`).

## Hosting track (user)

Generate a VAPID key pair once; public key in the web build's env, private key and subject (`mailto:` of the business)
as Edge Function secrets. Push only works over HTTPS (hosted) and on `localhost` for development.

## Out of scope

Reminders for customers without an account (needs a WhatsApp/SMS/email provider decision), notification preferences
per type, changing the inbox.

## Testing

- pgTAP: a web row needs a subscription and no Expo token (and the other way round); endpoint uniqueness; claim
  returns web rows; sign-out deactivation.
- Jest: the permission card states (unsupported, iPhone not installed, default, denied, granted), subscription saved
  with the right origin; the dispatcher's sender choice (Expo vs web, own-shop subscription preferred, 410 →
  deactivated) with mocked senders.
- Browser check on `localhost`: subscribe, trigger a notification, see it, click opens the right screen. Real phones
  (Android Chrome, iPhone installed) once hosted.
