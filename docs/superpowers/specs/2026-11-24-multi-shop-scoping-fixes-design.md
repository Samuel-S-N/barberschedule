# Multi-shop scoping fixes — design

Date: 2026-11-24
Status: approved in chat by the user (relayed by the orchestrator session); **not yet started**, the user decides when
Source: two leftovers of the multi-shop work (PRs #99–#103), found before the deploy

Wording: Zenc is for the whole beauty sector. Prose says "business" or "shop" (pt: estabelecimento / negócio).

## Why

Three things (the third, push messages, was added after the first two were approved; see section 3).

A person (or a staff member) can belong to several shops, each on its own address. Two database functions still behave
as if there were one shop per person:

1. `update_my_profile` is written to return **one** customer row, but a person has one per shop. Worse than "arbitrary":
   its `update … returning * into result` makes PL/pgSQL raise **`P0003 query returned more than one row`** as soon as the
   person is a customer in two shops (verified by running the pgTAP fixture against the current database), so **editing
   the profile fails for every customer of two shops today**. Nobody uses the returned value.
2. Recurrence notifications are created **without a shop**. Since `0069` every inbox is scoped to its shop's address, and
   a row without a shop shows in **every** shop's inbox (customer recipients) or gets a **guessed** shop (staff recipients).

## 1. `update_my_profile` returns nothing

Current definition: `supabase/migrations/0028_profile_nickname.sql` (the later `0051` only adds the separate
`update_my_staff_profile`).

- It keeps doing what it does: update `profiles` (name, nickname) and **every** `customers` row of the person (name,
  phone), one per shop: it is the same person, so the rename must reach all their shops. It keeps the validation
  (`P0017 PROFILE_INVALID`, `42501` for anonymous) and the `P0007 CUSTOMER_UNAVAILABLE` error when the person has no
  customer row.
- It stops **returning** a row: `returns void`. Nobody reads the value: `app/(customer)/me/account.tsx` only invalidates
  queries on success.
- New migration (Postgres cannot change a return type in place): drop the function and create it again with the same
  parameters, same grants (revoke from `public, anon`, grant to `authenticated`).
- `src/features/account/api.ts` `updateMyProfile`: calls the RPC and returns nothing (no `toCustomer`). A `void` RPC
  answers `204` with no body (`data: null`).

## 2. Recurrence notifications carry their shop

- `public.add_inbox_event` (`0050`) inserts a notification **without** `appointment_id` and **without** `shop_id`. The
  trigger `notifications_set_shop` (`0069`) then fills the shop only by guessing from the recipient: the owner's shop, else
  the first active `professionals` row of the user. Both guesses happen to be right **today** (one owner per shop,
  `shops_owner_user_id_key`, and one shop per professional, `professionals_user_id_key`), but they would be wrong the day a
  person may own or staff several shops. A customer recipient has neither, so the row stays `shop_id is null`, and
  `count_unread_notifications(p_shop_id)` / the inbox query (`shop_id = X or shop_id is null`) treat it as belonging to
  **every** shop.
- Fix, in a **new migration** (never rewrite `0050`: it would need `db reset`, which the user does not allow locally):
  - drop `add_inbox_event` and create it again with a **required shop parameter**
    `add_inbox_event(target_user uuid, target_shop uuid, target_kind text, target_params jsonb, target_key text, push_event text default null)`
    that is inserted into `notifications.shop_id`; keep `revoke … from public` (the function is executable by its owner only,
    which is how it is today);
  - recreate **every function that calls it**, copying the **latest** body verbatim and changing only the call so it
    passes the shop the function already has.
- No backfill of old `null` rows: there is no hosted environment, only local data.
- The trigger `notifications_set_shop` is left alone: it still serves the direct inserts (below) and only fills a shop
  when none is given.

### Functions the new migration recreates (latest definition → source)

| Function | Latest definition | Shop passed |
|---|---|---|
| `request_recurrence(uuid, integer, date, time, uuid, uuid)` | `0058_plan_change_and_cancellation.sql` (replaced `0050` → `0053`) | `bs.shop_id` |
| `decide_recurrence_request(uuid, boolean)` | `0058_plan_change_and_cancellation.sql` (`0050` → `0058`) | `req.shop_id` |
| `create_recurrence_for_customer(uuid, uuid, integer, date, time)` | `0053_recurrence_plans.sql` (`0050` → `0053`) | `bs.shop_id` |
| `request_series_cancellation(uuid)` | `0058_plan_change_and_cancellation.sql` | `series_row.shop_id` |
| `decide_series_cancellation(uuid, boolean)` | `0058_plan_change_and_cancellation.sql` | `series_row.shop_id` |

All five keep their signatures, so `create or replace` keeps their grants. `add_inbox_event` has no other caller (no
Edge Function, no app code, no test).

### Decided out of scope: payout notifications

`0062_payout_notifications.sql` inserts into `public.notifications` directly with no shop (`enqueue_payout_due_notifications`,
`record_professional_payout`). **Decision (user): they stay out.** A payout is always between one shop and one
professional, and a professional works in one shop only today (`professionals_user_id_key`), so the guess is right.

## 3. Push messages say which shop they come from

Problem: the push text never names the business. The title is the event ("Agendamento confirmado"), so a customer of two
businesses cannot tell them apart. And recurrence pushes carry no `shop_id` in their outbox payload, so
`claim_notification_batch` (latest: `0073_web_push_claim.sql`) returns a null `shop_slug` for them, `pickRows` sends the
push to **all** of the user's web subscriptions and the tap URL can open the wrong shop.

Design (user-approved, option "A: name as title"):

1. **Recurrence pushes carry the shop.** In `0077` the new `add_inbox_event` already receives `target_shop`; it also puts it
   into the **outbox** payload: `target_params || jsonb_build_object('shop_id', target_shop)`. The **inbox** notification's
   `params` stay as they are (the app reads them; nothing there needs the shop). The existing `shop_slug` logic of
   `claim_notification_batch` and `pickRows` then sends the push to the shop's own address and the tap opens it.
2. **Every push shows the shop name as its title; the event title moves to the start of the body.** Example (pt):
   title `Studio Bella`, body `Agendamento confirmado: Corte em 25/11 às 14:00.` The same in en and es, built from the
   existing catalog in `supabase/functions/dispatch-notifications/messages.ts` (`buildMessage` is unchanged; a new
   `withShopName(message, shopName)` wraps its result: title := shop name, body := `"<event title>: <event body>"`). An
   event with **no shop name** (a payout, or any event whose payload has no `shop_id`) keeps today's title and body
   exactly. The unknown-event fallback (title `Zenc`) just gets the shop name as title with its body unchanged (no
   "Zenc: …" prefix). Applied to **both channels**, web and Expo, in the one place both go through (`attempt` in
   `dispatch.ts`).
3. **The name comes from the claim.** A new migration (`0079`) redefines `claim_notification_batch` to also return
   `shops.name` as `shop_name`. The return columns change, so it is dropped and created again with the same grants
   (revoked from `public, anon, authenticated`, granted to `service_role`); its body is copied from `0073` with two lines
   added. `ClaimedNotification` in `dispatch.ts` gets `shop_name: string | null`.

Not changed: the web tap URL (`notification-path.ts` still opens the role's agenda root; deep-linking a web push to the
appointment is the follow-up already noted in PR #105), and the Expo `data` (it is the outbox payload, which carries
`shop_id` for appointment events and, after `0077`, recurrence events; the app has no notification-tap listener on native
today, so nothing reads it yet).

## Testing

- pgTAP `059_recurrence_notification_shop.sql` (new): one person is a customer in two shops; the professional works in one
  (the constraint); each shop has its own owner (one owner per shop is enforced). The staff assertions pass before the fix
  as well (guards); the customer ones are the ones that fail first. A recurrence request, its decision, a series
  cancellation request and its decision, and a manual series made in shop A leave **shop A** on every row — customer rows
  and staff rows — no row with a null shop; the customer's unread count and inbox list for shop A show them, for shop B
  they do not; `add_inbox_event` exists only with the new signature and is not executable by `authenticated`.
- pgTAP `011_customer_self_service.sql` and `015_profile_nickname.sql`: stop reading the function's return value (read
  `customers`), assert `update_my_profile` returns `void`, and a person with customer rows in two shops gets **both** renamed.
