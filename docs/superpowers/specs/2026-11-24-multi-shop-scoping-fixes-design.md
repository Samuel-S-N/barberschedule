# Multi-shop scoping fixes — design

Date: 2026-11-24
Status: approved in chat by the user (relayed by the orchestrator session); **not yet started**, the user decides when
Source: two leftovers of the multi-shop work (PRs #99–#103), found before the deploy

Wording: Zenc is for the whole beauty sector. Prose says "business" or "shop" (pt: estabelecimento / negócio).

## Why

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

### Found while reading, **not** in this design (needs the user's decision)

- `0062_payout_notifications.sql` inserts into `public.notifications` directly, **with no shop**, in
  `enqueue_payout_due_notifications` (recipient: the shop's owner) and `record_professional_payout` (recipient: the
  professional). Both functions have the shop at hand (`sh.id`). They hit the same guessing as above: a payout notice to an
  owner of two shops, or to a professional in two shops, can land in the wrong shop's inbox. It is the same class of
  bug and a two-line fix each, but it is **not** in the approved scope.
- The push `notification_outbox` payload of recurrence events carries no `shop_id` (`add_inbox_event` copies the params as
  they are), so a web-push for them is sent to all of the user's subscriptions instead of the one on the shop's own
  address (part 4's rule). With the shop now a parameter it could add `shop_id` to the payload; not in scope either.

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
- Existing recurrence pgTAP files (`031`, `034`, `038`, `039`, `040`, `041`) must still pass: the five functions keep
  their signatures and behaviour.
- Gates: `npm run typecheck`, ROOT `npm run lint`, the Jest files touching `updateMyProfile`, the affected pgTAP files.
  Migrations are applied with `npx supabase migration up`, never `supabase db reset`. The local pgTAP failures from seed
  counts (`010`, `012`, `016`, `055`) are not regressions; CI's clean database is the check.

## Out of scope

Backfilling old rows, the payout notifications and the push payload above, changing `notifications_set_shop`, any app UI.
