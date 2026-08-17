# Project status

Date: 2026-08-17
Status: Tasks 1-13 implemented; credentialed EAS build remains deployment-only

## Implemented

- Task 1 — repository, Expo shell, persistent test gate, and baseline docs
- Task 2 — shop/profile/Auth foundation and initial RLS
- Task 3 — barbers, services, customers, barber-services, owner CRUD screens, Task 3 docs
- Task 4 — weekly working periods, dated schedule overrides, owner-only schedule RLS, local shop-time helpers, and a minimal owner schedule editor
- Task 5 — appointment core schema, active barber occupancy exclusion constraint, and database-authoritative availability RPC
- Task 6 — atomic booking RPC, shop-local daily customer lock, owner override, stable booking errors, and appointment client contract
- Task 7 — cancellation/rescheduling RPCs, lifecycle domain errors, customer appointment/history views, and a minimal authenticated booking flow
- Task 8 — owner manual booking, bounded owner agenda reads, completed/no-show status RPCs, and minimal owner agenda/form screens
- Task 9 — owner-managed recurrence series, special-price appointment snapshots, exceptions, conflicts, 90-day idempotent materialization, and minimal monthly-customer/conflict screens
- Task 10 — transactional notification outbox, Expo token registration, bounded retry claiming, push dispatcher, 24-hour reminders, and repeatable recurrence jobs
- Task 11 — deterministic fictional seed, complete RLS matrix audit, seed contract tests, and database/security boundary docs
- Task 12 — password-reset/profile/settings routes, EAS/static-web configuration, release checks, and authenticated Web E2E coverage
- Task 13 — clean-state regression gate, acceptance matrix, decision records, and final release/testing handoff docs

## Current MVP boundary

Availability calculates 15-minute candidate starts from local weekly periods plus dated openings minus blocks. A candidate must contain the full, arbitrary positive service duration plus the barber buffer and its occupied range must not intersect an active scheduled or confirmed appointment's `[starts_at, occupied_until)` range. Barber buffers are stored on the barber, snapshot onto appointments, and extend occupancy without changing the returned service `ends_at`.

`get_available_slots(barber_id, local_date, barber_service_id)` uses the barber's shop timezone and returns only `local_date`, `local_time`, `starts_at`, and `ends_at`. It is callable by anonymous/public clients through a security-definer RPC; schedules and appointments remain private tables with no direct anonymous or customer access.

Task 5 deliberately creates `0010_appointments_core.sql` before `0011_availability_functions.sql`, then hardens it in `0012_availability_hardening.sql`: availability must see occupied appointment ranges. Task 6 adds `0013_booking_functions.sql` for atomic booking, actor authorization, the shop-local daily limit, owner override, and stable error codes. The PostgreSQL exclusion constraint remains the race-safe occupancy guard.

Task 7 adds `0014_appointment_lifecycle.sql`. Customers can cancel or reschedule only their own scheduled/confirmed appointment when the database clock is at least 90 minutes before the current start; exactly 90 minutes is allowed. Shop owners may override this cutoff. Rescheduling locks and changes the existing row in one RPC transaction, temporarily removes its own active occupancy only while verifying the new slot, and rolls the original state back if the new target is unavailable. Customers may read only their own appointment rows; anonymous callers and other customers cannot read them. There is intentionally no broad owner appointment-read policy until Task 8 defines the agenda query boundary.

The minimal customer flow is `/book` → barber → service → local date → availability/review. It uses the existing public catalog and availability boundaries, React Query, React Hook Form, and Zod client validation; `book_appointment` remains authoritative. The shared route guard redirects owners away from the customer booking group, and review requires an active customer row bound to the signed-in customer before submitting source `customer`. `/appointments` and `/history` are customer-only routes; appointments include a minimal ISO timestamp reschedule action.

