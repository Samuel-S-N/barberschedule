# Web push (multi-shop, part 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Booking, cancellation, reminder and payout notifications also reach people on the web: a browser can subscribe to Web Push from a card on each role's profile hub, and the existing `dispatch-notifications` Edge Function sends to Expo tokens and to web subscriptions from the same outbox, leaving the in-app inbox unchanged.

**Architecture:** `notification_tokens` gets a second kind of row (a browser `PushSubscription` plus the shop origin it was created on). `claim_notification_batch` returns the web fields plus the notification's shop slug and the recipient's role. The Edge Function's decision logic moves into pure, tested modules (`dispatch.ts`, target selection, route mapping) and gains a web sender behind a one-function interface, so the push library chosen in the spike is the only library-specific code. The service worker (part 3's `public/sw.js`) shows the notification and opens the right screen. A permission card sits next to part 3's install card.

**Tech Stack:** Supabase (Postgres + pgTAP, Edge Function on Deno), `npm:web-push` (or the spike's fallback), service worker + Push API + Notifications API, Expo Router / React Native web, Jest (jest-expo, RNTL 14 async `render`/`renderHook`), Playwright (system Chrome).

**Spec:** `docs/superpowers/specs/2026-11-18-web-push-design.md`

**Branch:** `feat-web-push`, cut from `feat-installable-web` after part 3 is complete (`git checkout -b feat-web-push feat-installable-web`). Last of the stack.

**Prerequisites from earlier parts:** part 1 (`shops.slug`, shop subdomains, `*.localhost` browser checks, Playwright fixture `tests/e2e/fixtures.ts`), part 2 (`supabase/functions/_shared/` exists, migrations to 0071, pgTAP to 053, errors to P0042), part 3 (`public/sw.js` with install/activate/fetch and its registration at app start, `src/features/install/{install-state,environment,use-install-prompt,InstallGuide,InstallPrompt}`, `isIos`, `readInstallEnvironment`, `resolveInstallState`, Playwright `serviceWorkers: "block"` by default). This plan uses migrations **0072** and **0073**, pgTAP **054** and **055**.

## Open questions for the orchestrator

None changes the approved design; each says what this plan does meanwhile.

1. **"Sign-out deactivates it like it does Expo tokens" is not true today.** `signOut` (`src/features/auth/api.ts:88`) only calls `supabase.auth.signOut()`; Expo tokens are deactivated only by the dispatcher on `DeviceNotRegistered` (`deactivate_notification_token`, service role). **Plan does:** a new user-callable RPC `deactivate_my_web_subscription(endpoint)` and a web-only call to it from `signOut`, before the session ends. Expo tokens keep today's behaviour (out of scope; a shared phone keeps the previous user's token active until the next registration re-binds it).
2. **"Registration goes through the same RPC path (extended)"** is read as "next to it": `register_notification_token` validates an Expo token with a regex and keys its upsert on `expo_push_token`; folding a JSON subscription into it would mix two shapes in one signature. **Plan does:** a sibling `register_web_push_subscription(target_subscription jsonb, target_origin text, target_locale text)` with the same security pattern, error codes (`P0016`) and upsert-by-endpoint, own row per browser.
3. **The function needs the VAPID public key too.** The spec lists the private key and subject as function secrets and the public key as a web build variable; `web-push`'s `setVapidDetails` needs all three. **Plan does:** three secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) plus `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in the web build, same public value.
4. **How the function learns a notification's shop and screen.** The spec needs "the notification's own shop" and "the same route the inbox opens" but the claim returns neither. Outbox payloads carry `shop_id` only for appointment events (`0021`, `0022`); recurrence and payout payloads do not, and the route depends on the recipient's role. **Plan does:** `claim_notification_batch` also returns `shop_slug` (from `payload.shop_id`, null when absent) and `recipient_role`; when `shop_slug` is null (recurrence/payout events) the "own shop" preference cannot apply and the notification goes to **all** of the user's web subscriptions, which is the spec's own fallback.
5. **Account data export lists tokens** (`export_my_data`, migration 0054) as `right(expo_push_token, 6)`, which would be null for web rows. **Plan does:** migration 0073 re-creates the function to show `web_origin` for web rows and never exposes the subscription keys.
6. **`Notification.requestPermission()` must run directly in the tap handler on iPhone/Safari** (an `await` before it can lose the user activation). The spec lists "register `public/sw.js`, request permission, subscribe"; part 3 already registers the worker at app start, so **plan does** request permission first, then wait for the already-registered worker (`serviceWorker.ready`), then subscribe.
7. **Badge icon:** the spec says the notification uses "the Zenc icon and badge". Android renders a badge from the alpha channel, so the full-bleed ink icon becomes a solid shape in the status bar. **Plan does** what the spec says (`icon-192.png` for both); a monochrome badge asset is a later polish item.
8. **Expo Go and the native app are untouched:** every web path is guarded by `Platform.OS === "web"`.

## Global Constraints

