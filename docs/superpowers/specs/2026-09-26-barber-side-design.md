# Barber Side — Design

**Date:** 2026-09-26
**Status:** Draft

## Goal

Give each barber a real account: sign in, see only their own agenda, block
their own unavailable time, mark their own appointments completed/no-show,
maintain a public profile (photo, bio, which services they perform), and see
a read-only earnings dashboard driven by a per-barber compensation model
(commission percentage or chair rental). The shop owner invites each barber;
barbers never self-register.

This is Task 16 in `docs/project-status.md`'s numbering, the first cycle
after Task 15 (device language). It was scoped in a planning conversation,
not from an existing backlog item — see "Decisions carried in from planning"
below for the product calls already made before this spec was written.

## Scope

In scope:

- New `profile_role` value `barber`, granted only through an owner-initiated
  invite (Edge Function + Admin API), never through public signup.
- `barbers` gains a profile (bio, avatar) and a compensation model
  (commission percent, or a chair-rental amount/frequency) — owner-editable;
  bio/avatar are also barber-editable.
- Barber-scoped RPCs: own agenda (bounded range, paginated — mirrors
  `list_owner_agenda`), own appointment status transitions (mirrors
  `set_owner_appointment_status`), own profile read/update, own earnings
  summary (bounded range, aggregated by service).
- Barber-scoped RLS on `schedule_overrides`: a barber may create/read/delete
  their own `block` overrides (not `opening` — extending hours stays an
  owner decision).
- New route group `app/(barber)` with its own tab navigation: Agenda,
  Profile, Earnings.
- Owner-side additions: an "Invite" action on the existing barbers screen,
  a compensation editor, and a coarse account-status indicator (invited /
  active) — extending `app/(owner)/barbers.tsx`, not a new screen.
- `resolveAuthRedirect`'s `GROUP_ROLE`/`ROLE_HOME` tables gain the `barber`
  entry.

Out of scope (explicitly deferred, do not build):

- Any real payment processing, split, or payout. The earnings screen is a
  report; money still changes hands outside the app.
- Per-service commission percentage (`barber_services`-level override). V1
  is one flat percentage per barber. The schema leaves room for this later
  (see "Open items") but it is not built now.
- Per-barber weekly working hours. Availability stays shop-level; a barber
  only carves out exceptions within it.
- Subscription/billing for the shop owner. Explicitly out of scope per the
  planning conversation — "no in-app billing for now."
- Customer-app changes. Untouched by this cycle.
- Barber offboarding/deactivation flows beyond what `barbers.active` already
  does (deactivating a barber already exists; this spec does not add a
  distinct "remove account access" action).

## Decisions carried in from planning

These were settled in conversation before this spec was written and are
recorded here so the plan doesn't re-litigate them:

- Compensation dashboard is report-only; no payment processing (Recommended
  option chosen).
- Invite flow: owner invites by email/link; the barber sets a password and
  the account attaches to the existing `barbers` row. Barbers do not
  self-register and then get matched by the owner.
- Availability stays shop-level; a barber only blocks time within it (not a
  full per-barber weekly schedule) — chosen to avoid refactoring the
  availability engine, which is deliberately shop-level today (see decision
  006).
- Compensation is commission **or** chair rental, one flat percentage per
  barber (not per service). Per-service commission is deferred.
- No billing/subscription work of any kind in this cycle.

## Findings that shaped this design

- `barbers.user_id` already references `profiles(user_id)` and is already
  nullable — the schema anticipated this exact feature in Task 3 and was
  simply never wired up. No column rename or backfill is needed, only a
  unique partial index (`barbers.user_id` must map to at most one barber).
- `barber_services` already models "which services a barber performs," with
  optional price/duration overrides, complete with owner RLS and a public
  `resolve_effective_service` reader. Nothing new is needed here beyond a
  barber-facing read of their own rows (existing public/owner policies
  already cover it — a barber counts as `authenticated` and the
  `barber_services_select_public_active` policy already exposes active
  rows; no change required).
