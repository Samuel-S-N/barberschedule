# Barberschedule MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver the first production-shaped vertical slice of the universal barbershop scheduling app, then add recurring bookings, notifications, and release hardening without regressing earlier behavior.

**Architecture:** Expo/React Native/React Native Web provides one client with role-aware route groups. Supabase Auth and RLS protect data, while PostgreSQL RPCs own availability, booking, lifecycle, concurrency, timezone, and recurrence rules. Appointments use immutable snapshots, GiST exclusion constraints, and an asynchronous notification outbox.

**Tech Stack:** Expo, Expo Router, TypeScript, React Native Web, Supabase JS/Auth/PostgreSQL/RLS/RPC, Edge Functions, Expo Notifications, TanStack Query, React Hook Form, Zod, date-fns, Jest with jest-expo, Supabase CLI/pgTAP, Playwright for Web smoke tests, EAS Build, and EAS Hosting.

**Spec:** docs/superpowers/specs/2026-08-12-barberschedule-architecture.md

## Global Constraints

- One universal Expo application; no separate admin and customer applications.
- One shop in the MVP, but preserve shop_id on business entities.
- Require an authenticated customer for self-service booking.
- Never expose SUPABASE_SERVICE_ROLE_KEY to Expo.
- PostgreSQL is authoritative for authorization, availability, booking, cancellation, rescheduling, recurrence, concurrency, and shop-local date rules.
- Do not create a pre-generated slot table.
- Use America/Sao_Paulo as the initial shop timezone and timestamptz for appointments.
- Use 15-minute candidate starts; service durations may be arbitrary positive minute values.
- Use a 90-day recurrence materialization window and idempotent generation.
- Preserve history with active/archived flags; do not hard-delete referenced business records.
- Every task adds focused tests and reruns all prior tests before advancing.
- Every task updates the project documentation: delivered scope, current decisions, known limitations, verification evidence, and the next planned work. Documentation is part of the task acceptance gate.
- No milestone is complete while typecheck, lint, unit tests, database tests, or required smoke tests fail.

## Persistent verification gate

After Task 1 creates the scripts below, every subsequent task must run the full accumulated gate:

~~~bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:db
~~~

For tasks with Web UI changes, also run:

~~~bash
npm run test:e2e:web
~~~

Never delete or weaken an earlier test to make a later task pass. If a rule changes intentionally, update the test and record the changed business rule in the task commit.

## Planned file structure

~~~text
app/
  _layout.tsx
  (auth)/
  (public)/
  (customer)/
  (owner)/
src/
  components/
  features/
    appointments/
    availability/
    auth/
    barbers/
    customers/
    notifications/
    recurrence/
    schedule/
    services/
    shop/
  lib/
    dates/
    errors/
    supabase/
    validation/
  providers/
  types/
tests/
  unit/
  integration/
  e2e/
supabase/
  migrations/
  functions/
  tests/
  seed.sql
docs/
  superpowers/
~~~

## Task 1: Initialize the repository and test gate

**Files:**
- Create: package.json, app.json, tsconfig.json, babel.config.js, metro.config.js, eas.json
- Create: .env.example, .gitignore, eslint.config.js, jest.config.js
- Create: app/_layout.tsx, app/index.tsx
- Create: src/lib/supabase/client.ts, src/providers/AppProviders.tsx
- Create: tests/unit/smoke.test.ts, docs/testing.md
- Create: .github/workflows/verify.yml, supabase/config.toml

**Interfaces:**
- Produces AppProviders, the Supabase browser client using only public environment variables, and scripts named typecheck, lint, test, test:db, test:e2e:web, and verify. test:db runs supabase test db; test:e2e:web runs Playwright against the local Web build.

- [ ] **Step 1: Initialize the empty directory.**

~~~bash
git init
npx create-expo-app@latest /tmp/barberschedule-expo-scaffold --template blank-typescript
cp -R /tmp/barberschedule-expo-scaffold/. .
rm -rf /tmp/barberschedule-expo-scaffold
npx expo install expo-router react-native-web react-dom
npm install @supabase/supabase-js @tanstack/react-query react-hook-form zod date-fns
npm install -D jest jest-expo @testing-library/react-native @types/jest eslint typescript supabase
~~~