- `notification_tokens` gains `web_subscription jsonb` (the browser's `PushSubscription`: endpoint and keys) and `web_origin text` (the shop subdomain it was created on). `expo_push_token` becomes nullable; a check requires **exactly one** of `expo_push_token` / `web_subscription`. Unique on the web endpoint. `claim_notification_batch` also returns `web_subscription` and `web_origin`.
- No automatic permission prompt: browsers (and iPhone always) only allow it after a tap, so a "Turn on notifications" card sits next to the install card on each role's profile hub. On tap: register/await `public/sw.js`, `Notification.requestPermission()`, `pushManager.subscribe` with the VAPID public key (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`), save the subscription. iPhone not installed: the card says to add Zenc to the Home Screen first and opens part 3's guide. Denied: the card explains how to re-enable it in the browser settings. Granted and saved: the card shows "on".
- `dispatch-notifications` sends rows with `web_subscription` through Web Push (VAPID; private key and subject as function secrets), same localized title and body as Expo (`messages.ts`) plus a `url` to open: `web_origin` + the screen the notification is about (the same route the inbox opens). A user with subscriptions on several shop subdomains: only the subscription on the notification's own shop gets it; if there is none, all of the user's web subscriptions get it. 404/410 from the push service deactivates that subscription row (like Expo's `DeviceNotRegistered`).
- `public/sw.js` adds `push` (show the notification with the Zenc icon and badge) and `notificationclick` (focus an open Zenc tab on that origin or open the `url`).
- Push only works over HTTPS (hosted) and on `localhost` for development. Out of scope: reminders for customers without an account, per-type preferences, changing the inbox.
- Spikes first: Task 1 confirms `npm:web-push` on the Supabase Edge runtime (fallback: a Deno-native Web Push library, then hand-written RFC 8291/8292 with WebCrypto).
- Project conventions: texts in pt/es/en with parity (`tests/unit/locale-parity.test.ts`); new routes need `parents.ts` (none here); pop-ups are centred floating windows (reused from part 3); colours by tokens; every `<Input>` needs a placeholder (no inputs here). Error codes: reuse `P0016` for token errors (next free code stays **P0043**).
- Checks after every task: `npx tsc --noEmit`, `./node_modules/.bin/eslint app src tests scripts`, the Jest files named. pgTAP after SQL changes: `npx supabase db reset && npx supabase test db`. Playwright (system Chrome, `.env.local` moved aside, procedure in part 1 Task 14) when screens change.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0072_web_push_tokens.sql` (new) | token columns, constraints, unique endpoint, `register_web_push_subscription`, `deactivate_my_web_subscription`, `deactivate_web_subscription` |
| `supabase/migrations/0073_web_push_claim.sql` (new) | `claim_notification_batch` with web fields, `shop_slug`, `recipient_role`; `export_my_data` token block |
| `supabase/tests/054_web_push_tokens.sql`, `055_web_push_claim.sql` (new) | pgTAP |
| `supabase/functions/_shared/notification-path.ts` (new) | `notificationPath(eventType, role)` mirror of the inbox routes |
| `supabase/functions/dispatch-notifications/dispatch.ts` (new) | pure `pickRows`, `createDispatcher(deps)` (sender choice, own-shop preference, outcomes) |
| `supabase/functions/dispatch-notifications/web-push-lib.ts` (new) | `createWebSender(vapid)`, the only library-specific file |
| `supabase/functions/dispatch-notifications/index.ts` (modify) | wiring: real Expo/web senders, RPC marks |
| `public/sw.js` (modify) | `push` and `notificationclick` |
| `src/features/notifications/web-push-state.ts`, `web-push.ts`, `use-web-push.ts`, `NotificationPrompt.tsx` (new); `api.ts` (modify) | client state, subscribe flow, hook, card |
| `src/features/auth/api.ts` (modify) | web unsubscribe on sign-out |
| the three profile hubs (modify) | mount the card |
| `docs/hosted-deploy.md`, `.env.example` (modify) | VAPID secrets and variable |

---

### Task 1: Spike — `npm:web-push` on the Supabase Edge runtime

**Why first:** the spec names it a risk. Everything in Tasks 4 to 5 depends on which library the function can run. Throwaway code: only the decision note is committed.

**Files:**
- Create: `docs/superpowers/spikes/2026-11-18-web-push-library.md` (the decision note)
- Temporary (deleted before commit): `supabase/functions/web-push-spike/index.ts`, scratch files under `/tmp/claude-1000/-home-samuel-projects-barberschedule/web-push-spike/`

**Interfaces:**
- Produces: a recorded decision, **Path A** (`npm:web-push`) or **Path B** (the first fallback that passes). Task 5 implements `createWebSender` with exactly that library.

- [ ] **Step 1: Generate a throwaway VAPID key pair and a real browser subscription**

```bash
S=/tmp/claude-1000/-home-samuel-projects-barberschedule/web-push-spike && mkdir -p $S
npx --yes web-push generate-vapid-keys --json > $S/vapid.json      # nothing is added to package.json
cat $S/vapid.json                                                   # { "publicKey": "...", "privateKey": "..." }
npm run e2e:export && (npm run e2e:serve &) && sleep 3              # serves the export (with part 3's public/sw.js) on :4173
```

Write `$S/get-subscription.mjs` (system Chrome through Playwright, which grants the notification permission and subscribes against the real push service, so it needs network access):

```js
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const { publicKey } = JSON.parse(readFileSync(new URL("./vapid.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ permissions: ["notifications"] });
const page = await context.newPage();
await page.goto("http://shop-a.localhost:4173/login");
const subscription = await page.evaluate(async (key) => {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const bytes = Uint8Array.from(atob((key + padding).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  return (await registration.pushManager.subscribe({ applicationServerKey: bytes, userVisibleOnly: true })).toJSON();
}, publicKey);
console.log(JSON.stringify(subscription));
await browser.close();
```

Run `node $S/get-subscription.mjs > $S/subscription.json`. Expected: a JSON object with an `endpoint` on `fcm.googleapis.com` (or another push service) and `keys.p256dh` / `keys.auth`. If Chrome cannot subscribe (no network, blocked by policy), stop and tell the orchestrator: the spike needs outbound HTTPS to the push service.

- [ ] **Step 2: A scratch Edge Function that sends with `npm:web-push`**

Create `supabase/functions/web-push-spike/index.ts`:

```ts
// @ts-nocheck (throwaway spike, deleted before the commit)
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (request) => {
  const { subscription } = await request.json();

  webpush.setVapidDetails("mailto:dev@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  try {
    const result = await webpush.sendNotification(subscription, JSON.stringify({ body: "spike", title: "Zenc", url: "/" }), { TTL: 60 });

    return Response.json({ status: result.statusCode });
  } catch (error) {
    return Response.json({ message: String(error), status: (error as { statusCode?: number }).statusCode ?? null }, { status: 500 });
  }
});
```

```bash
cat > $S/vapid.env <<EOF
VAPID_PUBLIC_KEY=$(node -p "require('$S/vapid.json').publicKey")
VAPID_PRIVATE_KEY=$(node -p "require('$S/vapid.json').privateKey")
EOF
npx supabase functions serve web-push-spike --no-verify-jwt --env-file $S/vapid.env &
sleep 8
curl -s -X POST http://127.0.0.1:54321/functions/v1/web-push-spike -H 'Content-Type: application/json' \
  -d "{\"subscription\": $(cat $S/subscription.json)}"
```

- [ ] **Step 3: Record the result against the go/no-go rule**

- **GO (Path A, `npm:web-push`)** only if the function boots without an import/runtime error **and** the response is `{"status":201}` (the push service accepted an encrypted payload, which exercises ECDH key agreement and aes128gcm in the Edge runtime). Also note the cold-start time of the first call.
- **NO-GO** on any boot error (`createECDH`/`crypto` not implemented, `http_ece` errors, bundling failure) or a non-2xx that is not an authentication problem with the key pair. Then repeat Step 2 with the next candidate, in this order, each time changing only the import and send call in the scratch function: (1) `jsr:@negrel/webpush`, (2) `npm:@block65/webcrypto-web-push`, (3) a hand-written sender (RFC 8291 `aes128gcm` payload encryption and RFC 8292 VAPID JWT, both doable with Deno's built-in WebCrypto in about 100 lines). Verify each package exists and is maintained before spending time on it. The first one that returns 201 is **Path B**, recorded with its exact specifier and version.
- Write `docs/superpowers/spikes/2026-11-18-web-push-library.md` with the first line `Decision: Path A (npm:web-push@3.6.7)` or `Decision: Path B (<library>@<version>)`, the raw outputs, the cold-start time, and for Path B the reason Path A failed.

- [ ] **Step 4: Clean up and commit only the note**

```bash
kill %1 %2 2>/dev/null; rm -rf supabase/functions/web-push-spike
git status --short          # only the note may be new
git add docs/superpowers/spikes/2026-11-18-web-push-library.md
git commit -m "docs(spike): web push library on the Supabase Edge runtime (multi-shop part 4)"
```

---

### Task 2: Migration 0072 — web subscriptions in `notification_tokens`

**Files:**
- Create: `supabase/migrations/0072_web_push_tokens.sql`, `supabase/tests/054_web_push_tokens.sql`

**Interfaces:**
- Produces:
  - columns `notification_tokens.web_subscription jsonb`, `notification_tokens.web_origin text`; `expo_push_token` nullable; check `notification_tokens_one_kind` (exactly one of the two); unique index on `web_subscription ->> 'endpoint'`.
  - `public.register_web_push_subscription(target_subscription jsonb, target_origin text, target_locale text default null) returns setof public.notification_tokens` (authenticated; reassigns a known endpoint to the caller; errors `P0016` `NOTIFICATION_TOKEN_FORBIDDEN` / `NOTIFICATION_TOKEN_INVALID`).
  - `public.deactivate_my_web_subscription(target_endpoint text) returns void` (authenticated; only the caller's own row).
  - `public.deactivate_web_subscription(target_endpoint text) returns void` (service_role only).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/054_web_push_tokens.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't54-one@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't54-two@example.com', 'x', now());

-- user one registers a browser
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select active from public.register_web_push_subscription(
    '{"endpoint":"https://push.example/abc","keys":{"p256dh":"pp","auth":"aa"},"expirationTime":null}'::jsonb, 'https://shop-a.localhost:4173', 'pt')),
  true, 'a signed-in user registers a web subscription'
);
reset role;

select is((select expo_push_token from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), null, 'a web row has no Expo token');
select is((select platform || '/' || locale || '/' || web_origin from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), 'web/pt/https://shop-a.localhost:4173', 'platform, locale and origin are stored');
select is((select web_subscription ? 'expirationTime' from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), false, 'only endpoint and keys are kept');

-- the same browser, now used by user two, is re-bound instead of duplicated
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ select * from public.register_web_push_subscription('{"endpoint":"https://push.example/abc","keys":{"p256dh":"pp","auth":"aa"}}'::jsonb, 'https://shop-b.localhost:4173', 'en') $$,
  'registering a known endpoint for another user reuses the row'
);
reset role;
select is((select count(*)::int from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), 1, 'still one row per endpoint');
select is((select user_id from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), 'fe000000-0000-0000-0000-000000000002'::uuid, 'and it now belongs to the new user');

-- validation and ownership, as user one
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.register_web_push_subscription('{"endpoint":"https://push.example/x"}'::jsonb, 'https://shop-a.localhost:4173') $$, 'P0016', 'NOTIFICATION_TOKEN_INVALID', 'a subscription without keys is rejected');
select throws_ok($$ select * from public.register_web_push_subscription('{"endpoint":"http://push.example/x","keys":{"p256dh":"p","auth":"a"}}'::jsonb, 'https://shop-a.localhost:4173') $$, 'P0016', 'NOTIFICATION_TOKEN_INVALID', 'a non-https endpoint is rejected');
select throws_ok($$ select * from public.register_web_push_subscription('{"endpoint":"https://push.example/x","keys":{"p256dh":"p","auth":"a"}}'::jsonb, 'javascript:alert(1)') $$, 'P0016', 'NOTIFICATION_TOKEN_INVALID', 'a bad origin is rejected');
select lives_ok($$ select public.deactivate_my_web_subscription('https://push.example/abc') $$, 'deactivating someone else''s subscription is a harmless no-op');
reset role;
select is((select active from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), true, 'and it stays active');

-- table-level rules
select throws_ok(
  $$ insert into public.notification_tokens (user_id, expo_push_token, web_subscription, web_origin)
     values ('fe000000-0000-0000-0000-000000000001', 'ExponentPushToken[t54]', '{"endpoint":"https://p/1","keys":{"p256dh":"p","auth":"a"}}', 'https://a.example') $$,
  '23514', null, 'a row cannot be both an Expo token and a web subscription'
);
select throws_ok(
  $$ insert into public.notification_tokens (user_id, platform) values ('fe000000-0000-0000-0000-000000000001', 'web') $$,
  '23514', null, 'a row must be one kind or the other'
);

-- the dispatcher's function
set local role service_role;
select lives_ok($$ select public.deactivate_web_subscription('https://push.example/abc') $$, 'the service role deactivates a subscription by endpoint');
reset role;
select is((select active from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), false, 'and it is inactive');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select public.deactivate_web_subscription('https://push.example/abc') $$, '42501', null, 'a signed-in user cannot use the service-role function');
reset role;

select * from finish();
rollback;
```

The file has 17 assertions (1 register, 3 stored-row checks, 3 re-bind checks, 3 validation, 2 ownership, 2 table rules, 2 service role, 1 permission), matching `plan(17)`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase db reset && npx supabase test db`
Expected: `054` fails (`function public.register_web_push_subscription(...) does not exist`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0072_web_push_tokens.sql`:

```sql
-- Web Push next to Expo push: a notification_tokens row is either an Expo token (native app) or a browser PushSubscription.
alter table public.notification_tokens
  alter column expo_push_token drop not null,
  add column web_subscription jsonb,
  add column web_origin text,
  add constraint notification_tokens_one_kind check ((expo_push_token is not null) <> (web_subscription is not null)),
  add constraint notification_tokens_web_shape check (
    web_subscription is null or (
      jsonb_typeof(web_subscription) = 'object'
      and web_subscription ->> 'endpoint' ~ '^https://'
      and nullif(web_subscription #>> '{keys,p256dh}', '') is not null
      and nullif(web_subscription #>> '{keys,auth}', '') is not null
      and web_origin is not null
    )
  );

create unique index notification_tokens_web_endpoint_key
on public.notification_tokens ((web_subscription ->> 'endpoint'))
where web_subscription is not null;

-- Same pattern as register_notification_token: the caller's own row, upserted by the unique key (here the push endpoint, so a
-- browser used by another account is re-bound to that account instead of duplicated). Only endpoint and keys are stored.
create function public.register_web_push_subscription(
  target_subscription jsonb,
  target_origin text,
  target_locale text default null
)
returns setof public.notification_tokens
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_locale text := case when target_locale in ('en', 'pt', 'es') then target_locale else 'en' end;
  clean jsonb;
begin
  if actor_id is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_FORBIDDEN';
  end if;
  if jsonb_typeof(target_subscription) is distinct from 'object'
    or coalesce(target_subscription ->> 'endpoint', '') !~ '^https://[^[:space:]]{1,2000}$'
    or coalesce(target_subscription #>> '{keys,p256dh}', '') = ''
    or coalesce(target_subscription #>> '{keys,auth}', '') = ''
    or coalesce(target_origin, '') !~ '^https?://[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$'
  then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_INVALID';
  end if;

  clean := jsonb_build_object(
    'endpoint', target_subscription ->> 'endpoint',
    'keys', jsonb_build_object('p256dh', target_subscription #>> '{keys,p256dh}', 'auth', target_subscription #>> '{keys,auth}')
  );

  return query
  insert into public.notification_tokens (user_id, web_subscription, web_origin, platform, locale)
  values (actor_id, clean, target_origin, 'web', normalized_locale)
  on conflict ((web_subscription ->> 'endpoint')) where web_subscription is not null do update
  set user_id = excluded.user_id,
      web_subscription = excluded.web_subscription,
      web_origin = excluded.web_origin,
      locale = case when target_locale is null then public.notification_tokens.locale else excluded.locale end,
      active = true,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning *;
end;
$$;

-- Sign-out: the signed-in user switches their own browser's subscription off (the client calls it before ending the session).
create function public.deactivate_my_web_subscription(target_endpoint text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_tokens
  set active = false, updated_at = clock_timestamp()
  where user_id = auth.uid() and web_subscription ->> 'endpoint' = target_endpoint;
$$;

-- The dispatcher's counterpart of deactivate_notification_token: the push service answered 404/410 (subscription gone).
create function public.deactivate_web_subscription(target_endpoint text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_tokens
  set active = false, updated_at = clock_timestamp()
  where web_subscription ->> 'endpoint' = target_endpoint;
$$;

revoke all on function public.register_web_push_subscription(jsonb, text, text) from public, anon;
grant execute on function public.register_web_push_subscription(jsonb, text, text) to authenticated;
revoke all on function public.deactivate_my_web_subscription(text) from public, anon;
grant execute on function public.deactivate_my_web_subscription(text) to authenticated;
revoke all on function public.deactivate_web_subscription(text) from public, anon, authenticated;
grant execute on function public.deactivate_web_subscription(text) to service_role;
```

- [ ] **Step 4: Run pgTAP and see it pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files pass, `054` all assertions (with the `plan()` count you set), and `009`, `012` (Expo token tests) unchanged.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0072_web_push_tokens.sql supabase/tests/054_web_push_tokens.sql
git commit -m "feat(db): web push subscriptions in notification_tokens"
```

---

### Task 3: Migration 0073 — claim returns the web fields, shop slug and recipient role; the export hides keys

**Files:**
- Create: `supabase/migrations/0073_web_push_claim.sql`, `supabase/tests/055_web_push_claim.sql`

**Interfaces:**
- Produces: `public.claim_notification_batch(target_limit integer default 50)` returning `(id uuid, event_type text, payload jsonb, expo_push_token text, attempts integer, max_attempts integer, locale text, web_subscription jsonb, web_origin text, shop_slug text, recipient_role text)`; `export_my_data()` token entries as `{ platform, active, token_suffix, web_origin, created_at }` (no keys).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/055_web_push_claim.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't55-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't55-customer@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'ff000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, slug, owner_user_id)
values ('ff100000-0000-0000-0000-000000000001', 'T55 Shop', 'shop-t55', 'ff000000-0000-0000-0000-000000000001');

insert into public.notification_tokens (user_id, expo_push_token, platform)
values ('ff000000-0000-0000-0000-000000000002', 'ExponentPushToken[t55]', 'ios');
insert into public.notification_tokens (user_id, web_subscription, web_origin, platform)
values
  ('ff000000-0000-0000-0000-000000000002', '{"endpoint":"https://push.example/a","keys":{"p256dh":"p","auth":"a"}}', 'https://shop-t55.localhost:4173', 'web'),
  ('ff000000-0000-0000-0000-000000000002', '{"endpoint":"https://push.example/b","keys":{"p256dh":"p","auth":"a"}}', 'https://other.localhost:4173', 'web');

insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
values
  ('t55-with-shop', 'appointment.booked', 'ff000000-0000-0000-0000-000000000002', '{"shop_id":"ff100000-0000-0000-0000-000000000001","service_name":"Cut","starts_at":"2026-12-01T12:00:00Z"}'),
  ('t55-owner-no-token', 'payout.due', 'ff000000-0000-0000-0000-000000000001', '{"count":1,"professional_names":["Ana"]}');

-- claim_notification_batch is security definer; the table is created by the test role, the call is the same one the service role makes.
create temporary table claimed on commit drop as select * from public.claim_notification_batch(10);

select is((select count(*)::int from claimed where event_type = 'appointment.booked'), 3, 'one row per active token: Expo plus two web subscriptions');
select is((select count(*)::int from claimed where event_type = 'appointment.booked' and web_subscription is not null), 2, 'the web rows carry the subscription');
select is((select count(*)::int from claimed where event_type = 'appointment.booked' and expo_push_token = 'ExponentPushToken[t55]'), 1, 'and the Expo row is still there');
select is((select string_agg(distinct web_origin, ',' order by web_origin) from claimed where web_subscription is not null), 'https://other.localhost:4173,https://shop-t55.localhost:4173', 'with their origins');
select is((select distinct shop_slug from claimed where event_type = 'appointment.booked'), 'shop-t55', 'the notification''s shop slug comes from the payload');
select is((select distinct recipient_role from claimed where event_type = 'appointment.booked'), 'customer', 'and the recipient role');
select is((select shop_slug from claimed where event_type = 'payout.due'), null, 'an event without shop_id has no slug');
select ok(has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'execute'), 'the service role may call the claim');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  (select public.export_my_data() -> 'notification_tokens')::text !~ '(p256dh|"auth"|endpoint)',
  'the export never contains subscription keys or endpoints'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.export_my_data() -> 'notification_tokens') t where t ->> 'web_origin' = 'https://shop-t55.localhost:4173'),
  1, 'but it lists the web origin'
);
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase db reset && npx supabase test db`
Expected: `055` fails (`column "web_subscription" does not exist` on the claim result).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0073_web_push_claim.sql`:

```sql
-- claim_notification_batch also tells the dispatcher which subscription it is (web_subscription, web_origin), which shop the notification
-- is about (shop_slug, null for events whose payload has no shop_id) and the recipient's role (to pick the screen to open).
drop function public.claim_notification_batch(integer);

create function public.claim_notification_batch(target_limit integer default 50)
returns table (
  id uuid,
  event_type text,
  payload jsonb,
  expo_push_token text,
  attempts integer,
  max_attempts integer,
  locale text,
  web_subscription jsonb,
  web_origin text,
  shop_slug text,
  recipient_role text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.status in ('pending', 'failed')
      and outbox.available_at <= clock_timestamp()
      and outbox.attempts < outbox.max_attempts
    order by outbox.created_at
    for update skip locked
    limit greatest(1, least(coalesce(target_limit, 50), 100))
  ), claimed as (
    update public.notification_outbox outbox
    set status = 'sending',
        attempts = outbox.attempts + 1,
        claimed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id,
         claimed.event_type,
         claimed.payload,
         tokens.expo_push_token,
         claimed.attempts,
         claimed.max_attempts,
         coalesce(tokens.locale, 'en'),
         tokens.web_subscription,
         tokens.web_origin,
         shops.slug,
         profiles.role::text
  from claimed
  left join public.notification_tokens tokens
    on tokens.user_id = claimed.recipient_user_id
   and tokens.active
  left join public.shops shops
    on shops.id = case
      when claimed.payload ->> 'shop_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (claimed.payload ->> 'shop_id')::uuid
    end
  left join public.profiles profiles
    on profiles.user_id = claimed.recipient_user_id;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

-- The account data export lists the user's push registrations. Web rows have no Expo token (token_suffix would be null), so they
-- show their origin; the subscription's endpoint and keys are secrets of the push channel and are never exported.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'exported_at', clock_timestamp(),
    'account_email', (select email from auth.users where id = actor),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = actor),
    'customers', coalesce((select jsonb_agg(to_jsonb(c)) from public.customers c where c.user_id = actor), '[]'::jsonb),
    'professionals', coalesce((select jsonb_agg(to_jsonb(b)) from public.professionals b where b.user_id = actor), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at)
      from public.appointments a
      join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'recurrence_series', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.recurrence_series s
      join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(k) order by k.accepted_at) from public.consents k where k.user_id = actor), '[]'::jsonb),
    'notification_tokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'active', t.active,
        'token_suffix', right(t.expo_push_token, 6), 'web_origin', t.web_origin, 'created_at', t.created_at))
      from public.notification_tokens t where t.user_id = actor
    ), '[]'::jsonb)
  );