- `schedule_overrides` is already per-barber (`barber_id`, `kind: block |
  opening`), just owner-only today. Barber self-service is a narrow RLS
  addition, not a new table.
- **Security finding, must be designed around:** the existing
  `handle_new_auth_user` trigger reads `raw_user_meta_data` from the new
  `auth.users` row and is the only thing populating `profiles`. If a barber
  account were provisioned by trusting client-supplied signup metadata (e.g.
  `role: "barber", barber_id: "..."`), any anonymous caller could self-sign-up
  through the existing public `signUp` call with forged metadata and claim
  a barber slot. **The trigger must keep defaulting every new signup to
  `customer`, unconditionally — it must not read a client-supplied `role` or
  `barber_id` at all.** Promotion to `barber` and the `barbers.user_id` link
  are instead performed by the invite Edge Function itself, using the
  service-role key, immediately after it creates the invited user through
  the Admin API — the same "service-role does the sensitive write, RPC does
  the authorized read" split already used by `delete-account`.
- `list_owner_agenda` / `set_owner_appointment_status` /
  `list_owner_agenda_overrides` (decision 009) are the exact shape to mirror
  for a barber's own view — same bounded-range and pagination discipline,
  scoped by `barbers.user_id = auth.uid()` instead of `is_shop_owner`.
- No admin-invite pattern exists yet; `delete-account` is the closest
  precedent (authenticated caller → service-role Edge Function → Admin API
  call). `requestPasswordReset` uses `auth.resetPasswordForEmail`, which is
  the wrong primitive here (it only works for existing users).
- DESIGN_SYSTEM.md has no stat-tile/dashboard component. A small
  `StatTile` domain component (label + tabular-nums value, optionally a
  sublabel) is a justified addition, matching how `BottomTabBar` was added
  on demand in the customer-frontend cycle.
- Stable error codes stop at `P0018` in `domain-errors.ts` (`P0016` is
  already used by notifications, database-only, not client-mapped). New
  codes start at `P0019`.

## Backend — migration `0025_barber_role.sql` (additive)

- `alter type public.profile_role add value 'barber';` — own migration file
  (`ALTER TYPE ... ADD VALUE` cannot run in the same transaction that later
  uses the value; the next migration file is a separate transaction, so this
  is split into `0025_barber_role.sql` doing only the enum add, and
  `0026_barber_functions_and_rls.sql` doing everything else. This mirrors
  how Task 5 deliberately split `0010`/`0011` for sequencing reasons.)

`0026_barber_functions_and_rls.sql`:

- `barbers` gains: `bio text`, `avatar_url text`,
  `compensation_type public.barber_compensation_type not null default
  'commission'` (new enum `commission | chair_rental`), `commission_percent
  numeric(5,2)` (0–100, required when `compensation_type = 'commission'`),
  `chair_rental_amount_cents integer` (positive, required when
  `compensation_type = 'chair_rental'`), `chair_rental_frequency
  public.chair_rental_frequency` (new enum `weekly | monthly`, required
  alongside the rental amount), `invited_at timestamptz`. A check constraint
  enforces exactly the fields matching the chosen `compensation_type` are
  present and the other set is null (same pattern as
  `barbers_archive_matches_active`).
- `create unique index barbers_user_id_key on public.barbers (user_id)
  where user_id is not null;` — one auth user maps to at most one barber
  record shop-wide (matches the `customers_shop_user_key` precedent).
- `public.is_own_barber(target_barber_id uuid) returns boolean` — security
  definer helper, mirrors `is_shop_owner`: `exists(select 1 from
  public.barbers where id = target_barber_id and user_id = auth.uid())`.