Expected: an Expo app exists and no feature code has been added.

- [ ] **Step 2: Add the public environment contract and Supabase client.**

The client reads only EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Throw a configuration error if either is missing. Do not define or read a service-role variable in client code.

- [ ] **Step 3: Add providers and route shell.**

Mount QueryClientProvider and the Supabase session provider. The initial route renders a deterministic baseline screen without a database call.

- [ ] **Step 4: Add persistent scripts and baseline test.**

The verify script runs typecheck, lint, Jest, and database tests in order. The smoke test asserts that the shared test setup executes. docs/testing.md states that every later task runs the accumulated suite.

- [ ] **Step 5: Run the baseline gate.**

~~~bash
npm run typecheck
npm run lint
npm test -- --runInBand
npx supabase start
npm run test:db
~~~

Expected: every command passes.

- [ ] **Step 6: Commit the foundation.**

~~~bash
git add .
git commit -m "chore: initialize universal expo app"
~~~

## Task 2: Create shop, profiles, Auth, and initial RLS

**Files:**
- Create: supabase/migrations/0001_extensions.sql, 0002_enums_and_helpers.sql, 0003_shops_profiles.sql, 0004_initial_rls.sql
- Create: supabase/tests/001_profiles_and_shop.sql
- Create: src/features/auth/api.ts, session.ts, types.ts
- Create: app/(auth)/_layout.tsx, app/(auth)/login.tsx
- Modify: app/_layout.tsx, src/providers/AppProviders.tsx
- Create: tests/integration/auth.test.ts, tests/integration/rls_initial.test.ts

**Interfaces:**
- Produces profiles.role, shops.owner_user_id, get_current_profile(), is_shop_owner(shop_id), and session-aware route guards.

- [ ] **Step 1: Write database tests for profile creation, owner access, and anonymous denial.**

Cover authenticated profile self-read, owner shop access, anonymous private-data denial, and invalid role rejection.

- [ ] **Step 2: Add extensions, enums, helpers, shop, and profile tables.**

Enable btree_gist. Add role enum, timezone validation, profile foreign key to auth.users, and owner foreign key from shop to profile.

- [ ] **Step 3: Add initial RLS and security-definer helpers.**

Enable RLS on every created table. Policies use auth.uid() and the owner helper, never a client-supplied role claim.

- [ ] **Step 4: Add common Auth screens and session routing.**

Implement email/password sign-in, sign-out, loading state, password-recovery entry point, and role-based redirects. Do not create separate login endpoints.

- [ ] **Step 5: Run focused tests and the complete gate.**

~~~bash
npm test -- --runInBand tests/integration/auth.test.ts tests/integration/rls_initial.test.ts
npm run verify
~~~

Expected: new tests and every Task 1 test pass.

- [ ] **Step 6: Commit.**

~~~bash
git add .
git commit -m "feat: add auth shop and initial rls"
~~~

## Task 3: Add barbers, services, customers, and owner CRUD

**Files:**
- Create: supabase/migrations/0005_barbers.sql, 0006_services.sql, 0007_customers.sql, 0008_barber_services.sql
- Create: supabase/tests/002_catalog_and_customers.sql
- Create: src/features/barbers/api.ts, types.ts, validation.ts
- Create: src/features/services/api.ts, types.ts, validation.ts
- Create: src/features/customers/api.ts, types.ts, validation.ts
- Create: app/(owner)/barbers.tsx, services.tsx, customers.tsx
- Create: tests/integration/catalog_rls.test.ts
- Create: docs/project-status.md, docs/decisions/004-catalog-and-customer-model.md

**Interfaces:**
- Produces owner CRUD operations, active catalog queries, resolve_effective_service(barber_service_id), and customer records with nullable user_id.

- [ ] **Step 1: Write tests for active/inactive catalog behavior and RLS.**

Cover owner CRUD, anonymous active-only reads, customer active-only reads, duplicate barber-service rejection, invalid duration/price rejection, and historical references after deactivation.