end;
$$;
```

(The grants of `export_my_data` are unchanged by `create or replace`.)

- [ ] **Step 4: Run pgTAP and see it pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all pass, `055` 10/10, `009_notifications.sql`, `012`, `011`, `035` still pass (they call `claim_notification_batch` and `export_my_data`; if one asserts the exact column list of the claim, extend it with the four new columns).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0073_web_push_claim.sql supabase/tests/055_web_push_claim.sql
git commit -m "feat(db): claim returns web subscription, shop slug and role; export hides push keys"
```

---

### Task 4: The dispatcher's decisions as tested modules (route mapping, target selection, sender choice)

Characterization first: the Expo behaviour must not change, so the Expo cases are pinned by tests before the web cases exist.

**Files:**
- Create: `supabase/functions/_shared/notification-path.ts`, `supabase/functions/dispatch-notifications/dispatch.ts`
- Test: `tests/unit/notification-path.test.ts`, `tests/unit/dispatch.test.ts`

**Interfaces:**
- Produces:
  - `notificationPath(eventType: string, role: string | null): string` — `payout.*` → payouts screen of the role; `recurrence.conflict` → `/recurrence-conflicts`; other `recurrence.*` → recurrence-requests screen of the role; everything else → the role's agenda. Roles `customer` (default), `professional`, `owner`.
  - types `WebSubscription = { endpoint: string; keys: { auth: string; p256dh: string } }`, `ClaimedNotification` (the claim row: `attempts, event_type, expo_push_token, id, locale, max_attempts, payload, recipient_role, shop_slug, web_origin, web_subscription`), `Message = { body: string; title: string; url?: string }`
  - `pickRows(rows: ClaimedNotification[]): ClaimedNotification[]` — per outbox `id`: keeps every Expo row; keeps only the web rows whose origin's first host label equals `shop_slug` when there are any, otherwise all web rows; keeps a token-less row only when the group has no other row.
  - `createDispatcher(deps: Deps): (rows: ClaimedNotification[]) => Promise<{ failed: number; sent: number; skipped: number }>` with `Deps = { deactivateExpo(token: string): Promise<void>; deactivateWeb(endpoint: string): Promise<void>; markFailed(id: string, error: string): Promise<void>; markSent(id: string): Promise<void>; sendExpo(token: string, message: Message, data: Record<string, unknown>): Promise<{ error?: string; ok: boolean }>; sendWeb(subscription: WebSubscription, message: Required<Message>): Promise<{ status: number }> }`.
  - Outcomes per row: no token → `markSent`, skipped; Expo ok → `markSent`; Expo error → `markFailed(error)` and, when the error is `DeviceNotRegistered`, `deactivateExpo` first; web 2xx → `markSent`; web 404/410 → `deactivateWeb(endpoint)` then `markFailed("WebPushGone")`; other web status → `markFailed("Web push HTTP <status>")`; a sender that throws → `markFailed(<message>)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/notification-path.test.ts`:

```ts
import { inboxRoute } from "../../src/features/notifications/inbox-route";
import { notificationPath } from "../../supabase/functions/_shared/notification-path";

describe("notificationPath", () => {
  it.each([
    ["appointment.booked", "customer", "/appointments"],
    ["appointment.reminder", "customer", "/appointments"],
    ["staff.booked", "professional", "/my-agenda"],
    ["staff.cancelled", "owner", "/agenda"],
    ["recurrence.requested", "professional", "/my-profile/recurrence"],
    ["recurrence.accepted", "customer", "/me/recurrence"],
    ["recurrence.requested", "owner", "/monthly-customers"],
    ["recurrence.conflict", "owner", "/recurrence-conflicts"],
    ["payout.due", "owner", "/payouts"],
    ["payout.paid", "professional", "/my-profile/compensation"],
  ])("%s for %s opens %s", (eventType, role, path) => {
    expect(notificationPath(eventType, role)).toBe(path);
  });

  it("falls back to the customer's agenda when the role is unknown", () => {
    expect(notificationPath("appointment.booked", null)).toBe("/appointments");
    expect(notificationPath("appointment.booked", "something-new")).toBe("/appointments");
  });

  // The web notification must open the same screen the in-app inbox opens for the matching entry.
  it.each([
    ["appointment.booked", "appointment_booked"],
    ["staff.booked", "appointment_booked"],
    ["appointment.cancelled", "appointment_cancelled"],
    ["recurrence.requested", "recurrence_requested"],
    ["recurrence.accepted", "recurrence_accepted"],
    ["recurrence.cancel_requested", "recurrence_cancel_requested"],
    ["payout.due", "payout_due"],
    ["payout.paid", "payout_paid"],
  ] as const)("%s agrees with the inbox route of %s for every role", (eventType, kind) => {
    for (const role of ["customer", "professional", "owner"] as const) {
      expect(notificationPath(eventType, role)).toBe(inboxRoute(kind, role));
    }
  });
});
```

Create `tests/unit/dispatch.test.ts`:

```ts
import { createDispatcher, pickRows } from "../../supabase/functions/dispatch-notifications/dispatch";
import type { ClaimedNotification, Deps } from "../../supabase/functions/dispatch-notifications/dispatch";

const base: ClaimedNotification = {
  attempts: 1, event_type: "appointment.booked", expo_push_token: null, id: "n1", locale: "en", max_attempts: 3,
  payload: { service_name: "Cut", shop_id: "s1", starts_at: "2026-12-01T12:00:00Z" },
  recipient_role: "customer", shop_slug: "shop-a", web_origin: null, web_subscription: null,
};
const sub = (name: string) => ({ endpoint: `https://push.example/${name}`, keys: { auth: "a", p256dh: "p" } });
const web = (name: string, origin: string, patch: Partial<ClaimedNotification> = {}): ClaimedNotification => ({ ...base, web_origin: origin, web_subscription: sub(name), ...patch });
const expo = (token: string, patch: Partial<ClaimedNotification> = {}): ClaimedNotification => ({ ...base, expo_push_token: token, ...patch });

function deps(patch: Partial<Deps> = {}) {
  const calls: string[] = [];
  const all: Deps = {
    deactivateExpo: async (token) => { calls.push(`deactivateExpo:${token}`); },
    deactivateWeb: async (endpoint) => { calls.push(`deactivateWeb:${endpoint}`); },
    markFailed: async (id, error) => { calls.push(`failed:${id}:${error}`); },
    markSent: async (id) => { calls.push(`sent:${id}`); },
    sendExpo: async (token) => { calls.push(`expo:${token}`); return { ok: true }; },
    sendWeb: async (subscription) => { calls.push(`web:${subscription.endpoint}`); return { status: 201 }; },
    ...patch,
  };

  return { calls, dispatch: createDispatcher(all) };
}

