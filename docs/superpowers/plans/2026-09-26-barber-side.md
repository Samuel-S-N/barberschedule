# Barber Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every barber their own account, scoped agenda, self-service
blocks, profile (bio/avatar/services), and a read-only earnings dashboard
driven by a per-barber commission-or-chair-rental compensation model. Owners
invite barbers; barbers never self-register. No billing/payment processing
of any kind is added.

**Architecture:** Two additive migrations — `0025_barber_role.sql` (enum
value only, its own transaction) and `0026_barber_functions_and_rls.sql`
(everything else: columns, constraints, RLS, RPCs). A new Edge Function
`invite-barber` performs the sensitive account-creation step server-side,
mirroring `delete-account`'s authenticated-caller/service-role shape. A new
`src/features/barbers` client (extended) plus a new `src/features/earnings`
feature wrap the RPCs. Screens live under a new `app/(barber)` route group
with its own tab bar, alongside targeted additions to the existing
`app/(owner)/barbers.tsx`.

**Tech Stack:** Expo Router 57, React Native 0.86 / RN Web, NativeWind 4,
TanStack Query 5, Supabase (Postgres RPC, Edge Function), Zod 4, Jest
(jest-expo, RNTL 14), pgTAP, Playwright — unchanged from every prior cycle.

**Spec:** `docs/superpowers/specs/2026-09-26-barber-side-design.md`

## Global Constraints

- Relative imports only (no `@/` alias); tokens via NativeWind classes; no
  `#hex` in JSX (`src/lib/design/colors.ts` for SVG/Reanimated).
- Fonts: `font-sans-medium|semibold|bold`, `font-display-*` — never
  `font-medium|semibold|bold`.
- Numbers (price, time, count) use `style={{ fontVariant: ["tabular-nums"] }}`.
- Hit targets ≥ 44×44; every icon-only/interactive element has
  `accessibilityRole` + `accessibilityLabel`.
- Jest `testMatch` is `**/*.test.ts` only — tests use `React.createElement`,
  not JSX.
- Client never grants authority: every mutation goes through a
  `security definer` RPC or the invite Edge Function; RLS is the real
  boundary, the client only mirrors it.
- New stable SQLSTATEs continue from `P0019` (`P0016`–`P0018` already used).
  Unauthenticated/forbidden generic case stays `42501`.
- Timezone: shop-local dates via `src/lib/dates/shop-time.ts`
  (`America/Sao_Paulo`).
- Baseline before this plan: `npm run verify` passing at 62 Jest suites /
  282 tests, 3 Node Web-runner tests, 294 pgTAP assertions across 12 files
  (per `docs/project-status.md`, Task 15).
- Every task ends with typecheck + its focused tests green before commit;
  commit messages end with the attribution line configured for the
  implementing session.
- A barber-scoped RPC never accepts a `barber_id`/`shop_id` parameter for
  "which barber am I" — it always derives that from `auth.uid()` against
  the caller's own linked `barbers` row. This is the same rule the
  architecture spec already applies to the owner/customer RPCs and is the
  one property every pgTAP suite in this plan must prove first.

## File Structure

```
supabase/migrations/0025_barber_role.sql                 NEW  enum value only
supabase/migrations/0026_barber_functions_and_rls.sql    NEW  columns, RLS, RPCs
supabase/tests/013_barber_role.sql                       NEW  pgTAP
supabase/functions/invite-barber/index.ts                NEW  Edge Function
src/features/barbers/api.ts                              MOD  + barber-scoped calls
src/features/barbers/validation.ts                        MOD  + compensation schema
src/features/barbers/types.ts                             MOD  + profile/compensation types
src/features/appointments/barber-agenda.ts                NEW  own-agenda API + pure grouping (mirrors agenda-view.ts)
src/features/schedule/api.ts                              MOD  + self block insert/delete
src/features/earnings/api.ts                              NEW  getMyBarberEarnings wrapper
src/features/earnings/calculate.ts                        NEW  pure commission/rental math
src/features/auth/session.ts                              MOD  GROUP_ROLE + barber entry
src/features/auth/types.ts                                MOD  AppRole gains "barber"
src/lib/errors/domain-errors.ts                            MOD  + P0019..P0022 codes
src/components/domain/StatTile.tsx                         NEW  (+ barrel export)
app/(barber)/_layout.tsx                                    NEW  Tabs
app/(barber)/my-agenda.tsx                                  NEW  (not agenda.tsx — collides with owner's /agenda)
app/(barber)/profile.tsx                                     NEW
app/(barber)/earnings.tsx                                    NEW
app/(owner)/barbers.tsx                                      MOD  invite button, status chip, compensation editor
tests/…                                                       see each task
docs/decisions/013-barber-role.md                            NEW  (final task)
docs/project-status.md                                        MOD  Task 16 entry (final task)
```