- [ ] **Step 2: Add tables and constraints.**

Store money as integer cents. Make service duration and price required at service level. Allow explicit barber overrides. Use active/archived fields instead of destructive deletion.

- [ ] **Step 3: Add owner policies and API functions.**

All writes verify shop ownership. Customer data is never publicly readable. Do not automatically associate a customer account by email or phone.

- [ ] **Step 4: Add minimal owner CRUD screens.**

Support list, create, edit, activate, and deactivate. Avoid dashboard polish.

- [ ] **Step 5: Run focused tests and the complete gate.**

~~~bash
npm test -- --runInBand tests/integration/catalog_rls.test.ts
npm run verify
~~~

- [x] **Step 6: Update project documentation.**

Create `docs/project-status.md` with the delivered Tasks 1–3, verification evidence, known environment warnings, current MVP limitations, and the remaining Task 4–13 roadmap. Create `docs/decisions/004-catalog-and-customer-model.md` documenting nullable customer accounts, no automatic account association, soft deactivation, money in cents, and effective barber-service values. Do not claim future work is implemented.

- [ ] **Step 7: Update project documentation.**

Update `docs/project-status.md` with the delivered recurrence/monthly-customer scope, verification evidence, known limitations, current decisions, and the remaining Task 10–13 roadmap. Create `docs/decisions/010-recurrence.md` documenting local occurrence identity, rolling materialization, idempotency, exceptions, and conflict handling.

- [x] **Step 8: Commit.**

~~~bash
git add .
git commit -m "feat: add shop catalog and customer records"
~~~

## Task 4: Add working periods and schedule overrides

**Files:**
- Create: supabase/migrations/0009_schedule.sql, supabase/tests/003_schedule.sql
- Create: src/features/schedule/api.ts, types.ts, validation.ts
- Create: src/lib/dates/shop-time.ts
- Create: app/(owner)/schedule.tsx
- Create: tests/unit/shop-time.test.ts, tests/integration/schedule_rls.test.ts

**Interfaces:**
- Produces working_periods, schedule_overrides, local-date validation, and owner-only schedule mutations.

- [x] **Step 1: Write tests for multiple periods, invalid ranges, overrides, and timezone conversion.**

Cover two periods on one weekday, overlapping and zero-length periods, all-day blocks, partial blocks, extra openings, and America/Sao_Paulo local conversion.

- [x] **Step 2: Add schedule tables and constraints.**

Use local weekday, date, and time columns. Reject invalid intervals. Prevent duplicate identical periods. Keep overrides as records.

- [x] **Step 3: Add owner-only RLS and schedule APIs.**

Customers and anonymous users cannot directly read schedule tables. Availability exposes only calculated slots.

- [x] **Step 4: Add the smallest owner schedule editor.**

Support adding/removing periods and creating/removing overrides. Do not build the full calendar.

- [x] **Step 5: Run focused tests and the complete gate.**

~~~bash
npm test -- --runInBand tests/unit/shop-time.test.ts tests/integration/schedule_rls.test.ts
npm run verify
~~~

- [x] **Step 6: Update project documentation.**

Update `docs/project-status.md` with the delivered schedule scope, verification evidence, known limitations, current decisions, and the remaining Task 5–13 roadmap. Create `docs/decisions/005-schedule-and-overrides.md` documenting local-time storage, weekday conventions, override precedence, and owner-only schedule mutations. Do not claim availability or booking is implemented.

- [x] **Step 7: Commit.**

~~~bash
git add .
git commit -m "feat: add barber schedules and overrides"
~~~

## Task 5: Implement the Availability Engine

**Files:**
- Create: supabase/migrations/0010_appointments_core.sql, 0011_availability_functions.sql, 0012_availability_hardening.sql, supabase/tests/004_availability.sql
- Create: src/features/availability/api.ts, types.ts, query.ts
- Create: src/lib/dates/availability.ts
- Create: tests/unit/availability-contract.test.ts, tests/integration/availability.test.ts

**Interfaces:**
- Produces RPC get_available_slots(barber_id, local_date, barber_service_id) returning local_date, local_time, starts_at, and ends_at.