describe("pickRows", () => {
  it("keeps only the web subscription on the notification's own shop when there is one", () => {
    const rows = [web("a", "https://shop-a.zencpro.app"), web("b", "https://shop-b.zencpro.app")];

    expect(pickRows(rows).map((row) => row.web_subscription?.endpoint)).toEqual(["https://push.example/a"]);
  });

  it("falls back to every web subscription when none is on that shop", () => {
    const rows = [web("a", "https://shop-c.zencpro.app"), web("b", "https://shop-d.zencpro.app")];

    expect(pickRows(rows)).toHaveLength(2);
  });

  it("falls back to every web subscription when the notification has no shop", () => {
    const rows = [web("a", "https://shop-a.zencpro.app", { shop_slug: null }), web("b", "https://shop-b.zencpro.app", { shop_slug: null })];

    expect(pickRows(rows)).toHaveLength(2);
  });

  it("matches the slug on a localhost origin with a port", () => {
    expect(pickRows([web("a", "http://shop-a.localhost:4173"), web("b", "http://shop-b.localhost:4173")])).toHaveLength(1);
  });

  it("never filters Expo rows and keeps them next to the chosen web rows", () => {
    const rows = [expo("T1"), web("a", "https://shop-a.zencpro.app"), web("b", "https://shop-b.zencpro.app")];

    expect(pickRows(rows).map((row) => row.expo_push_token ?? row.web_subscription?.endpoint)).toEqual(["T1", "https://push.example/a"]);
  });

  it("groups by outbox id", () => {
    const rows = [web("a", "https://shop-a.zencpro.app", { id: "n1" }), web("b", "https://shop-b.zencpro.app", { id: "n2", shop_slug: "shop-b" })];

    expect(pickRows(rows)).toHaveLength(2);
  });

  it("keeps a token-less row only when it is the group's only row", () => {
    expect(pickRows([base])).toEqual([base]);
    expect(pickRows([base, expo("T1")])).toEqual([expo("T1")]);
  });
});

