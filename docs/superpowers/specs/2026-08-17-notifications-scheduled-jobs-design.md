# Notifications and Scheduled Jobs Design

## Goal

Add reliable, asynchronous appointment notifications and repeatable recurrence/reminder jobs without making push delivery part of an appointment transaction.

## Design

- `notification_tokens` stores one Expo token per device, bound to the authenticated user and deactivated by the dispatcher when Expo rejects it.
- `notification_outbox` stores immutable event payloads with a unique event key, retry state, and recipient user. Inserts happen through deferred appointment/conflict triggers, so booking, cancellation, rescheduling, and recurrence conflicts commit atomically with their event.
- A service-role-only claim RPC uses `FOR UPDATE SKIP LOCKED`; the Edge Function sends Expo pushes, then marks each row sent or failed. Delivery errors never reach the appointment transaction.
- A repeatable database function creates deterministic 24-hour reminder events and invokes recurrence materialization. `pg_cron` schedules both functions when available in the Supabase database.

## Non-goals

Email, SMS, notification preferences, automatic conflict rebooking, push history UI, and provider abstraction remain out of scope.

## Verification

pgTAP covers transactional event creation, unique keys, token replacement, retry claiming, inactive-token handling, reminder idempotence, and recurrence-job repeatability. Jest covers the token API and dispatcher response handling.