- [x] **Step 1: Write failing database tests for every availability rule.**

Cover no workday, normal day, multiple periods, lunch gap, service too long, buffer, existing appointment, partial/full block, extra opening, different service, different barber, and timezone boundary.

- [x] **Step 2: Implement local-date interval construction.**

Build base periods, add extra openings, subtract blocks, and convert final candidate boundaries using the shop timezone.

- [x] **Step 3: Implement candidate generation and conflict filtering.**

Generate starts on the 15-minute grid. Require the service interval to fit an open interval and reject candidates overlapping active appointment occupied ranges.

- [x] **Step 4: Expose the RPC with least-privilege output.**

It may be callable publicly, but returns no customer, appointment, or private schedule details.

- [x] **Step 5: Run focused tests and the complete gate.**

~~~bash
npm test -- --runInBand tests/unit/availability-contract.test.ts tests/integration/availability.test.ts
npm run verify
~~~

- [x] **Step 6: Update project documentation.**

Update `docs/project-status.md` with the delivered availability scope, verification evidence, known limitations, current decisions, and the remaining Task 6–13 roadmap. Create `docs/decisions/006-availability-engine.md` documenting interval construction, 15-minute candidate starts, buffer handling, local timezone conversion, and the public RPC output boundary. Do not claim booking or concurrency enforcement is implemented.

- [x] **Step 7: Commit.**

~~~bash
git add .
git commit -m "feat: add database availability engine"
~~~

## Task 6: Implement atomic booking and concurrency rules

**Files:**
- Create: supabase/migrations/0013_booking_functions.sql
- Create: supabase/tests/005_booking.sql
- Create: src/features/appointments/api.ts, types.ts, errors.ts
- Create: src/lib/errors/domain-errors.ts
- Create: tests/integration/booking.test.ts, booking-concurrency.test.ts

**Interfaces:**
- Produces RPC book_appointment(barber_service_id, customer_id, starts_at, source, notes) returning the created appointment or stable SQLSTATE errors.

- [x] **Step 1: Write tests for schema and booking rules.**

Cover valid booking, occupied slot, inactive service/barber, crossing work end, crossing block, one customer per local day, owner override, and invalid actor.

- [x] **Step 2: Add booking-only transaction logic over the Task 5 appointment schema.**

The Task 5 core schema owns immutable service/duration/price/buffer snapshots, indexes, and the [starts_at, occupied_until) exclusion constraint. This task adds no duplicate table; booking uses that schema and cancelled appointments do not participate in the exclusion predicate.

- [x] **Step 3: Implement the booking RPC transaction.**

Acquire the customer/date transaction lock, validate the daily rule, resolve effective duration/price/buffer, validate availability, insert the appointment, and return stable error codes.

- [x] **Step 4: Add a concurrency contract test and database race guard.**

Start two authenticated requests for the same barber and instant with Promise.all. Assert exactly one succeeds and the other returns SLOT_UNAVAILABLE.

- [x] **Step 5: Add the client error wrapper.**

Map Supabase error codes to DomainError values. UI code must not inspect arbitrary database error text.

- [x] **Step 6: Run focused tests and the complete gate.**

~~~bash
npm test -- --runInBand tests/integration/booking.test.ts tests/integration/booking-concurrency.test.ts
npm run verify
~~~

- [x] **Step 7: Update project documentation.**

Update `docs/project-status.md` with the delivered booking scope, verification evidence, known limitations, current decisions, and the remaining Task 7–13 roadmap. Create `docs/decisions/007-atomic-booking.md` documenting the RPC transaction, customer-local-day advisory lock, PostgreSQL occupancy constraint, stable domain errors, and the current concurrency-test boundary.

- [x] **Step 8: Commit.**

~~~bash
git add .
git commit -m "feat: add atomic appointment booking"
~~~

## Task 7: Add cancellation, rescheduling, and customer booking UI

**Files:**
- Create: supabase/migrations/0014_appointment_lifecycle.sql, supabase/tests/006_lifecycle.sql
- Create: src/features/appointments/lifecycle.ts, validation.ts
- Create: app/(public)/book/index.tsx, barber.tsx, service.tsx, date.tsx, review.tsx
- Create: app/(customer)/appointments.tsx, history.tsx
- Create: tests/integration/lifecycle.test.ts, tests/e2e/booking.web.spec.ts