describe("dispatcher: Expo (behaviour that must not change)", () => {
  it("sends and marks sent", async () => {
    const { calls, dispatch } = deps();

    await expect(dispatch([expo("T1")])).resolves.toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(calls).toEqual(["expo:T1", "sent:n1"]);
  });

  it("deactivates a token the device no longer has, then fails the notification", async () => {
    const { calls, dispatch } = deps({ sendExpo: async () => ({ error: "DeviceNotRegistered", ok: false }) });

    await expect(dispatch([expo("T1")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
    expect(calls).toEqual(["deactivateExpo:T1", "failed:n1:DeviceNotRegistered"]);
  });

  it("marks a row without any token as sent (skipped)", async () => {
    const { calls, dispatch } = deps();

    await expect(dispatch([base])).resolves.toEqual({ failed: 0, sent: 0, skipped: 1 });
    expect(calls).toEqual(["sent:n1"]);
  });

  it("marks a sender that throws as failed", async () => {
    const { calls, dispatch } = deps({ sendExpo: async () => { throw new Error("boom"); } });

    await expect(dispatch([expo("T1")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
    expect(calls).toEqual(["failed:n1:boom"]);
  });
});

describe("dispatcher: web", () => {
  it("sends the localized title and body with the origin plus the role's screen", async () => {
    let seen: unknown;
    const { calls, dispatch } = deps({ sendWeb: async (subscription, message) => { seen = message; calls.push(`web:${subscription.endpoint}`); return { status: 201 }; } });

    await expect(dispatch([web("a", "https://shop-a.zencpro.app", { locale: "pt" })])).resolves.toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(seen).toMatchObject({ title: "Agendamento confirmado", url: "https://shop-a.zencpro.app/appointments" });
    expect(calls).toContain("sent:n1");
  });

  it("deactivates a subscription the push service no longer knows (404 and 410)", async () => {
    for (const status of [404, 410]) {
      const { calls, dispatch } = deps({ sendWeb: async () => ({ status }) });

      await expect(dispatch([web("a", "https://shop-a.zencpro.app")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
      expect(calls).toEqual(["deactivateWeb:https://push.example/a", "failed:n1:WebPushGone"]);
    }
  });

  it("retries later on other push-service errors without deactivating", async () => {
    const { calls, dispatch } = deps({ sendWeb: async () => ({ status: 503 }) });

    await expect(dispatch([web("a", "https://shop-a.zencpro.app")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
    expect(calls).toEqual(["failed:n1:Web push HTTP 503"]);
  });

  it("only uses the own-shop subscription when the user has several", async () => {
    const { calls, dispatch } = deps();

    await dispatch([web("a", "https://shop-a.zencpro.app"), web("b", "https://shop-b.zencpro.app")]);

    expect(calls.filter((call) => call.startsWith("web:"))).toEqual(["web:https://push.example/a"]);
  });

  it("sends to Expo and web when the user has both", async () => {
    const { calls, dispatch } = deps();

    await dispatch([expo("T1"), web("a", "https://shop-a.zencpro.app")]);

    expect(calls.filter((call) => /^(expo|web):/.test(call))).toEqual(["expo:T1", "web:https://push.example/a"]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/notification-path.test.ts tests/unit/dispatch.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the route mapping**

Create `supabase/functions/_shared/notification-path.ts` (plain TypeScript, no Deno/Node globals; keep in step with `src/features/notifications/inbox-route.ts`, which the test compares against):

```ts
type Role = "professional" | "customer" | "owner";

const AGENDA: Record<Role, string> = { customer: "/appointments", owner: "/agenda", professional: "/my-agenda" };
const REQUESTS: Record<Role, string> = { customer: "/me/recurrence", owner: "/monthly-customers", professional: "/my-profile/recurrence" };
const PAYOUTS: Record<Role, string> = { customer: "/appointments", owner: "/payouts", professional: "/my-profile/compensation" };

// The screen a push notification opens: the same one the in-app inbox opens for the matching entry (src/features/notifications/inbox-route.ts).
export function notificationPath(eventType: string, role: string | null): string {
  const key: Role = role === "owner" || role === "professional" ? role : "customer";

  if (eventType.startsWith("payout.")) return PAYOUTS[key];
  if (eventType === "recurrence.conflict") return "/recurrence-conflicts";

  return eventType.startsWith("recurrence.") ? REQUESTS[key] : AGENDA[key];
}
```

- [ ] **Step 4: Implement the dispatcher modules**

Create `supabase/functions/dispatch-notifications/dispatch.ts`:

```ts
import { notificationPath } from "../_shared/notification-path.ts";
import { buildMessage } from "./messages.ts";

export type WebSubscription = { endpoint: string; keys: { auth: string; p256dh: string } };

// One row of claim_notification_batch: an outbox notification joined with one of the recipient's active tokens.
export type ClaimedNotification = {
  attempts: number;
  event_type: string;
  expo_push_token: string | null;
  id: string;
  locale: string | null;
  max_attempts: number;
  payload: Record<string, unknown>;
  recipient_role: string | null;
  shop_slug: string | null;
  web_origin: string | null;
  web_subscription: WebSubscription | null;
};

export type Message = { body: string; title: string; url?: string };

export type Deps = {
  deactivateExpo: (token: string) => Promise<void>;
  deactivateWeb: (endpoint: string) => Promise<void>;
  markFailed: (id: string, error: string) => Promise<void>;
  markSent: (id: string) => Promise<void>;
  sendExpo: (token: string, message: Message, data: Record<string, unknown>) => Promise<{ error?: string; ok: boolean }>;
  sendWeb: (subscription: WebSubscription, message: Required<Message>) => Promise<{ status: number }>;
};

type Counts = { failed: number; sent: number; skipped: number };

// "https://shop-a.zencpro.app" and "http://shop-a.localhost:4173" -> "shop-a".
function originSlug(origin: string | null): string | null {
  try {
    return origin ? new URL(origin).hostname.split(".")[0] : null;
  } catch {
    return null;
  }
}

// A user with subscriptions on several shop subdomains only gets the notification on the one of its own shop; with none there (or
// when the event has no shop) every web subscription gets it. Expo rows are never filtered. A row with no token at all stays only
// when it is the group's only row (the "nobody to notify" marker).
export function pickRows(rows: ClaimedNotification[]): ClaimedNotification[] {
  const groups = new Map<string, ClaimedNotification[]>();

  for (const row of rows) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);

  return [...groups.values()].flatMap((group) => {
    const webRows = group.filter((row) => row.web_subscription);
    const own = webRows.filter((row) => group[0].shop_slug !== null && originSlug(row.web_origin) === group[0].shop_slug);
    const chosenWeb = own.length > 0 ? own : webRows;
    const tokenRows = group.filter((row) => row.expo_push_token || row.web_subscription);

    if (tokenRows.length === 0) return [group[0]];

    return group.filter((row) => row.expo_push_token || chosenWeb.includes(row));
  });
}

export function createDispatcher(deps: Deps) {
  async function dispatchOne(row: ClaimedNotification): Promise<keyof Counts> {
    if (row.web_subscription) {
      const message = buildMessage(row.event_type, row.locale, row.payload);
      const url = `${row.web_origin ?? ""}${notificationPath(row.event_type, row.recipient_role)}`;
      const { status } = await deps.sendWeb(row.web_subscription, { body: message.body, title: message.title, url });

      if (status >= 200 && status < 300) {
        await deps.markSent(row.id);
        return "sent";
      }
      if (status === 404 || status === 410) {
        await deps.deactivateWeb(row.web_subscription.endpoint);
        await deps.markFailed(row.id, "WebPushGone");
        return "failed";
      }
      await deps.markFailed(row.id, `Web push HTTP ${status}`);
      return "failed";
    }

    if (!row.expo_push_token) {
      await deps.markSent(row.id);
      return "skipped";
    }

    const result = await deps.sendExpo(row.expo_push_token, buildMessage(row.event_type, row.locale, row.payload), row.payload);

    if (result.ok) {
      await deps.markSent(row.id);
      return "sent";
    }
    if (result.error === "DeviceNotRegistered") await deps.deactivateExpo(row.expo_push_token);
    await deps.markFailed(row.id, result.error ?? "Expo delivery failed");
    return "failed";
  }

  return async (rows: ClaimedNotification[]): Promise<Counts> => {
    const counts: Counts = { failed: 0, sent: 0, skipped: 0 };

    for (const row of pickRows(rows)) {
      try {
        counts[await dispatchOne(row)]++;
      } catch (error) {
        await deps.markFailed(row.id, error instanceof Error ? error.message : "Unknown delivery error");
        counts.failed++;
      }
    }

    return counts;
  };
}
```

- [ ] **Step 5: Run and see them pass**

Run: `npx jest tests/unit/notification-path.test.ts tests/unit/dispatch.test.ts tests/unit/notification-messages.test.ts tests/unit/dispatch-auth.test.ts`
Expected: PASS. If the "Agendamento confirmado" assertion differs, read `buildMessage("appointment.booked", "pt", payload).title` in `messages.ts` (pt title for `appointment.booked` is "Agendamento confirmado") and keep the test aligned with it.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add supabase/functions/_shared/notification-path.ts supabase/functions/dispatch-notifications/dispatch.ts tests/unit/notification-path.test.ts tests/unit/dispatch.test.ts
git commit -m "feat(functions): tested dispatcher decisions for Expo and web push"
```

---

### Task 5: The web sender and the Edge Function wiring

**Files:**
- Create: `supabase/functions/dispatch-notifications/web-push-lib.ts`
- Modify: `supabase/functions/dispatch-notifications/index.ts`, `.env.example` (web build variable), `docs/hosted-deploy.md` (VAPID secrets)

**Interfaces:**
- Consumes: `createDispatcher`, `ClaimedNotification`, `Deps` (Task 4); the spike decision (Task 1).
- Produces: `createWebSender(vapid: { privateKey: string; publicKey: string; subject: string }): (subscription: WebSubscription, message: { body: string; title: string; url: string }) => Promise<{ status: number }>` — resolves with the push service's HTTP status for any HTTP answer (2xx or error), throws only for transport failures.

- [ ] **Step 1: Write the sender for the chosen path (the only library-specific file)**

**Path A (`npm:web-push`):** create `supabase/functions/dispatch-notifications/web-push-lib.ts`:

```ts
import webpush from "npm:web-push@3.6.7";

import type { WebSubscription } from "./dispatch.ts";

type Vapid = { privateKey: string; publicKey: string; subject: string };

// The push service answers 201 on success and 404/410 when the subscription is gone; web-push throws a WebPushError for any
// non-2xx, which is turned back into a plain status here so the dispatcher decides what each status means.
export function createWebSender({ privateKey, publicKey, subject }: Vapid) {
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return async (subscription: WebSubscription, message: { body: string; title: string; url: string }) => {
    try {
      const result = await webpush.sendNotification(subscription, JSON.stringify(message), { TTL: 24 * 60 * 60, urgency: "normal" });

      return { status: result.statusCode };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      if (typeof status === "number") return { status };
      throw error;
    }
  };
}
```

**Path B:** same exported function name, signature and return contract, implemented with the library the spike recorded (its exact import specifier and version from `docs/superpowers/spikes/2026-11-18-web-push-library.md`); map that library's "gone" and "other HTTP error" results to the HTTP status, as above.

- [ ] **Step 2: Wire it into `index.ts`**

Replace `supabase/functions/dispatch-notifications/index.ts` with:

```ts
import { isServiceRequest } from "./auth.ts";
import { createDispatcher } from "./dispatch.ts";
import type { ClaimedNotification, Message, WebSubscription } from "./dispatch.ts";
import { createWebSender } from "./web-push-lib.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const expoPushUrl = "https://exp.host/--/api/v2/push/send";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function supabaseRpc(name: string, body: Record<string, unknown>) {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function sendExpo(token: string, message: Message, data: Record<string, unknown>) {
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const response = await fetch(expoPushUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ to: token, ...message, data }),
  });
  const result = (await response.json().catch(() => null)) as { data?: { details?: { error?: string }; status?: string } } | null;

  if (response.ok && result?.data?.status !== "error") return { ok: true };

  return { error: result?.data?.details?.error ?? `Expo HTTP ${response.status}`, ok: false };
}

// Built on the first web notification, so a missing VAPID secret only fails web rows (and says why), never the Expo ones.
let webSender: ReturnType<typeof createWebSender> | undefined;
function sendWeb(subscription: WebSubscription, message: { body: string; title: string; url: string }) {
  webSender ??= createWebSender({
    privateKey: requiredEnv("VAPID_PRIVATE_KEY"),
    publicKey: requiredEnv("VAPID_PUBLIC_KEY"),
    subject: requiredEnv("VAPID_SUBJECT"),
  });

  return webSender(subscription, message);
}

const dispatchRows = createDispatcher({
  deactivateExpo: async (token) => { await supabaseRpc("deactivate_notification_token", { target_expo_push_token: token }); },
  deactivateWeb: async (endpoint) => { await supabaseRpc("deactivate_web_subscription", { target_endpoint: endpoint }); },
  markFailed: async (id, error) => { await supabaseRpc("mark_notification_failed", { target_error: error, target_id: id }); },
  markSent: async (id) => { await supabaseRpc("mark_notification_sent", { target_id: id }); },
  sendExpo,
  sendWeb,
});

async function dispatch(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isServiceRequest(request.headers.get("Authorization"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const claimed = (await supabaseRpc("claim_notification_batch", { target_limit: 50 })) as ClaimedNotification[];

  return Response.json(await dispatchRows(claimed ?? []));
}

Deno.serve(dispatch);
```

(The Expo request body is unchanged: `to`, the localized `title`/`body`, and `data` = the payload. `message` here is the `{ title, body }` object from `buildMessage`.)

- [ ] **Step 3: Document the secrets and the web variable**

Append to `.env.example`:

```
# Web push: the VAPID PUBLIC key (the same value as the Edge Function secret VAPID_PUBLIC_KEY). Generate the pair once:
#   npx web-push generate-vapid-keys
EXPO_PUBLIC_VAPID_PUBLIC_KEY=
```

In `docs/hosted-deploy.md`, section "5. Edge Functions and scheduler", add a step (next to the existing function secrets): "Web push: `npx web-push generate-vapid-keys` once; `supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:<business e-mail>`; set `EXPO_PUBLIC_VAPID_PUBLIC_KEY=<public>` in the web build environment (the same public value). Web push needs HTTPS; without the three secrets web notifications fail with `Missing VAPID_...` in `notification_outbox.last_error` while Expo pushes keep working."

- [ ] **Step 4: Type-check what Jest can reach and run the unit tests**

Run: `npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts && npx jest tests/unit/dispatch.test.ts tests/unit/notification-messages.test.ts`
Expected: PASS. (`index.ts` and `web-push-lib.ts` use Deno-only imports and are outside the TS project; they are exercised in Step 5.)

- [ ] **Step 5: Run the real function locally end to end**

With the local stack and the spike's key pair in `$S/vapid.env` (add `VAPID_SUBJECT=mailto:dev@example.com`; if the spike directory is gone, generate a new pair and run Task 1 Step 1's subscription script again):

```bash
npx supabase functions serve dispatch-notifications --no-verify-jwt --env-file $S/vapid.env &
# a web token for the dev customer + an outbox row (psql into the local DB)
docker exec -i supabase_db_zenc psql -U postgres -d postgres <<SQL
insert into public.notification_tokens (user_id, web_subscription, web_origin, platform)
select user_id, '$(cat $S/subscription.json)'::jsonb, 'http://seed-shop.localhost:4173', 'web' from public.profiles where role = 'owner' limit 1;
insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
select 'web-push-check-' || clock_timestamp(), 'payout.due', user_id, '{"count":1,"professional_names":["Ana"]}' from public.profiles where role = 'owner' limit 1;
SQL
curl -s -X POST http://127.0.0.1:54321/functions/v1/dispatch-notifications -H "Authorization: Bearer $(npx supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=//p' | tr -d '\"')"
```

Expected: `{"failed":0,"sent":1,"skipped":0}`, and `select status, last_error from public.notification_outbox order by created_at desc limit 1` shows `sent`. (The browser only displays it once Task 6's `push` handler exists; the 201 proves the Edge runtime sent an encrypted payload.) Stop the function (`kill %1`) and delete the two test rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/dispatch-notifications .env.example docs/hosted-deploy.md
git commit -m "feat(functions): dispatch-notifications sends web push next to Expo"
```

---

### Task 6: The service worker shows the notification and opens the right screen

**Files:**
- Modify: `public/sw.js`
- Test: extend `tests/unit/service-worker.test.ts` (created in part 3 Task 2)

**Interfaces:**
- Consumes: the payload `{ title, body, url }` from Task 5.
- Produces: `push` handler (shows a notification with the Zenc icon and badge, `data.url`) and `notificationclick` handler (closes it; focuses an open tab of the same origin and navigates it to the url, else opens a new window).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/service-worker.test.ts` extend `load()` so the fake scope also provides `registration.showNotification`, `clients.matchAll`/`openWindow`, and `location.origin`:

```ts
function load() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const self = {
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => { listeners[type] = listener; },
    clients: { claim: jest.fn().mockResolvedValue(undefined), matchAll: jest.fn().mockResolvedValue([]), openWindow: jest.fn().mockResolvedValue(undefined) },
    location: { origin: "https://shop-a.zencpro.app" },
    registration: { showNotification: jest.fn().mockResolvedValue(undefined) },
    skipWaiting: jest.fn(),
  };

  vm.runInNewContext(readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8"), { URL, self });

  return { listeners, self };
}
```

and add:

```ts
describe("push", () => {
  const event = (data: unknown) => ({ data: { json: () => data }, waitUntil: jest.fn() });

  it("shows the title and body with the Zenc icon and badge and remembers where to go", () => {
    const { listeners, self } = load();
    const push = event({ body: "Corte em 01/12", title: "Agendamento confirmado", url: "https://shop-a.zencpro.app/appointments" });

    listeners.push(push);

    expect(self.registration.showNotification).toHaveBeenCalledWith("Agendamento confirmado", {
      badge: "/icons/icon-192.png", body: "Corte em 01/12", data: { url: "https://shop-a.zencpro.app/appointments" }, icon: "/icons/icon-192.png",
    });
    expect(push.waitUntil).toHaveBeenCalled();
  });

  it("still shows something for an empty or unreadable payload", () => {
    const { listeners, self } = load();

    listeners.push({ data: { json: () => { throw new Error("not json"); } }, waitUntil: jest.fn() });

    expect(self.registration.showNotification).toHaveBeenCalledWith("Zenc", expect.objectContaining({ data: { url: "/" } }));
  });
});

describe("notificationclick", () => {
  const click = (url?: string) => ({ notification: { close: jest.fn(), data: url ? { url } : {} }, waitUntil: jest.fn() });

  it("opens the url in a new window when no Zenc tab is open", async () => {
    const { listeners, self } = load();
    const event = click("https://shop-a.zencpro.app/appointments");

    listeners.notificationclick(event);
    await (event.waitUntil.mock.calls[0][0] as Promise<unknown>);

    expect(event.notification.close).toHaveBeenCalled();
    expect(self.clients.openWindow).toHaveBeenCalledWith("https://shop-a.zencpro.app/appointments");
  });

  it("focuses and navigates an open tab of the same origin instead", async () => {
    const { listeners, self } = load();
    const tab = { focus: jest.fn().mockResolvedValue(undefined), navigate: jest.fn().mockResolvedValue(undefined), url: "https://shop-a.zencpro.app/home" };
    tab.focus.mockResolvedValue(tab);
    self.clients.matchAll.mockResolvedValue([{ focus: jest.fn(), url: "https://shop-b.zencpro.app/home" }, tab]);
    const event = click("https://shop-a.zencpro.app/payouts");

    listeners.notificationclick(event);
    await (event.waitUntil.mock.calls[0][0] as Promise<unknown>);

    expect(tab.focus).toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledWith("https://shop-a.zencpro.app/payouts");
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("falls back to the root when the notification has no url", async () => {
    const { listeners, self } = load();
    const event = click();

    listeners.notificationclick(event);
    await (event.waitUntil.mock.calls[0][0] as Promise<unknown>);

    expect(self.clients.openWindow).toHaveBeenCalledWith("https://shop-a.zencpro.app/");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/service-worker.test.ts`
Expected: FAIL (`listeners.push is not a function`).

- [ ] **Step 3: Implement**

Replace the last comment line of `public/sw.js` ("Web push (multi-shop part 4) adds ...") and append:

```js
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
```

(Keep the three existing listeners and the header comment above them; update that header's last line to "The push handlers below show the notification and open the screen it is about.")

- [ ] **Step 4: Run and see them pass**

Run: `npx jest tests/unit/service-worker.test.ts`
Expected: PASS (the part 3 tests plus these 5).

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add public/sw.js tests/unit/service-worker.test.ts
git commit -m "feat(web): service worker shows push notifications and opens the right screen"
```

---

### Task 7: Client — subscription state, the subscribe flow and sign-out

**Files:**
- Create: `src/features/notifications/web-push-state.ts`, `src/features/notifications/web-push.ts`, `src/features/notifications/use-web-push.ts`
- Modify: `src/features/notifications/api.ts`, `src/features/auth/api.ts` (`signOut`)
- Test: `tests/unit/web-push-state.test.ts`, `tests/unit/web-push.test.ts`, `tests/unit/use-web-push.test.ts`, `tests/integration/notifications.test.ts` (extend), the existing sign-out test (`grep -rln "signOut" tests/integration tests/unit`)

**Interfaces:**
- Consumes: `isIos`, `InstallEnvironment`, `readInstallEnvironment` (part 3).
- Produces:
  - `registerWebPushSubscription(supabase: Pick<SupabaseClient, "rpc">, subscription: { endpoint: string; keys: { auth: string; p256dh: string } }, origin: string, locale: Language | null = null): Promise<void>` → `rpc("register_web_push_subscription", { target_locale, target_origin, target_subscription })`
  - `deactivateMyWebSubscription(supabase, endpoint: string): Promise<void>` → `rpc("deactivate_my_web_subscription", { target_endpoint })`
  - `type WebPushEnvironment = { hasNotification: boolean; hasPushManager: boolean; hasServiceWorker: boolean; ios: boolean; isWeb: boolean; permission: "default" | "denied" | "granted"; standalone: boolean; subscribed: boolean }`
  - `type WebPushState = "hidden" | "ios-install" | "default" | "denied" | "on"` and `resolveWebPushState(env: WebPushEnvironment): WebPushState` — not web or unsupported browser → `hidden`; iPhone/iPad not installed → `ios-install`; denied → `denied`; granted and subscribed → `on`; everything else → `default`.
  - `urlBase64ToUint8Array(base64: string): Uint8Array`
  - `enableWebPush(deps: { getRegistration: () => Promise<{ pushManager: { subscribe: (options: { applicationServerKey: Uint8Array; userVisibleOnly: true }) => Promise<{ toJSON: () => unknown }> } }>; locale: Language | null; origin: string; publicKey: string; requestPermission: () => Promise<NotificationPermission>; save: (subscription: WebSubscriptionJson, origin: string, locale: Language | null) => Promise<void> }): Promise<"on" | "denied">` — asks permission **first** (it must stay inside the tap), then subscribes with the VAPID key and saves.
  - `useWebPush(): { enable: () => Promise<void>; error: boolean; state: WebPushState }` (reads the environment asynchronously; after enabling, state becomes `on` or `denied`; when permission is already granted and the browser has a subscription it re-saves it once per user so a shared browser's row belongs to whoever is signed in).
  - `unsubscribeWebPush(supabase): Promise<void>` — web only, best effort, called by `signOut` before the session ends.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/web-push-state.test.ts`:

```ts
import { resolveWebPushState } from "../../src/features/notifications/web-push-state";
import type { WebPushEnvironment } from "../../src/features/notifications/web-push-state";

const env = (patch: Partial<WebPushEnvironment> = {}): WebPushEnvironment => ({
  hasNotification: true, hasPushManager: true, hasServiceWorker: true, ios: false, isWeb: true, permission: "default", standalone: false, subscribed: false, ...patch,
});

describe("resolveWebPushState", () => {
  it.each([
    ["the native app", env({ isWeb: false }), "hidden"],
    ["a browser without service workers", env({ hasServiceWorker: false }), "hidden"],
    ["a browser without the Push API", env({ hasPushManager: false }), "hidden"],
    ["a browser without Notifications", env({ hasNotification: false }), "hidden"],
    ["an iPhone where Zenc is not installed", env({ hasPushManager: false, ios: true }), "ios-install"],
    ["an installed iPhone app", env({ ios: true, standalone: true }), "default"],
    ["an installed iPhone app with notifications on", env({ ios: true, permission: "granted", standalone: true, subscribed: true }), "on"],
    ["permission not asked yet", env(), "default"],
    ["permission denied", env({ permission: "denied" }), "denied"],
    ["permission granted and saved", env({ permission: "granted", subscribed: true }), "on"],
    ["permission granted but the subscription is gone", env({ permission: "granted" }), "default"],
  ])("%s", (_name, environment, expected) => {
    expect(resolveWebPushState(environment)).toBe(expected);
  });
});
```

Create `tests/unit/web-push.test.ts`:

```ts
import { enableWebPush, unsubscribeWebPush, urlBase64ToUint8Array } from "../../src/features/notifications/web-push";

const json = { endpoint: "https://push.example/a", keys: { auth: "a", p256dh: "p" } };
const registration = (subscribe = jest.fn().mockResolvedValue({ toJSON: () => json })) => ({ pushManager: { subscribe } });

describe("urlBase64ToUint8Array", () => {
  it("decodes URL-safe base64 with or without padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});

describe("enableWebPush", () => {
  it("asks for permission first, subscribes with the VAPID key and saves with the origin and language", async () => {
    const order: string[] = [];
    const subscribe = jest.fn().mockImplementation(async () => { order.push("subscribe"); return { toJSON: () => json }; });
    const save = jest.fn().mockImplementation(async () => { order.push("save"); });

    const outcome = await enableWebPush({
      getRegistration: async () => { order.push("registration"); return registration(subscribe); },
      locale: "pt", origin: "https://shop-a.zencpro.app", publicKey: "AQID",
      requestPermission: async () => { order.push("permission"); return "granted"; },
      save,
    });

    expect(outcome).toBe("on");
    expect(order).toEqual(["permission", "registration", "subscribe", "save"]);
    expect(Array.from((subscribe.mock.calls[0][0] as { applicationServerKey: Uint8Array }).applicationServerKey)).toEqual([1, 2, 3]);
    expect(subscribe.mock.calls[0][0]).toMatchObject({ userVisibleOnly: true });
    expect(save).toHaveBeenCalledWith(json, "https://shop-a.zencpro.app", "pt");
  });

  it("stops at a denied permission without subscribing or saving", async () => {
    const subscribe = jest.fn();
    const save = jest.fn();

    await expect(enableWebPush({ getRegistration: async () => registration(subscribe), locale: null, origin: "https://a", publicKey: "AQID", requestPermission: async () => "denied", save })).resolves.toBe("denied");
    expect(subscribe).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("treats a dismissed prompt as not enabled", async () => {
    await expect(enableWebPush({ getRegistration: async () => registration(), locale: null, origin: "https://a", publicKey: "AQID", requestPermission: async () => "default", save: jest.fn() })).resolves.toBe("denied");
  });
});

describe("unsubscribeWebPush", () => {
  it("does nothing on native", async () => {
    const rpc = jest.fn();

    await expect(unsubscribeWebPush({ rpc } as never)).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

Create `tests/unit/use-web-push.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/notifications/web-push", () => ({
  enableWebPush: jest.fn(),
  readWebPushEnvironment: jest.fn(),
  registerCurrentSubscription: jest.fn(),
}));

import { enableWebPush, readWebPushEnvironment, registerCurrentSubscription } from "../../src/features/notifications/web-push";
import { useWebPush } from "../../src/features/notifications/use-web-push";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const env = { hasNotification: true, hasPushManager: true, hasServiceWorker: true, ios: false, isWeb: true, permission: "default", standalone: false, subscribed: false };

describe("useWebPush", () => {
  beforeEach(() => {
    jest.mocked(useSupabaseSession).mockReturnValue({ profile: { userId: "u1" }, supabase: {} } as never);
    jest.mocked(registerCurrentSubscription).mockResolvedValue(undefined);
  });
  afterEach(() => jest.clearAllMocks());

  it("starts from the browser's state", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    const { result } = await renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.state).toBe("default"));
  });

  it("turns on after a granted permission", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    jest.mocked(enableWebPush).mockResolvedValue("on");
    const { result } = await renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("default"));

    await act(async () => result.current.enable());

    expect(result.current.state).toBe("on");
  });

  it("shows denied after a refused permission", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    jest.mocked(enableWebPush).mockResolvedValue("denied");
    const { result } = await renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("default"));

    await act(async () => result.current.enable());

    expect(result.current.state).toBe("denied");
  });

  it("reports an error when subscribing fails and keeps the card usable", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue(env as never);
    jest.mocked(enableWebPush).mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.state).toBe("default"));

    await act(async () => result.current.enable());

    expect(result.current.error).toBe(true);
    expect(result.current.state).toBe("default");
  });

  it("re-saves an existing subscription for the signed-in user", async () => {
    jest.mocked(readWebPushEnvironment).mockResolvedValue({ ...env, permission: "granted", subscribed: true } as never);
    const { result } = await renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.state).toBe("on"));
    expect(registerCurrentSubscription).toHaveBeenCalledTimes(1);
  });
});
```

Extend `tests/integration/notifications.test.ts`:

```ts
import { deactivateMyWebSubscription, registerWebPushSubscription } from "../../src/features/notifications/api";

describe("web push subscription contracts", () => {
  it("registers a subscription through the authenticated RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ active: true }], error: null });
    const subscription = { endpoint: "https://push.example/a", keys: { auth: "a", p256dh: "p" } };

    await registerWebPushSubscription({ rpc } as never, subscription, "https://shop-a.zencpro.app", "pt");

    expect(rpc).toHaveBeenCalledWith("register_web_push_subscription", { target_locale: "pt", target_origin: "https://shop-a.zencpro.app", target_subscription: subscription });
  });

  it("throws the RPC error", async () => {
    await expect(registerWebPushSubscription({ rpc: jest.fn().mockResolvedValue({ data: null, error: new Error("nope") }) } as never, { endpoint: "https://x", keys: { auth: "a", p256dh: "p" } }, "https://a")).rejects.toThrow("nope");
  });

  it("switches the caller's own subscription off", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await deactivateMyWebSubscription({ rpc } as never, "https://push.example/a");

    expect(rpc).toHaveBeenCalledWith("deactivate_my_web_subscription", { target_endpoint: "https://push.example/a" });
  });
});
```

In the existing sign-out test (find it with `grep -rn "signOut" tests/integration tests/unit`) add: "signing out first switches this browser's push subscription off on web and never blocks sign-out": mock `../../src/features/notifications/web-push` `unsubscribeWebPush` (resolves, then rejects) and assert `supabase.auth.signOut` is still called in both cases and that `unsubscribeWebPush` ran first.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/web-push-state.test.ts tests/unit/web-push.test.ts tests/unit/use-web-push.test.ts tests/integration/notifications.test.ts`
Expected: FAIL (modules / exports not found).

- [ ] **Step 3: Implement the pure parts and the API**

Create `src/features/notifications/web-push-state.ts`:

```ts
export type WebPushEnvironment = {
  hasNotification: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  ios: boolean;
  isWeb: boolean;
  permission: "default" | "denied" | "granted";
  standalone: boolean;
  subscribed: boolean;
};

export type WebPushState = "hidden" | "ios-install" | "default" | "denied" | "on";

// What the "Turn on notifications" card should offer. iPhone and iPad only have Web Push for an app added to the Home Screen
// (iOS 16.4+), and a plain Safari tab has no PushManager at all, so "iPhone, not installed" is decided before the support check.
export function resolveWebPushState(env: WebPushEnvironment): WebPushState {
  if (!env.isWeb) return "hidden";
  if (env.ios && !env.standalone) return "ios-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "hidden";
  if (env.permission === "denied") return "denied";

  return env.permission === "granted" && env.subscribed ? "on" : "default";
}
```

In `src/features/notifications/api.ts` append:

```ts
export type WebSubscriptionJson = { endpoint: string; keys: { auth: string; p256dh: string } };

export async function registerWebPushSubscription(
  supabase: NotificationsSupabaseClient,
  subscription: WebSubscriptionJson,
  origin: string,
  locale: Language | null = null,
) {
  const { error } = await supabase.rpc("register_web_push_subscription", {
    target_locale: locale,
    target_origin: origin,
    target_subscription: subscription,
  });

  if (error) throw error;
}

export async function deactivateMyWebSubscription(supabase: NotificationsSupabaseClient, endpoint: string) {
  const { error } = await supabase.rpc("deactivate_my_web_subscription", { target_endpoint: endpoint });

  if (error) throw error;
}
```

- [ ] **Step 4: Implement the browser-facing flow**

Create `src/features/notifications/web-push.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type { Language } from "../../i18n/language";
import { isIos } from "../install/install-state";
import { readInstallEnvironment } from "../install/environment";
import { deactivateMyWebSubscription, registerWebPushSubscription } from "./api";
import type { WebSubscriptionJson } from "./api";
import type { WebPushEnvironment } from "./web-push-state";

// The VAPID public key is a URL-safe base64 string; pushManager.subscribe wants the raw bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = atob(padded);

  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

type Registration = { pushManager: { subscribe: (options: { applicationServerKey: Uint8Array; userVisibleOnly: true }) => Promise<{ toJSON: () => unknown }> } };

type EnableDeps = {
  getRegistration: () => Promise<Registration>;
  locale: Language | null;
  origin: string;
  publicKey: string;
  requestPermission: () => Promise<NotificationPermission>;
  save: (subscription: WebSubscriptionJson, origin: string, locale: Language | null) => Promise<void>;
};

// Permission is asked FIRST and synchronously inside the tap (iPhone/Safari drop the user activation after an await); part 3 already
// registered public/sw.js at app start, so waiting for it afterwards is quick.
export async function enableWebPush({ getRegistration, locale, origin, publicKey, requestPermission, save }: EnableDeps): Promise<"on" | "denied"> {
  const permission = await requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await getRegistration();
  const subscription = await registration.pushManager.subscribe({ applicationServerKey: urlBase64ToUint8Array(publicKey), userVisibleOnly: true });
  await save(subscription.toJSON() as WebSubscriptionJson, origin, locale);

  return "on";
}

export async function readWebPushEnvironment(): Promise<WebPushEnvironment> {
  const install = readInstallEnvironment();
  const isWeb = install.isWeb;
  const hasServiceWorker = isWeb && "serviceWorker" in navigator;
  const hasPushManager = isWeb && "PushManager" in window;
  const hasNotification = isWeb && "Notification" in window;
  let subscribed = false;

  if (hasServiceWorker && hasPushManager) {
    try {
      subscribed = Boolean(await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription());
    } catch {
      subscribed = false;
    }
  }

  return {
    hasNotification, hasPushManager, hasServiceWorker, isWeb, ios: isIos(install), standalone: install.standalone, subscribed,
    permission: hasNotification ? (Notification.permission as WebPushEnvironment["permission"]) : "default",
  };
}

// Saves the browser's existing subscription for whoever is signed in now (a shared browser's row is re-bound to the new account).
export async function registerCurrentSubscription(supabase: Pick<SupabaseClient, "rpc">, locale: Language | null) {
  const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();

  if (subscription) await registerWebPushSubscription(supabase, subscription.toJSON() as WebSubscriptionJson, window.location.origin, locale);
}

// Called by signOut while the session still exists. Best effort: never blocks signing out.
export async function unsubscribeWebPush(supabase: Pick<SupabaseClient, "rpc">) {
  if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();

  if (subscription) await deactivateMyWebSubscription(supabase, subscription.endpoint);
}
```

Create `src/features/notifications/use-web-push.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

import { getCurrentLanguage } from "../../i18n";
import { useSupabaseSession } from "../../providers/AppProviders";
import { registerWebPushSubscription } from "./api";
import { enableWebPush, readWebPushEnvironment, registerCurrentSubscription } from "./web-push";
import { resolveWebPushState } from "./web-push-state";
import type { WebPushState } from "./web-push-state";

// Expo inlines EXPO_PUBLIC_* only for literal reads.
const vapidPublicKey = () => process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function useWebPush(): { enable: () => Promise<void>; error: boolean; state: WebPushState } {
  const { profile, supabase } = useSupabaseSession();
  const [state, setState] = useState<WebPushState>("hidden");
  const [error, setError] = useState(false);
  const rebound = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    void readWebPushEnvironment().then((environment) => {
      if (!active) return;
      setState(resolveWebPushState(environment));

      // Permission already granted and a subscription exists: make sure it belongs to this signed-in user (once per user).
      if (environment.permission === "granted" && environment.subscribed && profile?.userId && rebound.current !== profile.userId) {
        rebound.current = profile.userId;
        void registerCurrentSubscription(supabase, getCurrentLanguage()).catch(() => undefined);
      }
    });

    return () => {
      active = false;
    };
  }, [profile?.userId, supabase]);

  const enable = useCallback(async () => {
    setError(false);
    try {
      const outcome = await enableWebPush({
        getRegistration: () => navigator.serviceWorker.ready,
        locale: getCurrentLanguage(),
        origin: window.location.origin,
        publicKey: vapidPublicKey(),
        requestPermission: () => Notification.requestPermission(),
        save: (subscription, origin, locale) => registerWebPushSubscription(supabase, subscription, origin, locale),
      });

      setState(outcome === "on" ? "on" : "denied");
    } catch {
      setError(true);
    }
  }, [supabase]);

  return { enable, error, state };
}
```

In `src/features/auth/api.ts` change `signOut`:

```ts
import { unsubscribeWebPush } from "../notifications/web-push";

export async function signOut(supabase: Pick<AuthSupabaseClient, "auth" | "rpc">) {
  // Web only and best effort: this browser stops receiving the signed-out user's notifications, and a failure must not keep them signed in.
  await unsubscribeWebPush(supabase).catch(() => undefined);

  const { error } = await supabase.auth.signOut();
  throwIfError(error);
}
```

(`AuthSupabaseClient` already includes `rpc`; its `Pick` widens the parameter type, so the call sites that pass the full client keep compiling.)

- [ ] **Step 5: Run and see them pass**

Run: `npx jest tests/unit/web-push-state.test.ts tests/unit/web-push.test.ts tests/unit/use-web-push.test.ts tests/integration`
Expected: PASS (including the sign-out test and the existing token tests).

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/notifications src/features/auth/api.ts tests/unit tests/integration
git commit -m "feat(notifications): web push subscribe flow, state and sign-out cleanup"
```

---

### Task 8: The "Turn on notifications" card on the three hubs, with e2e

**Files:**
- Create: `src/features/notifications/NotificationPrompt.tsx`, `tests/e2e/web-push.web.spec.ts`, `tests/e2e/web-push-helpers.ts`
- Modify: `src/i18n/locales/en.ts`, `pt.ts`, `es.ts` (new `webPush` group), the three profile hubs (`app/(customer)/(tabs)/profile.tsx`, `app/(professional)/my-profile/index.tsx`, `app/(owner)/settings.tsx`)
- Test: `tests/unit/notification-prompt.test.ts`

**Interfaces:**
- Consumes: `useWebPush` (Task 7), `InstallGuide`, `resolveInstallState`, `readInstallEnvironment` (part 3), `Card`-style classes of `InstallPrompt`.
- Produces: `NotificationPrompt()` — renders nothing for `hidden`; card `testID="notify-card"`; button `testID="notify-button"` for `default` (calls `enable`); `ios-install` shows "Add Zenc to your Home Screen first" and opens `InstallGuide`; `denied` explains how to re-enable; `on` shows the "on" line.
- i18n keys: `webPush.title`, `webPush.body`, `webPush.button`, `webPush.onTitle`, `webPush.onBody`, `webPush.deniedTitle`, `webPush.deniedBody`, `webPush.iosTitle`, `webPush.iosBody`, `webPush.error`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/notification-prompt.test.ts`:

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/features/notifications/use-web-push", () => ({ useWebPush: jest.fn() }));
jest.mock("../../src/features/install/environment", () => ({ readInstallEnvironment: jest.fn() }));

import { readInstallEnvironment } from "../../src/features/install/environment";
import { NotificationPrompt } from "../../src/features/notifications/NotificationPrompt";
import { useWebPush } from "../../src/features/notifications/use-web-push";
import i18n from "../../src/i18n";

const push = (state: string, extra: Record<string, unknown> = {}) => jest.mocked(useWebPush).mockReturnValue({ enable: jest.fn(), error: false, state, ...extra } as never);

describe("NotificationPrompt", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("renders nothing when the browser cannot do web push", async () => {
    push("hidden");
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.queryByTestId("notify-card")).toBeNull();
  });

  it("asks to turn on and calls enable on tap", async () => {
    const enable = jest.fn();
    push("default", { enable });
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Turn on notifications")).toBeTruthy();
    await fireEvent.press(view.getByTestId("notify-button"));

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("explains how to re-enable after a denial", async () => {
    push("denied");
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Notifications are blocked")).toBeTruthy();
    expect(view.queryByTestId("notify-button")).toBeNull();
  });

  it("confirms when notifications are on", async () => {
    push("on");
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Notifications are on")).toBeTruthy();
    expect(view.queryByTestId("notify-button")).toBeNull();
  });

  it("shows an error line when subscribing failed", async () => {
    push("default", { error: true });
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Could not turn on notifications. Try again.")).toBeTruthy();
  });

  it("on an iPhone without the installed app, says to add it to the Home Screen and opens the guide", async () => {
    push("ios-install");
    jest.mocked(readInstallEnvironment).mockReturnValue({ capturedPrompt: null, isWeb: true, maxTouchPoints: 5, standalone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
    const view = await render(React.createElement(NotificationPrompt));

    expect(view.getByText("Add Zenc to your Home Screen first")).toBeTruthy();
    await fireEvent.press(view.getByTestId("notify-card"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
  });
});
```

Create `tests/e2e/web-push-helpers.ts`:

```ts
import type { Page } from "@playwright/test";

// Chrome's real push service needs the network and a real VAPID key; the e2e fakes only the subscription itself.
export async function stubPushSubscription(page: Page) {
  await page.addInitScript(() => {
    const subscription = { endpoint: "https://push.example/e2e", keys: { auth: "e2e-auth", p256dh: "e2e-p256dh" } };

    PushManager.prototype.subscribe = async function subscribe() {
      return { endpoint: subscription.endpoint, toJSON: () => subscription } as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function getSubscription() {
      return (window as unknown as { __subscribed?: boolean }).__subscribed ? ({ endpoint: subscription.endpoint, toJSON: () => subscription } as unknown as PushSubscription) : null;
    };
  });
}
```

Create `tests/e2e/web-push.web.spec.ts`:

```ts
import { expect, test } from "./fixtures";

import { json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";
import { stubPushSubscription } from "./web-push-helpers";

test.use({ serviceWorkers: "allow" });

test("turning notifications on registers the subscription with this origin and shows it is on", async ({ context, page }) => {
  let registered: Record<string, unknown> | null = null;

  await context.grantPermissions(["notifications"]);
  await stubPushSubscription(page);
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/register_web_push_subscription")) {
      registered = route.request().postDataJSON() as Record<string, unknown>;

      return json(route, [{ active: true }]), true;
    }
  });

  await page.goto("/profile");
  await expect(page.getByText("Turn on notifications")).toBeVisible();
  await page.getByTestId("notify-button").click();

  await expect(page.getByText("Notifications are on")).toBeVisible();
  expect(registered).toMatchObject({
    target_origin: new URL(page.url()).origin,
    target_subscription: { endpoint: "https://push.example/e2e", keys: { auth: "e2e-auth", p256dh: "e2e-p256dh" } },
  });
});

test("blocked notifications explain how to turn them back on", async ({ context, page }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "denied" });
  });
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/profile");
  await expect(page.getByText("Notifications are blocked")).toBeVisible();
});
```

(`mockCustomerRest(page, handler)`'s second argument is the optional handler used in `field-examples.web.spec.ts`: it returns `true` when it handled the request.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/notification-prompt.test.ts`
Expected: FAIL (module not found). The e2e spec fails too until Step 4.

- [ ] **Step 3: Texts and the component**

`en.ts` (new `webPush` group after `install`):

```ts
  webPush: {
    body: "Get booking and reminder alerts on this device.",
    button: "Turn on",
    deniedBody: "Allow notifications for this site in your browser settings, then reload the page.",
    deniedTitle: "Notifications are blocked",
    error: "Could not turn on notifications. Try again.",
    iosBody: "On iPhone, notifications only work for the app added to your Home Screen.",
    iosTitle: "Add Zenc to your Home Screen first",
    onBody: "You will get booking and reminder alerts on this device.",
    onTitle: "Notifications are on",
    title: "Turn on notifications",
  },
```

`pt.ts`:

```ts
  webPush: {
    body: "Receba avisos de agendamentos e lembretes neste aparelho.",
    button: "Ativar",
    deniedBody: "Permita as notificações deste site nas configurações do navegador e recarregue a página.",
    deniedTitle: "As notificações estão bloqueadas",
    error: "Não foi possível ativar as notificações. Tente de novo.",
    iosBody: "No iPhone, as notificações só funcionam no app adicionado à Tela de Início.",
    iosTitle: "Adicione o Zenc à Tela de Início primeiro",
    onBody: "Você receberá avisos de agendamentos e lembretes neste aparelho.",
    onTitle: "As notificações estão ativas",
    title: "Ativar notificações",
  },
```

`es.ts`:

```ts
  webPush: {
    body: "Recibe avisos de reservas y recordatorios en este dispositivo.",
    button: "Activar",
    deniedBody: "Permite las notificaciones de este sitio en la configuración del navegador y recarga la página.",
    deniedTitle: "Las notificaciones están bloqueadas",
    error: "No se pudieron activar las notificaciones. Inténtalo de nuevo.",
    iosBody: "En iPhone, las notificaciones solo funcionan en la app añadida a la pantalla de inicio.",
    iosTitle: "Añade Zenc a la pantalla de inicio primero",
    onBody: "Recibirás avisos de reservas y recordatorios en este dispositivo.",
    onTitle: "Las notificaciones están activas",
    title: "Activar notificaciones",
  },
```

Create `src/features/notifications/NotificationPrompt.tsx`:

```tsx
import { Bell, BellRing } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { readInstallEnvironment } from "../install/environment";
import { InstallGuide } from "../install/InstallGuide";
import { resolveInstallState } from "../install/install-state";
import { useWebPush } from "./use-web-push";

const CARD = "min-h-[56px] flex-row items-center justify-between gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4";

// Sits next to the install card on each profile hub. The permission prompt only ever follows a tap here (browsers and iPhone
// require it), never automatically.
export function NotificationPrompt() {
  const colors = useColors();
  const { t } = useTranslation();
  const { enable, error, state } = useWebPush();
  const [guideOpen, setGuideOpen] = useState(false);

  if (state === "hidden") return null;

  if (state === "ios-install") {
    const install = resolveInstallState(readInstallEnvironment());
    const variant = install.status === "installable-ios" && install.browser === "chrome" ? "ios-chrome" : "ios-other";

    return (
      <>
        <Pressable accessibilityRole="button" className={CARD} onPress={() => setGuideOpen(true)} testID="notify-card">
          <View className="flex-1 gap-1">
            <Text className="text-base font-sans-semibold text-ink">{t("webPush.iosTitle")}</Text>
            <Text className="text-sm font-sans text-neutral-600">{t("webPush.iosBody")}</Text>
          </View>
          <Bell color={colors.neutral[400]} size={20} />
        </Pressable>
        <InstallGuide onClose={() => setGuideOpen(false)} variant={variant} visible={guideOpen} />
      </>
    );
  }

  if (state === "on" || state === "denied") {
    const on = state === "on";

    return (
      <View className={CARD} testID="notify-card">
        <View className="flex-1 gap-1">
          <Text className="text-base font-sans-semibold text-ink">{on ? t("webPush.onTitle") : t("webPush.deniedTitle")}</Text>
          <Text className="text-sm font-sans text-neutral-600">{on ? t("webPush.onBody") : t("webPush.deniedBody")}</Text>
        </View>
        {on ? <BellRing color={colors.primary[600]} size={20} /> : <Bell color={colors.neutral[400]} size={20} />}
      </View>
    );
  }

  return (
    <View className={CARD} testID="notify-card">
      <View className="flex-1 gap-1">
        <Text className="text-base font-sans-semibold text-ink">{t("webPush.title")}</Text>
        <Text className="text-sm font-sans text-neutral-600">{t("webPush.body")}</Text>
        {error ? <Text className="text-sm font-sans text-danger-500">{t("webPush.error")}</Text> : null}
      </View>
      <Button label={t("webPush.button")} onPress={() => void enable()} size="sm" testID="notify-button" />
    </View>
  );
}
```

On each of the three hubs import `NotificationPrompt` (`src/features/notifications/NotificationPrompt`) and put `<NotificationPrompt />` directly below `<InstallPrompt />` (part 3 Task 6 placed that line above the sign-out block).

- [ ] **Step 4: Run and see them pass**

Run: `npx jest tests/unit/notification-prompt.test.ts tests/unit/locale-parity.test.ts`, then (procedure in part 1 Task 14) `npm run e2e:export && npx playwright test -c playwright.chrome.config.ts tests/e2e/web-push.web.spec.ts tests/e2e/profile.web.spec.ts tests/e2e/professional-profile.web.spec.ts tests/e2e/owner-profile.web.spec.ts`
Expected: PASS. (If the headless Chrome reports `Notification.permission` as `denied` even after `grantPermissions`, the first e2e test fails at "Turn on notifications"; in that case stub `Notification.requestPermission` and the `permission` getter in `stubPushSubscription` instead of relying on `grantPermissions`.)

- [ ] **Step 5: Look at it (project rule: verify UI in a browser)**

Serve the export, open the customer profile on `http://shop-a.localhost:4173/profile` with the stub from `web-push-helpers.ts`, and screenshot the four card states (default, on, denied, and the iPhone one with an iPhone user agent): the card must sit under the install card with the same 20 px radius, neutral border and spacing, the `Turn on` button in the accent colour; the iPhone card opens part 3's guide window (centred, X top-right, tap outside closes). Record what was checked in the PR description.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts && npx jest 2>&1 | tail -6
git add src/features/notifications/NotificationPrompt.tsx src/i18n/locales "app/(customer)/(tabs)/profile.tsx" "app/(professional)/my-profile/index.tsx" "app/(owner)/settings.tsx" tests/unit/notification-prompt.test.ts tests/e2e/web-push.web.spec.ts tests/e2e/web-push-helpers.ts
git commit -m "feat(notifications): turn-on-notifications card on the three profile hubs"
```

---

### Task 9: Final verification, the real-browser check and the hosting handover

- [ ] **Step 1: Run every check**

```bash
npx tsc --noEmit
./node_modules/.bin/eslint app src tests scripts
npm run lint
npx jest 2>&1 | tail -8
npm run test:e2e:runner
npx supabase db reset && npx supabase test db 2>&1 | tail -8
```

Expected: 0 type errors, both lints clean, Jest green (the known "worker process has failed to exit gracefully" warning from `tests/integration/app-providers.test.ts` is pre-existing), node tests green, pgTAP all files pass (`054`, `055` included). Run the full Playwright suite once (part 1 Task 14).

- [ ] **Step 2: Real browser check on `localhost` (spec, Testing)**

With the local stack up, the dispatcher served as in Task 5 Step 5 (real VAPID pair in the env file, `EXPO_PUBLIC_VAPID_PUBLIC_KEY` set for the export), the app exported and served on `http://shop-a.localhost:4173`:
1. Sign in as the dev customer, open `/profile`, tap "Turn on" and allow the prompt. The card shows "Notifications are on"; `select web_origin, active from public.notification_tokens where web_subscription is not null` shows the row with the origin.
2. Insert an outbox row for that user (`appointment.booked`, payload with the seed shop's id and a start time) and call the function with the service key: the browser shows "Appointment booked" with the Zenc icon; clicking it focuses the tab and opens `/appointments`.
3. Subscribe the same browser on a second host (`http://shop-b.localhost:4173`, after a seed second shop) and repeat step 2 with a shop-A payload: only the shop-A subscription's tab receives it.
4. Sign out: `active` becomes false for this browser's row.
Record the four outcomes in the PR description.

- [ ] **Step 3: Handover for the user (cannot be automated)**

List in the PR description what the user does once hosted (spec, Hosting track and Testing): generate the VAPID pair once; `supabase secrets set VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT=mailto:<business e-mail>`; set `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in the web build; check on Android Chrome (card, permission, a real notification, click opens the screen) and on an iPhone with Zenc installed to the Home Screen (iOS 16.4+; a plain Safari tab shows the "Add Zenc to your Home Screen first" card). Mention the known limits: recurrence and payout notifications go to all of a user's subscriptions (no shop in their payload), customers' recurrence inbox rows stay unscoped (part 1 open question 2), and the badge is the full-colour icon.

- [ ] **Step 4: Update the spec status and commit**

Set `Status:` of `docs/superpowers/specs/2026-11-18-web-push-design.md` to `implemented on feat-web-push`.

```bash
git add docs
git commit -m "docs: web push implemented"
```

---

## Execution deviations

- **Task 1 (spike):** Path A (`npm:web-push@3.6.7`) works on the local Edge runtime (`{"status":201}` from a public HTTPS endpoint; cold 12 s, warm 1.4 s). **No real push service could be reached:** Chrome started by Playwright refuses `pushManager.subscribe` ("Registration failed - permission denied", headless and headed, permission granted). So the spike used a generated P-256 subscription pointing at `https://httpbin.org/status/201`, and the browser check stubs `PushManager.subscribe`. Note: `docs/superpowers/spikes/2026-11-18-web-push-library.md`.
- **VAPID keys:** a local pair lives only in the git-ignored `supabase/functions/.env` (`.gitignore` line `.env` covers it); production uses `supabase secrets set VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT` and `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in the web build (documented in `docs/hosted-deploy.md` and `.env.example`).
- **Task 2:** the endpoint regex `{1,2000}` is invalid in Postgres (repetition limit 255); the migration uses `^https://[^[:space:]]+$` plus `char_length(endpoint) <= 2000`.
- **Task 3:** `055` scopes its claim assertions to its own outbox rows by `event_key` (the claim also takes the seed's pending rows, so counting by `event_type` was wrong).
- **Task 5:** `web-push-lib.ts` carries a `// @ts-expect-error` on the `npm:` import (the Node TypeScript project cannot resolve Deno specifiers).
- **Task 7:** `urlBase64ToUint8Array` returns `Uint8Array<ArrayBuffer>` (TypeScript 6 lib typing); `use-web-push.test.ts` gives `window` a `location` (the hook reads the origin when it builds the subscribe request); a `sign-out.test.ts` covers the order (unsubscribe, then sign out) and the failure case.
- **Browser check (real Chrome, local stack, screenshots in the session scratchpad `shots4/`):** the card went default → on with a real saved row (`web_origin = http://shop-a.localhost:4180`, `platform = web`, locale `en`, `active`); an `appointment.booked` outbox row was claimed by `dispatch-notifications` served on the local Edge runtime and sent (`{"failed":0,"sent":1,...}`, outbox `sent`); because the stub endpoint is not a push service the same `{title, body, url}` message (built by `buildMessage` and `notificationPath`) was delivered to the page's service worker through DevTools (`ServiceWorker.deliverPushMessage`), which showed "Appointment booked" with `icon-192.png` and `url = http://shop-a.localhost:4180/appointments`; signing out set the row inactive; the denied card and the iPhone-not-installed card (with the install guide) render. The notification **click** (focus/navigate/open) could not be automated in Chrome; it is covered by the `sw.js` unit tests.
- **Not touched:** the empty `fetch` handler in `sw.js` (push does not need it).