---

### Task 1: Migrations `0025`/`0026` + pgTAP

**Files:**
- Create: `supabase/migrations/0025_barber_role.sql`
- Create: `supabase/migrations/0026_barber_functions_and_rls.sql`
- Create: `supabase/tests/013_barber_role.sql`

**Interfaces produced** (all in `0026`, all `security definer`, fixed
`search_path`, execute revoked from `public` then granted to `authenticated`
only unless noted):

- `public.is_own_barber(target_barber_id uuid) returns boolean` (stable)
- `public.list_my_barber_agenda(range_start date, range_end date, page_limit integer default 100, page_offset integer default 0) returns setof <agenda row>` (stable)
- `public.set_my_appointment_status(appointment_id uuid, new_status public.appointment_status) returns setof public.appointments`
- `public.get_my_barber_profile() returns <profile row>` (stable)
- `public.update_my_barber_profile(bio text, avatar_url text) returns public.barbers`
- `public.get_my_barber_earnings(period_start date, period_end date) returns setof <earnings row>` (stable)
- `public.get_barber_account_status(target_barber_id uuid) returns boolean` (owner-only)

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/013_barber_role.sql` covering, against fixtures for
one owner, two barbers (A linked to a user, B unlinked), one customer, one
service, one completed + one scheduled appointment for barber A:

- `is_own_barber` true for A's own linked user, false for B (unlinked) and
  false for the owner's user.
- `barbers_user_id_key` rejects linking a second barber to the same user id.
- The compensation check constraint rejects `compensation_type = 'commission'`
  with `chair_rental_amount_cents` set, and rejects `commission` with
  `commission_percent` null; mirrors for `chair_rental`.
- `list_my_barber_agenda` run as barber A's user returns only A's
  appointments; run as barber B's (unlinked — no row exists) or the owner's
  user raises `P0019` (`BARBER_NOT_LINKED`); an out-of-range request (>31
  days) raises `P0014` (reusing the existing agenda-range code, not a new
  one — the bound is the same rule).
- `set_my_appointment_status` transitions A's own scheduled appointment to
  `completed`; rejects transitioning an appointment belonging to a
  different barber (`P0010`, reusing `APPOINTMENT_FORBIDDEN` — same
  semantics as the owner version); rejects an invalid status target
  (`P0013`).
- `schedule_overrides`: barber A can insert/select/delete their own `block`
  row; inserting `kind = 'opening'` as a barber is rejected by RLS
  (`42501`); barber A cannot insert a block for barber B.
- `get_my_barber_profile()` returns A's `barber_services` joined rows;
  `update_my_barber_profile` updates bio/avatar only — attempting to smuggle
  a `compensation_type` change through the same call is impossible because
  the RPC signature has no such parameter (this is a signature-shape
  guarantee, not a runtime test).
- `get_my_barber_earnings` sums only `completed` appointments in range,
  excludes the `scheduled` one and any other barber's; a >92-day range
  raises `P0022` (`EARNINGS_INVALID_RANGE`).
- `get_barber_account_status` true for A (has signed in — fixture sets
  `last_sign_in_at`), false for B; rejected for a non-owner caller.
- Anonymous denied on every RPC above.

- [ ] **Step 2: Run to verify it fails**

`HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/013_barber_role.sql`
Expected: FAIL (types/functions don't exist yet). If Docker/Supabase cannot
run here, record that and continue without claiming DB verification.

- [ ] **Step 3: Write `0025_barber_role.sql`**

```sql
alter type public.profile_role add value 'barber';
```

- [ ] **Step 4: Write `0026_barber_functions_and_rls.sql`**

Key excerpts (full file also adds grants/policies/comments consistent with
every prior migration's style):

```sql
create type public.barber_compensation_type as enum ('commission', 'chair_rental');
create type public.chair_rental_frequency as enum ('weekly', 'monthly');

alter table public.barbers
  add column bio text,
  add column avatar_url text,
  add column compensation_type public.barber_compensation_type not null default 'commission',
  add column commission_percent numeric(5,2),
  add column chair_rental_amount_cents integer,
  add column chair_rental_frequency public.chair_rental_frequency,
  add column invited_at timestamptz;