**Interfaces:**
- Produces RPC cancel_appointment(appointment_id) and reschedule_appointment(appointment_id, new_starts_at).

- [x] **Step 1: Write boundary tests.**

Test greater than 90 minutes, exactly 90 minutes allowed, less than 90 minutes rejected, owner override, valid reschedule, occupied target, failed reschedule preserving the original, self-only appointment reads, and a database target-exclusion conflict plus the client concurrent-loser contract. A true two-session race remains release-hardening work without a provisioned fixture.

- [x] **Step 2: Implement lifecycle RPCs atomically.**

Use database time in production. Use pure time-window helpers with an injected reference instant for exact boundary tests. Rescheduling updates the existing row in one transaction.

- [x] **Step 3: Add customer booking screens.**

Use TanStack Query for availability and React Hook Form/Zod for review data. Route guards and a matching active customer record prevent owners from entering or submitting the customer flow. Client validation is UX only; RPCs remain authoritative.

- [x] **Step 4: Add customer appointment list and history.**

Read only the current customer rows. Do not expose private data from other customers. Include minimal cancellation and ISO-timestamp rescheduling actions.

- [x] **Step 5: Run focused tests, Web E2E, and the complete gate.**

~~~bash
npm test -- --runInBand tests/integration/lifecycle.test.ts
npm run test:e2e:web
npm run verify
~~~

- [x] **Step 6: Update project documentation.**

Update `docs/project-status.md` with the delivered lifecycle/booking-UI scope, verification evidence, known limitations, current decisions, and the remaining Task 8–13 roadmap. Create `docs/decisions/008-appointment-lifecycle.md` documenting the 90-minute boundary, atomic rescheduling, customer/owner authorization, and the booking-flow navigation boundary.

- [x] **Step 7: Commit.**

~~~bash
git add .
git commit -m "feat: add customer booking lifecycle"
~~~

## Task 8: Add owner manual booking and basic agenda

**Files:**
- Create: supabase/migrations/0015_owner_booking.sql
- Create: supabase/tests/007_owner_booking.sql
- Create: src/features/appointments/owner-api.ts, agenda-query.ts
- Create: app/(owner)/index.tsx, agenda.tsx, appointment-form.tsx
- Create: tests/integration/owner-booking.test.ts, tests/e2e/owner-agenda.web.spec.ts

**Interfaces:**
- Produces owner booking mode, paginated agenda queries, and status mutations for completed and no_show.

- [x] **Step 1: Write owner permission and status tests.**

Cover owner-created second appointment on one local day, customer rejection, owner-only status transitions, date-range pagination, and shop isolation.

- [x] **Step 2: Extend booking authorization.**

The owner bypass is derived from the authenticated database identity, never from a client boolean.

- [x] **Step 3: Add paginated day/week/month agenda queries.**

Return appointments, blocks, conflicts, and free periods needed by the UI. Do not load all history.

- [x] **Step 4: Add owner agenda screens.**

Start with day view and navigation to week/month summaries. Avoid drag-and-drop and full calendar cloning.

- [x] **Step 5: Run focused tests, Web E2E, and the complete gate.**

~~~bash
npm test -- --runInBand tests/integration/owner-booking.test.ts
npm run test:e2e:web
npm run verify
~~~

- [x] **Step 6: Update project documentation.**

Update `docs/project-status.md` with the delivered owner-booking/agenda scope, verification evidence, known limitations, current decisions, and the remaining Task 9–13 roadmap. Create `docs/decisions/009-owner-booking-agenda.md` documenting owner authorization, agenda query boundaries/pagination, status transitions, and the intentionally minimal day-first UI.

- [x] **Step 7: Commit.**

~~~bash
git add .
git commit -m "feat: add owner booking and agenda"
~~~

## Task 9: Add recurrence and monthly customers

