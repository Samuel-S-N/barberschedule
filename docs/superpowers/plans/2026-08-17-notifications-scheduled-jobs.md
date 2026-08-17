# Notifications and Scheduled Jobs Implementation Plan

**Goal:** Add an idempotent notification outbox, Expo token registration, push dispatch, and repeatable reminder/recurrence jobs.

**Architecture:** PostgreSQL owns event creation, idempotency, claiming, retry state, reminders, and scheduling. Deferred triggers observe final appointment state so rescheduling does not emit a false cancellation event. A small service-role Edge Function only delivers claimed payloads.

**Tech Stack:** Supabase PostgreSQL/pgTAP, Supabase Edge Functions, TypeScript, `@supabase/supabase-js`, native `fetch`.

**Spec:** `docs/superpowers/specs/2026-08-17-notifications-scheduled-jobs-design.md`

## Global Constraints

- Never expose a service-role key to Expo.
- Appointment changes remain authoritative in existing RPCs.
- Push delivery is asynchronous and cannot roll back domain writes.
- Repeated jobs and retries must be idempotent.
- No new dependency is needed for Expo push delivery.

## Task 1: Add the notification schema and failing database contract

**Files:**
- Create: `supabase/migrations/0021_notifications.sql`
- Create: `supabase/tests/009_notifications.sql`

- [x] Write pgTAP assertions for event creation, duplicate keys, token replacement, and authorization.
- [x] Run the focused test and confirm it fails because the schema is absent.
- [x] Add token/outbox tables, deferred triggers, token registration RPC, and least-privilege grants.
- [x] Run the focused test and confirm it passes.

## Task 2: Add claim/retry and scheduled database jobs

**Files:**
- Create: `supabase/migrations/0022_notification_jobs.sql`
- Modify: `supabase/tests/009_notifications.sql`

- [x] Add service-role claim/success/failure RPCs with bounded retries.
- [x] Add deterministic reminder insertion and recurrence job functions.
- [x] Schedule the functions through `pg_cron` when the extension exists.
- [x] Verify inactive tokens, retry state, reminder idempotence, and repeated recurrence invocation.

## Task 3: Add the client token API and dispatcher

**Files:**
- Create: `src/features/notifications/api.ts`
- Create: `src/features/notifications/register-token.ts`
- Create: `supabase/functions/dispatch-notifications/index.ts`
- Create: `tests/integration/notifications.test.ts`

- [x] Write failing Jest tests for token registration and send success/failure handling.
- [x] Implement the smallest Supabase token wrapper and Edge Function using native `fetch`.
- [x] Run the focused Jest tests and the full verification gate.

## Task 4: Document the delivered boundary

**Files:**
- Modify: `docs/project-status.md`
- Modify: `docs/testing.md`

- [x] Record Task 10 scope, verification evidence, and remaining Task 11–13 work.
- [x] Run the complete database and client checks.