Task 8 adds an owner-only manual-booking path that calls the existing atomic `book_appointment` RPC with source `owner`; the client never grants owner authority. `list_owner_agenda` and `list_owner_agenda_overrides` are bounded security-definer RPCs over an inclusive local-date range (maximum 32 dates) with appointment `limit`/`offset` pagination. They expose only the requesting shop owner's appointment/customer/barber names and relevant overrides; customers, anonymous callers, and other shop owners are denied. `set_owner_appointment_status` is the only client path for terminal `completed` and `no_show` transitions from scheduled/confirmed rows; appointments remain visible as history. The owner UI is day-first, with bounded week/month queries, range/page navigation, status buttons, and a manual form that chooses customer, active barber-service, local date, authoritative available time, and notes.

Task 9 adds `recurrence_series`, explicit cancelled-occurrence exceptions, and unresolved conflict records. Series use a shop-local anchor date/time with a positive `interval_weeks`; materialized appointments retain UTC timestamps, `source = recurrence`, a unique local series/date identity, and an immutable optional owner special-price snapshot. `ensure_recurrence_window(shop_id, through_date)` is owner-only, serializes one shop with an advisory lock, caps generation at 90 local days ahead, and uses the same booking/availability/GiST occupancy path as ordinary appointments. Every owner series mutation—edit, activation change, occurrence cancellation, and series end—now acquires that exact per-shop transaction lock before its authoritative series read and mutations, so it serializes with materialization. A schedule block or manual appointment produces one conflict at the requested occurrence rather than an automatic replacement. Cancelling one occurrence writes and retains its explicit exception without ending the series; ending a series cancels only future materialized appointments and resolves any still-open future conflict while retaining its history and resolution timestamp. Editing is prospective by decision: every already materialized occurrence, including future dates, is preserved unchanged and only later materialization uses the new configuration.

Not implemented:

- A credentialed EAS Android/iOS build and store submission; those require external EAS credentials and store metadata.

## Verification evidence

Verified on 2026-08-13:

- Focused database: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/004_availability.sql` — PASS (`31` pgTAP assertions).
- Focused client: `npm test -- --runInBand tests/unit/availability-contract.test.ts tests/integration/availability.test.ts` — PASS (`4` tests).
- Complete gate: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS.
  - typecheck and lint — PASS
  - Jest — PASS (`14` suites, `49` tests)
  - Node Web-runner checks — PASS (`3` tests)
  - database tests — PASS (`130` pgTAP assertions across `5` files)
- Focused Task 6 checks: booking pgTAP — PASS (`15` assertions); booking Jest suites — PASS (`7` tests).
- Focused Task 7 checks: `npm test -- --runInBand tests/integration/lifecycle.test.ts` — PASS (`10` tests); `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/006_lifecycle.sql` — PASS (`17` pgTAP assertions).
- Web E2E: `npm run test:e2e:web` — PASS (`3` Playwright tests), including the authenticated customer booking wizard with deterministic intercepted Supabase REST.
- Complete gate: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS: typecheck, lint, `62` Jest tests in `15` suites, `3` Node Web-runner tests, and `147` pgTAP assertions across `6` files.
- Review follow-up: focused auth/lifecycle Jest — PASS (`16` tests); lifecycle pgTAP — PASS (`17` assertions), including Customer A/B/anonymous RLS and two reschedules contending for one target; Web E2E — PASS (`5` Playwright tests), including owner booking redirect and customer rescheduling UI.
- Review follow-up complete gate: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS: typecheck, lint, `62` Jest tests in `15` suites, `3` Node Web-runner tests, and `147` pgTAP assertions across `6` files.
- Focused Task 8 database: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/007_owner_booking.sql` — PASS (`15` pgTAP assertions), covering owner same-day override, customer rejection, agenda pagination, shop isolation, blocks, status authorization, and completed/no-show history.
- Focused Task 8 client: `npm test -- --runInBand tests/integration/owner-booking.test.ts` — PASS (`6` tests).
- Task 8 Web E2E: `npm run test:e2e:web` — PASS (`6` Playwright tests), including the deterministic owner agenda/manual-booking flow.
- Task 8 complete gate: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS: typecheck, lint, `68` Jest tests in `16` suites, `3` Node Web-runner tests, and `162` pgTAP assertions across `7` files.
- Task 9 hardening database: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/008_recurrence.sql` — PASS (`41` pgTAP assertions), covering future-conflict resolution, the exact shared shop lock on every owner series mutation, retained cancellation exceptions, owner-only RPC access, repeated materialization, and the database series/local-date uniqueness guard in addition to the original recurrence cases.
- Task 9 focused client: `npm test -- --runInBand tests/integration/recurrence.test.ts tests/integration/recurrence-concurrency.test.ts` — PASS (`4` tests).
- Task 9 Web E2E: `npm run test:e2e:web` — PASS (`7` Playwright tests), including the mocked owner recurrence/conflict flow.
- Task 9 complete gate: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS: typecheck, lint, `72` Jest tests in `18` suites, `3` Node Web-runner tests, and `203` pgTAP assertions across `8` files.
- Focused Task 10 client: `npm test -- --runInBand tests/integration/notifications.test.ts` — PASS (`2` tests).
- Focused Task 10 database: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/009_notifications.sql` — PASS (`32` pgTAP assertions), covering transactional event triggers, false-cancellation prevention during rescheduling, token registration, bounded retries, inactive tokens, reminders, and recurrence jobs.
- Task 10 complete gate: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS: typecheck, lint, `74` Jest tests in `19` suites, `3` Node Web-runner tests, and `235` pgTAP assertions across `9` files.
- Task 11 seed contract: `npm test -- --runInBand tests/integration/seed-contract.test.ts` — PASS (`2` tests); full RLS audit `010_full_rls.sql` — PASS (`29` pgTAP assertions).
- Task 12 Web E2E: `npm run test:e2e:web` — PASS (`9` Playwright tests); static export: `npm run export:web` — PASS (`42` routes).
- Task 13 clean-state gate: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase db reset --local` followed by `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify` — PASS: `20` Jest suites/`76` tests, `3` Node Web-runner tests, and `264` pgTAP assertions across `10` files.

No Web smoke was run for Task 5 because it changes no route or rendered UI; the availability client is covered at the RPC/query contract boundary.

## Known limitations

- The database exclusion constraint and transaction-scoped daily lock are implemented. A true network-backed two-session race fixture is deferred to release hardening; the current Jest test verifies the client loser contract and pgTAP verifies the database conflict behavior.
- The lifecycle Web E2E mocks Supabase REST because this harness has no provisioned authenticated database fixture. It does not claim real Auth/RLS/database execution; `006_lifecycle.sql` proves RLS and sequential target exclusion, while the Jest mock proves the client concurrent-loser contract. A network-backed two-session concurrent-reschedule race remains release-hardening work.
- Availability intentionally does not resolve conflicting override records beyond the existing all-day and timed-block behavior.
- Owner agenda is a bounded list, not drag/drop or a full calendar. It does not materialize recurrence conflicts; recurrence is Task 9. The manual-booking form deliberately reuses existing customers rather than adding quick customer creation.
- Recurrence materialization currently runs when an owner creates or edits a series; conflicts are deliberately not moved or rebooked automatically. The owner can open a prefilled WhatsApp message and book a replacement manually.
- Notification delivery is asynchronous: deferred appointment/conflict triggers enqueue immutable events, the service-role Edge Function claims at most 100 rows per batch, and failed deliveries retry up to three times with bounded delay. Expo push delivery is not part of the appointment transaction.
- Local migration scheduling only registers `pg_cron` jobs when the extension is available. Deployments without `pg_cron` must invoke `enqueue_notification_reminders()` and `materialize_recurrence_job()` externally.
- EAS preview/store builds were not run locally because they require external credentials and project/store configuration; the repository contains the profiles and static export check.
- The recurrence proof executes repeated window calls plus the database uniqueness guard and pgTAP regression assertions for the exact shared advisory-lock expression used by materialization and every owner series mutation. The harness does not open two real database sessions, so it does not claim a true materialization/mutation race; that fixture remains release-hardening work.
- Existing environment warnings remain: the Node runner emits `MODULE_TYPELESS_PACKAGE_JSON`, and Supabase warns that `[inbucket]` is deprecated in favor of `[local_smtp]`.