alter table public.barbers add constraint barbers_compensation_matches_type check (
  (
    compensation_type = 'commission'
    and commission_percent is not null and commission_percent between 0 and 100
    and chair_rental_amount_cents is null and chair_rental_frequency is null
  ) or (
    compensation_type = 'chair_rental'
    and chair_rental_amount_cents is not null and chair_rental_amount_cents > 0
    and chair_rental_frequency is not null
    and commission_percent is null
  )
);

create unique index barbers_user_id_key on public.barbers (user_id) where user_id is not null;

create or replace function public.is_own_barber(target_barber_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1 from public.barbers
    where id = target_barber_id and user_id = auth.uid()
  );
$$;
```

`list_my_barber_agenda` reuses `list_owner_agenda`'s range validation
(`P0014` on invalid range) but resolves `target_shop_id`/`target_barber_id`
from `select id, shop_id from public.barbers where user_id = auth.uid()`
first, raising `P0019` (`BARBER_NOT_LINKED`) if that lookup finds nothing,
then filters appointments by that barber id only (no join needed against a
caller-supplied id).

`set_my_appointment_status` follows `set_owner_appointment_status`'s body
exactly, replacing the `is_shop_owner` check with `target.barber_id in
(select id from public.barbers where user_id = auth.uid())`.

RLS additions on `schedule_overrides`:

```sql
create policy "schedule_overrides_select_self"
on public.schedule_overrides for select to authenticated
using (public.is_own_barber(barber_id));

create policy "schedule_overrides_insert_self_block"
on public.schedule_overrides for insert to authenticated
with check (public.is_own_barber(barber_id) and kind = 'block');