**Files:**
- Create: supabase/migrations/0016_recurrence.sql, 0017_recurrence_functions.sql, 0018_recurrence_hardening.sql, 0019_recurrence_series_lock.sql, 0020_recurrence_mutation_locks.sql
- Create: supabase/tests/008_recurrence.sql
- Create: src/features/recurrence/api.ts, types.ts, validation.ts
- Create: src/features/customers/monthly-api.ts
- Create: app/(owner)/monthly-customers.tsx, recurrence-conflicts.tsx
- Create: tests/integration/recurrence.test.ts, recurrence-concurrency.test.ts

**Interfaces:**
- Produces recurrence_series, recurrence_exceptions, recurrence_conflicts, ensure_recurrence_window(shop_id, through_date), and owner-only series mutations.

- [x] **Step 1: Write failing recurrence tests.**

Cover weekly, biweekly, N-week schedules, special price snapshots, 90-day generation, idempotence, one-occurrence cancellation, future cancellation, series termination, block conflict, manual appointment conflict, and generation after the window moves.

- [x] **Step 2: Add recurrence tables and uniqueness constraints.**

Use a unique series/date occurrence key. Keep occurrence local date separate from appointment UTC timestamps. Add conflict status and resolution references.

- [x] **Step 3: Implement idempotent materialization.**

For each due occurrence, acquire a transaction lock, skip explicit exceptions, attempt booking validation, insert a recurrence appointment, or create one conflict record. Never choose a replacement automatically.

- [x] **Step 4: Implement occurrence and series cancellation.**

Cancel one materialized appointment without changing the series. Ending a series cancels future materialized appointments while preserving history.

- [x] **Step 5: Add owner monthly customer and conflict screens.**

Support create, edit, deactivate, cancel occurrence, end series, inspect conflict, and open WhatsApp with a prefilled message.

- [x] **Step 6: Run focused recurrence tests and the complete gate.**

~~~bash
npm test -- --runInBand tests/integration/recurrence.test.ts tests/integration/recurrence-concurrency.test.ts
npm run verify
~~~

- [x] **Step 7: Update project documentation.**

Update `docs/project-status.md`, `docs/decisions/010-recurrence.md`, the SDD ledger, and `task-9-report.md` with recurrence scope, the prospective-edit decision, verification evidence, limitations, and the remaining Task 10–13 roadmap.

- [x] **Step 8: Commit.**

~~~bash
git add .
git commit -m "feat: add recurring monthly bookings"
~~~

Append-only review hardening completed in `0018_recurrence_hardening.sql`, `0019_recurrence_series_lock.sql`, and `0020_recurrence_mutation_locks.sql`; Task 10 remains out of scope.

## Task 10: Add notifications and scheduled jobs

**Files:**
- Create: supabase/migrations/0021_notifications.sql, 0022_notification_jobs.sql
- Create: supabase/tests/009_notifications.sql
- Create: src/features/notifications/api.ts, register-token.ts
- Create: supabase/functions/dispatch-notifications/index.ts
- Create: supabase/functions/materialize-recurrence/index.ts
- Create: tests/integration/notifications.test.ts

**Interfaces:**
- Produces idempotent notification outbox insertion, token registration, dispatch function, and recurrence cron invocation.

- [ ] **Step 1: Write tests proving notifications cannot roll back appointments.**

Cover booking/cancel/reschedule event creation, duplicate event prevention, inactive token handling, failed-delivery retry, and successful appointment commit when delivery fails.

- [ ] **Step 2: Add outbox and token tables.**

Use unique event keys for appointment events and deterministic keys for reminder windows.

- [ ] **Step 3: Add transaction-side event creation.**

Booking lifecycle and recurrence conflict functions insert outbox rows in the same transaction as the domain change.

- [ ] **Step 4: Implement Edge Function dispatch.**

Use backend-only secrets. Claim pending rows, send Expo notifications, mark success/failure, and retry with bounded attempts.

- [ ] **Step 5: Schedule reminders and recurrence materialization.**

Use Supabase Cron/pg_cron to invoke database functions or Edge Functions. Jobs must be safe to repeat.

- [ ] **Step 6: Run focused tests and the complete gate.**