- RLS additions on `barbers`: a `barbers_select_self` policy (barber reads
  their own full row — `active`/archived barbers can still see their own
  history) and a `barbers_update_self` policy restricted by a `with check`
  that only permits `bio`/`avatar_url` to differ from the previous row
  (compensation and identity fields stay owner-only — enforced via a
  trigger comparing `old`/`new` on those columns, since Postgres RLS cannot
  express "these columns only" directly; the existing column-level SELECT
  grant pattern doesn't help for UPDATE).
- RLS additions on `schedule_overrides`: `schedule_overrides_insert_self`
  and `schedule_overrides_delete_self` (barber may insert/delete rows where
  `public.is_own_barber(barber_id)` **and** `kind = 'block'`);
  `schedule_overrides_select_self` (barber may read their own rows, block or
  opening, so they see owner-granted extra openings too).
- `list_my_barber_agenda(range_start date, range_end date, page_limit
  integer default 100, page_offset integer default 0)` — same shape and
  bounds as `list_owner_agenda` (≤31-day range, 1–100 page size), but
  authorization is `exists(select 1 from public.barbers where user_id =
  auth.uid() and shop_id = <the barber's own shop>)`; the target barber and
  shop are derived from the caller's own `barbers` row, never passed as a
  parameter — a barber can never query anyone else's schedule by id.
- `set_my_appointment_status(appointment_id uuid, new_status
  public.appointment_status)` — same transition rule as
  `set_owner_appointment_status` (`scheduled|confirmed → completed|no_show`
  only), but authorization requires `target.barber_id in (select id from
  public.barbers where user_id = auth.uid())`. Kept as its own small
  function rather than sharing code with the owner version — same
  duplication-over-abstraction call the codebase already makes elsewhere
  (e.g. booking vs. owner-booking do not share a generic "mutate
  appointment" helper).
- `get_my_barber_profile()` — returns the caller's own `barbers` row
  (including compensation fields — a barber can see their own commission
  percent/rental terms, just not edit them) plus their `barber_services`
  rows joined with service names, for the profile screen.
- `update_my_barber_profile(bio text, avatar_url text)` — security definer,
  updates only those two columns on the caller's own `barbers` row.
- `get_my_barber_earnings(period_start date, period_end date)` — bounded to
  ≤92 local days (one quarter; wider than the 31-day agenda cap because this
  is one aggregate query, not a row list). Returns one row per service:
  `service_id, service_name_snapshot, completed_count, gross_cents`, computed
  only over the caller's own `completed` appointments in the shop-local
  range. The client sums rows for the period total and applies the
  compensation formula (percentage of gross, or gross minus nothing for
  chair rental — rental due is shown as a separate configured figure, not
  netted against an arbitrary date range) — the same "RPC returns raw
  numbers, a pure client function derives the display value" split already
  used for `resolveEffectiveService`.
- `get_barber_account_status(target_barber_id uuid)` — owner-only, returns
  whether the linked account has ever signed in
  (`auth.users.last_sign_in_at is not null`) for the owner's barbers screen
  to distinguish "invited, not yet activated" from "active."

New stable error codes (`P0019`–`P0022`): `BARBER_NOT_LINKED` (RPC called by
an authenticated user with no linked barber row), `BARBER_INVITE_CONFLICT`
(barber already has a linked account, or the email is already in use),
`COMPENSATION_INVALID` (owner submitted an inconsistent compensation
payload), `EARNINGS_INVALID_RANGE` (range exceeds 92 days or is inverted).

## Backend — Edge Function `invite-barber`

Mirrors `delete-account`'s shape (authenticated caller, service-role secret,
raw `fetch`, no Admin SDK):

1. Reject non-POST, reject missing `Authorization`.
2. Resolve the caller's user id via `/auth/v1/user` (anon key + the caller's
   token), then call the `is_shop_owner` RPC with that same token to confirm
   the caller owns `shop_id` for the target `barber_id` (`P0019` semantics:
   403 if not, matching the `42501`/`FORBIDDEN` branch already in
   `delete-account`).
3. Confirm the target barber row has `user_id is null` and `active = true`
   (service-role read) — otherwise `409 BARBER_INVITE_CONFLICT`.
4. Call the Admin API invite endpoint (`POST {url}/auth/v1/invite`, service
   role key, body `{ email }`) — this both creates the `auth.users` row
   (which fires `handle_new_auth_user`, landing as `role = customer` per the
   security finding above) and sends Supabase's built-in invite email.