create policy "schedule_overrides_delete_self"
on public.schedule_overrides for delete to authenticated
using (public.is_own_barber(barber_id) and kind = 'block');
```

RLS additions on `barbers` (`barbers_select_self`, and `barbers_update_self`
guarded by a `before update` trigger that raises `P0021`
(`COMPENSATION_INVALID`) if any column other than `bio`/`avatar_url`
changed and the actor is not the owner).

- [ ] **Step 5: Run to verify it passes**

Same command as Step 2. Expected: PASS.

- [ ] **Step 6: Add the new codes to `domain-errors.ts`**

`P0019` → `BARBER_NOT_LINKED`, `P0020` → `BARBER_INVITE_CONFLICT`, `P0021` →
`COMPENSATION_INVALID`, `P0022` → `EARNINGS_INVALID_RANGE`.

- [ ] **Step 7: Gate**

`npm run typecheck && npm run lint` (no client code changed yet, so this is
a quick sanity check), commit.

---

### Task 2: Barber agenda + status client, own agenda screen

**Files:**
- Create: `src/features/appointments/barber-agenda.ts`
- Modify: `src/features/appointments/lifecycle.ts` (or sibling — add
  `setMyAppointmentStatus` alongside the existing lifecycle calls)
- Create: `tests/integration/barber-agenda.test.ts`
- Create: `app/(barber)/_layout.tsx`, `app/(barber)/my-agenda.tsx`
- Modify: `src/features/auth/session.ts`, `src/features/auth/types.ts`
  (`AppRole` gains `"barber"`; `GROUP_ROLE["(barber)"] = "barber"`)
- Create/modify: `tests/unit/route-collisions.test.ts` if the new group
  introduces a path also owned elsewhere (expected: no collision, `/agenda`
  is already owner's — the barber tab must resolve to a distinct path, e.g.
  `app/(barber)/agenda.tsx` → route `/agenda` collides with the owner's
  `app/(owner)/agenda.tsx`; **resolve during planning, not execution**: name
  the barber tab route `/my-agenda` to avoid the collision the customer
  cycle already hit once for the same reason)

- [ ] **Step 1: Failing Jest integration test** for `listMyBarberAgenda` /
      `setMyAppointmentStatus` API wrappers (mock `supabase.rpc`, assert
      params/shape).
- [ ] **Step 2: Verify fails** (`npm test -- --runInBand
      tests/integration/barber-agenda.test.ts`).
- [ ] **Step 3: Implement the wrappers** — thin, throw via
      `toDomainError` on RPC error, same shape as `list_owner_agenda`'s
      existing client wrapper.
- [ ] **Step 4: Verify passes.**
- [ ] **Step 5: Add `AppRole`/`GROUP_ROLE` entries**, extend
      `resolveAuthRedirect`'s existing unit tests with a `(barber)` case
      (signed-in barber allowed, signed-in customer redirected away).
- [ ] **Step 6: Build `app/(barber)/_layout.tsx`** — `Tabs` using the
      existing `BottomTabBar`, labels Agenda / Profile / Earnings.
- [ ] **Step 7: Build `app/(barber)/my-agenda.tsx`** (route `/my-agenda` —
      the owner already owns `/agenda`; the customer cycle hit this exact
      collision once and resolved it by renaming its own tab route to
      `/appointments`, guarded by `tests/unit/route-collisions.test.ts` —
      extend that same test with this new route) — day-first list like
      the owner agenda screen: range navigation, `AppointmentCard` per
      appointment (reused as-is), status action buttons wired to
      `setMyAppointmentStatus`, `SkeletonLoader`/`EmptyState`/`Toast` for
      loading/empty/error, self-block create/remove (small form: date +
      start/end time) wired to the existing `schedule` feature's
      insert/delete once Task 3 adds the self-scoped client call — if Task
      3 is sequenced after this one, stub the block UI behind a feature
      flag comment rather than blocking this task on it (do not reorder
      tasks to avoid a two-line forward reference).
- [ ] **Step 8: Gate** — `npm run typecheck && npm run lint && npm test --
      runInBand`, commit.

---

### Task 3: Barber self-service schedule blocks

**Files:**
- Modify: `src/features/schedule/api.ts` (add `insertMyScheduleBlock`,
  `deleteMyScheduleBlock` — thin wrappers over direct table
  insert/delete, matching how the owner's schedule client already talks to
  `schedule_overrides` directly rather than through an RPC)
- Modify: `tests/integration/*schedule*` (existing suite — add self-scoped
  cases)
- Wire the stub left in Task 2's `my-agenda.tsx` to these calls.

- [ ] **Step 1: Failing Jest integration test** for the two new wrappers.
- [ ] **Step 2: Verify fails.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify passes; wire into `my-agenda.tsx`.**
- [ ] **Step 5: Gate + commit.**

---

### Task 4: Barber profile (bio/avatar/services) + screen

**Files:**
- Modify: `src/features/barbers/api.ts` (+ `getMyBarberProfile`,
  `updateMyBarberProfile`)
- Modify: `src/features/barbers/validation.ts` (+ zod schema: bio max
  length, `avatar_url` must be a valid URL or empty)
- Create: `tests/integration/barber-profile.test.ts`
- Create: `app/(barber)/profile.tsx`

- [ ] **Step 1: Failing Jest integration test.**
- [ ] **Step 2: Verify fails.**
- [ ] **Step 3: Implement wrappers + validation.**
- [ ] **Step 4: Verify passes.**
- [ ] **Step 5: Build the profile screen** — `Input` for bio (multiline),
      avatar URL field (a real image picker/upload is out of scope — v1
      takes a URL, matching how the rest of the app has no file-upload
      story yet), a read-only list of the barber's `barber_services` (name
      + effective price/duration, reusing `resolveEffectiveService`'s
      client math), read-only compensation summary (percent or rental
      terms — editing lives on the owner screen, Task 6), sign-out action.
- [ ] **Step 6: Gate + commit.**

---

### Task 5: Earnings RPC client + pure calculation + screen

**Files:**
- Create: `src/features/earnings/api.ts` (`getMyBarberEarnings(supabase,
  periodStart, periodEnd)`)
- Create: `src/features/earnings/calculate.ts` — pure function
  `calculateBarberEarnings(rows, compensation): { grossCents,
  completedCount, earningsCents, rentalDueCents? }`, unit-testable without
  a renderer (same split as `resolveEffectiveService`/its client mirror).
- Create: `tests/unit/calculate-barber-earnings.test.ts`
- Create: `tests/integration/barber-earnings.test.ts`
- Create: `src/components/domain/StatTile.tsx` (+ barrel export)
- Create: `tests/unit/stat-tile.test.ts`
- Create: `app/(barber)/earnings.tsx`

- [ ] **Step 1: Failing unit test for `calculateBarberEarnings`** — cases:
      commission (percent applied to gross, rounded consistently with how
      `service_price_cents_snapshot` rounding is handled elsewhere in the
      codebase), chair rental (earnings = gross, `rentalDueCents` surfaced
      separately, never subtracted), zero completed appointments in range.
- [ ] **Step 2: Verify fails; implement; verify passes.**
- [ ] **Step 3: Failing unit test for `StatTile`** (renders label/value/
      sublabel, tabular-nums style on the value, a11y role).
- [ ] **Step 4: Verify fails; implement; verify passes.**
- [ ] **Step 5: Failing Jest integration test for `getMyBarberEarnings`**
      (mock RPC response, assert shape/params, assert the >92-day range is
      rejected client-side before the call is even made — mirrors how the
      client already pre-validates the 90-minute cutoff without waiting for
      the database).
- [ ] **Step 6: Verify fails; implement; verify passes.**
- [ ] **Step 7: Build the earnings screen** — a period picker (this week /
      this month / custom, bounded to 92 days), three `StatTile`s
      (completed count, gross revenue, calculated earnings — plus a fourth
      "rent due" tile only when `compensation_type = 'chair_rental'`), a
      per-service breakdown list below.
- [ ] **Step 8: Gate + commit.**

---

### Task 6: Invite Edge Function + owner-side barbers screen additions

**Files:**
- Create: `supabase/functions/invite-barber/index.ts`
- Modify: `app/(owner)/barbers.tsx`
- Modify: `src/features/barbers/api.ts` (+ `inviteBarber`,
  `setBarberCompensation`, `getBarberAccountStatus`)
- Modify: `src/features/barbers/validation.ts` (+ compensation form schema:
  discriminated union on `compensation_type`)
- Create: `tests/integration/invite-barber.test.ts` (client wrapper only —
  the function body itself has no automated runner, per the spec's
  documented limitation)

- [ ] **Step 1: Failing Jest integration tests** for `inviteBarber`,
      `setBarberCompensation` (direct table update — owner already has
      update grant, this just adds the new columns to the existing owner
      form payload), `getBarberAccountStatus`.
- [ ] **Step 2: Verify fails; implement; verify passes.**
- [ ] **Step 3: Write `invite-barber/index.ts`** following
      `delete-account/index.ts`'s exact shape (CORS preflight, method/auth
      guards, `fetch` to `/auth/v1/user` then the `is_shop_owner` RPC, then
      the Admin invite call, then the two service-role patch calls to
      `profiles`/`barbers` described in the spec). Manually verify against
      the local stack: invite → email link → password set → profile role
      is `barber` → barber row linked → re-inviting the same (now-linked)
      barber returns `409`.
- [ ] **Step 4: Extend `app/(owner)/barbers.tsx`** — per-row "Invite" button
      (disabled once linked), status chip (Not invited / Invited / Active),
      compensation editor (segmented control: Comissão vs. Aluguel de
      cadeira, revealing the matching fields — percent input, or amount +
      frequency select).
- [ ] **Step 5: Gate + commit.**

---

### Task 7: Playwright coverage + full regression + docs

**Files:**
- Modify: `tests/e2e/*` — add barber-side specs (mocked Supabase REST, as
  every prior cycle): barber login → agenda → mark completed; barber
  creates/removes a block; barber edits profile; barber views earnings from
  a fixed RPC fixture; owner invites a barber; owner edits compensation.
- Create: `docs/decisions/013-barber-role.md`
- Modify: `docs/project-status.md` — Task 16 entry, verification evidence,
  known limitations (payment processing out of scope, per-service
  commission deferred, barber-account-deactivation interaction with
  `resolveAuthRedirect` not yet decided — carry the spec's "Open items"
  forward here).

- [ ] **Step 1: Write the new Playwright specs against the shipped
      screens** (selectors matching whatever roles/labels Tasks 2–6 actually
      produced — do not guess ahead of implementation).
- [ ] **Step 2: `npm run test:e2e:web`** — PASS.
- [ ] **Step 3: `npm run export:web`** — PASS.
- [ ] **Step 4: Full gate**: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx
      supabase db reset --local` then `HOME=/tmp
      SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS, on a freshly
      reset database (matching the Task 13/14/15 clean-state discipline).
- [ ] **Step 5: Write `docs/decisions/013-barber-role.md`** summarizing the
      decisions actually implemented (mirror the format of decision 009 —
      Decision / Consequences and limits), noting any amendment made during
      execution the way the customer-frontend spec's "Amendments" section
      does.
- [ ] **Step 6: Update `docs/project-status.md`** with the Task 16 entry and
      verification evidence (test counts, gate output).
- [ ] **Step 7: Request a code review of the full diff** before considering
      the cycle complete, per every prior cycle's closing step.