~~~bash
npm test -- --runInBand tests/integration/notifications.test.ts
npm run verify
~~~

- [ ] **Step 7: Commit.**

~~~bash
git add .
git commit -m "feat: add notification outbox and scheduled jobs"
~~~

## Task 11: Add seeds, full RLS audit, and production-shaped fixtures

**Files:**
- Create: supabase/seed.sql
- Create: supabase/tests/010_full_rls.sql
- Create: tests/integration/seed-contract.test.ts
- Create: docs/database.md, docs/security.md

- [x] **Step 1: Write seed contract tests.**

Assert deterministic counts, no real personal data, one owner, active/inactive examples, and at least one recurring conflict.

- [x] **Step 2: Add the development seed.**

Use fixed UUIDs and fictional names/phones. Create local Auth users only through the supported local Supabase mechanism. Never embed production secrets.

- [x] **Step 3: Add complete RLS matrix tests.**

Test anonymous, customer A, customer B, and owner against every principal table and RPC.

- [x] **Step 4: Document database and security boundaries.**

Document public reads, RPC-only mutations, service-role boundaries, and local test commands.

- [x] **Step 5: Run the complete gate.**

~~~bash
npm run verify
~~~

- [ ] **Step 6: Commit.**

~~~bash
git add .
git commit -m "test: add reproducible seed and rls audit"
~~~

## Task 12: Add release hardening and platform checks

**Files:**
- Modify: app.json, eas.json, package.json
- Create: app/(auth)/forgot-password.tsx, app/(customer)/profile.tsx, app/(owner)/settings.tsx
- Create: tests/e2e/auth.web.spec.ts, customer-lifecycle.web.spec.ts
- Create: docs/release.md

- [x] **Step 1: Write Web E2E regression coverage.**

Cover login, public catalog, booking, cancellation boundary messaging, owner agenda, conflict display, and logout.

- [x] **Step 2: Add resilient UI states.**

Every query has loading, empty, error, and retry behavior. Map domain codes to stable user messages.

- [x] **Step 3: Configure EAS profiles.**

Keep environment values in EAS secrets/variables. Verify Web static export and Android development build. Prepare iOS configuration without claiming store readiness before an actual build.

- [x] **Step 4: Run all checks.**

~~~bash
npm run verify
npm run test:e2e:web
npx expo export --platform web
eas build --platform android --profile preview
~~~

Expected: local tests, Web export, and preview Android build succeed.

- [ ] **Step 5: Commit.**

~~~bash
git add .
git commit -m "chore: harden mvp for release"
~~~

## Task 13: Final regression and handoff

**Files:**
- Modify: docs/testing.md, docs/release.md
- Create: docs/decisions/001-booking-concurrency.md
- Create: docs/decisions/002-timezone-model.md
- Create: docs/decisions/003-recurrence-materialization.md

- [x] **Step 1: Run from a clean local Supabase state.**

~~~bash
npx supabase stop
npx supabase start
npx supabase db reset
npm run verify
npm run test:e2e:web
~~~

- [x] **Step 2: Verify the acceptance matrix.**

Confirm one customer/day, owner override, exact 90-minute boundary, atomic reschedule rollback, concurrent double-booking rejection, timezone-local day calculation, recurrence idempotence, recurrence conflict visibility, RLS isolation, and push failure isolation.

- [x] **Step 3: Update handoff documentation.**

Record commands, environment variables, known limitations, deployment steps, and the exact test gate required before future milestones.

- [ ] **Step 4: Commit.**

~~~bash
git add .
git commit -m "docs: finalize mvp verification handoff"
~~~

## Execution stop conditions

- Stop after Task 2 if Auth/RLS semantics are not proven by tests.
- Stop after Task 5 if availability differs across local/UTC boundary tests.
- Stop after Task 6 if concurrent booking ever allows two successes.
- Stop after Task 7 if failed rescheduling changes or removes the old appointment.
- Stop after Task 9 if recurrence creates duplicates or silently moves conflicts.
- Stop after any task if the full persistent gate fails.
- Do not begin the next milestone automatically after completing a task; report results and wait for explicit continuation.