5. Immediately patch, service-role, bypassing RLS: `profiles.role =
   'barber'` for the new user id, and `barbers.user_id = <new id>`,
   `barbers.invited_at = now()` for the target barber row (guarded by the
   same `user_id is null` condition, so a race between two invite calls
   can't double-link). If the second update affects zero rows (raced), roll
   back by leaving the profile as `barber` with no linked barber — treat as
   an operational edge case surfaced as `500`, not silently ignored; the
   owner retries with a fresh invite to a different barber row if this ever
   happens. This mirrors `delete-account`'s "anonymize first, so a partial
   failure is still safe to retry" reasoning, applied to invite instead.
6. Return `200 { userId }` on success.

## Routing and roles

```
app/
  (barber)/_layout       # Tabs: Agenda / Profile / Earnings
    my-agenda             # own appointments, day-first like owner agenda
                          # (not "agenda" — the owner already owns /agenda;
                          # same collision the customer cycle hit and fixed
                          # by renaming its own tab route to /appointments)
    profile                # bio/avatar edit, read-only compensation + service list
    earnings                # period picker + StatTile row + per-service breakdown
```

- `resolveAuthRedirect`'s `GROUP_ROLE` gains `"(barber)": "barber"`.
- The owner's `barbers.tsx` screen gains: an "Invite" button per barber row
  with `user_id is null` (calls the Edge Function), a status chip (Not
  invited / Invited / Active, from `invited_at` + `get_barber_account_status`),
  and a compensation editor (radio: commission % vs. chair rental
  amount+frequency) reusing the existing form patterns in that screen.

## New design-system component

`StatTile` (label, value, optional sublabel) — presentational, tabular-nums
value, used three times on the earnings screen (completed count, gross
revenue, calculated earnings) and reusable later on the owner side if a
shop-wide dashboard is ever built.

## Errors and states

Same convention as every prior cycle: `SkeletonLoader` while loading,
`EmptyState` for "no appointments in range" / "no completed services this
period," `Toast` for mutation results. New codes above are added to
`domain-errors.ts` and its `toDomainError` switch.

## Testing

Same TDD discipline as every prior cycle:

- pgTAP: enum value usable, `is_own_barber`, unique `barbers.user_id` index,
  agenda/status/profile/earnings RPCs (happy path, cross-barber isolation,
  owner cannot call barber-scoped RPCs as themselves without a linked
  barber row, anonymous denied), `schedule_overrides` self block
  insert/select/delete, `opening` still rejected for a barber actor, the
  compensation check constraint.
- Edge Function: no automated runner exists for Deno functions in this repo
  (documented limitation since `delete-account`) — verify manually against
  the local stack (owner invites, barber accepts, profile promoted, barber
  row linked, re-invite of an already-linked barber rejected) the same way
  `delete-account` was verified.
- Jest integration: new API client wrappers for every new RPC.
- Jest unit: `StatTile`, the client-side commission/rental earnings
  calculation (pure function, mirrors `resolveEffectiveService`'s split).
- Playwright (mocked Supabase REST): barber login → agenda → mark
  completed, barber creates/removes a block, profile edit, earnings screen
  rendering from a fixed RPC response. Owner-side: invite button call,
  compensation editor.
- Gate: `npm run verify` + `npm run test:e2e:web` + `npm run export:web`,
  then a code review of the diff, per every prior cycle.

## Open items

- Per-service commission override (`barber_services`-level percentage) —
  deferred; the flat per-barber percentage is v1.
- Subscription/billing gating by number of barbers — explicitly deferred,
  no work started.
- What happens when an owner deactivates a barber who has a linked account
  (today `barbers.active = false` already blocks new bookings; whether the
  linked auth account should be force-signed-out or barred from the
  `(barber)` route group is not decided — `resolveAuthRedirect` would need
  to also check `barbers.active`, not just `profiles.role`, for this to be
  airtight; flagged here rather than decided silently).
- Invite email copy/branding is Supabase's default template unless the
  owner configures a custom one in the Supabase dashboard — same
  owner-provided-content pattern as the legal text in Task 14.