- Jest (`tests/integration/account.test.ts`): `updateMyProfile` resolves with nothing and still sends the same parameters
  and maps the same errors; the e2e mock of `update_my_profile` answers `204`.
- pgTAP `059` also asserts the recurrence **outbox** payload carries `shop_id`.
- pgTAP `060_claim_shop_name.sql` (new): `claim_notification_batch` returns the shop's **name** and slug for a recurrence
  event (staff and customer recipients) and a null name for an event with no shop; service_role may execute it,
  authenticated and anon may not.
- Jest (`tests/unit/notification-messages.test.ts`, `dispatch.test.ts`): `withShopName` in pt/en/es (name as title, event
  title at the start of the body), the fallback with no shop name (today's text unchanged), the `Zenc` fallback; the
  dispatcher applies it on the web channel and on the Expo channel, and leaves a no-shop event as before. Existing
  dispatcher tests must still pass (their base row gets `shop_name: null`).
- Existing recurrence pgTAP files (`031`, `034`, `038`, `039`, `040`, `041`) must still pass: the five functions keep
  their signatures and behaviour.
- Gates: `npm run typecheck`, ROOT `npm run lint`, the Jest files touching `updateMyProfile`, the affected pgTAP files.
  Migrations are applied with `npx supabase migration up`, never `supabase db reset`. The local pgTAP failures from seed
  counts (`010`, `012`, `016`, `055`) are not regressions; CI's clean database is the check.

## Out of scope

Backfilling old rows, the payout notifications (decided), changing `notifications_set_shop`, deep-linking the web push tap, a native notification-tap handler, any app UI.
