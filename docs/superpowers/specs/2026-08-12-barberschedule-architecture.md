# Barberschedule Architecture Specification

**Status:** approved for planning; implementation not started.

## Goal

Build one Expo/React Native application for Android, iOS, and responsive Web. The application serves customers and the shop owner through one authenticated product. Supabase/PostgreSQL is authoritative for authorization, availability, booking, concurrency, timezone rules, and recurring appointments.

## Scope

MVP includes one shop, owner and customer roles, barbers without required logins, services, barber-specific service variations, weekly working periods, date overrides, availability, customer and owner booking, cancellation, rescheduling, owner agenda, recurring customers, recurrence conflicts, push notifications, and RLS. Payments, staff logins, multi-shop SaaS, official WhatsApp integration, and automatic no-show policies are excluded.

## Decisions

- Use Expo, Expo Router, TypeScript, React Native Web, Supabase Auth, PostgreSQL, RLS, Database Functions/RPC, Edge Functions, Expo Notifications, EAS Build, and EAS Hosting.
- Keep `profiles.role` as `owner | customer` for the single-shop MVP. `barbers.user_id` is nullable because a barber is a business resource, not a permission role.
- Require an authenticated customer account for self-service booking. Owner-created customers may have no account. Do not automatically associate an account by email or phone.
- Store shop timezone as an IANA name, initially `America/Sao_Paulo`. Store appointments as `timestamptz`; store schedule and recurrence inputs as local `date`/`time` values.
- Use 15-minute candidate starts. Service durations need not be multiples of 15 minutes.
- Store `ends_at` as service end and `occupied_until` as service end plus the barber buffer snapshot.
- Calculate availability from working periods, extra openings, blocks, materialized appointments, service duration, buffer, and timezone. Do not pre-generate slots.
- Protect barber overlap with a PostgreSQL GiST exclusion constraint over `[starts_at, occupied_until)`. Protect the customer daily limit with a transaction advisory lock keyed by shop/customer/local date.
- Perform booking and rescheduling through atomic RPCs. The owner may bypass the daily customer limit, but never the barber overlap constraint.
- Materialize recurrence only through a rolling 90-day window. Use `interval_weeks`, not RRULE. Use unique series/date keys, transaction locks, and explicit conflict records.
- Use a notification outbox. Push delivery is asynchronous and never rolls back a valid appointment.
- Prefer additive migrations, soft deactivation, immutable appointment snapshots, and stable SQLSTATE error codes.

## Security

The Expo app may contain only the Supabase publishable/anon key. The service-role key is backend-only. Anonymous users may read public shop/catalog data and request public availability; booking and private data require authentication. Customers read their own records. Owners access shop records through narrowly scoped RLS policies and security-definer helper functions with a fixed search path. Direct customer writes to appointment state are disabled; customer mutations use RPCs.

## Test contract

Every implementation task adds focused tests and reruns the complete accumulated suite before it is considered complete. The persistent gate is:

```text
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:db
```

The database suite covers availability, booking, concurrency, lifecycle, recurrence, timezone, and RLS. Tests use deterministic fixtures and pure time-boundary helpers where exact clock control is required. CI runs the same gate after the repository is initialized.

## Explicit boundary

No code, migration, seed, or infrastructure artifact was implemented while this specification was drafted. The next approved action is execution of the implementation plan.
