# Decision 007: Atomic booking

Date: 2026-08-13
Status: accepted

## Decision

- Booking is a single `book_appointment` security-definer RPC. It validates actor, active catalog records, local shop date, availability, and insertion in one transaction.
- Customer self-service uses `customer_user_id = auth.uid()`. Owner sources may create appointments for any active customer and bypass only the one-appointment-per-local-day rule.
- The daily customer rule uses the shop timezone and a transaction-scoped advisory lock keyed by shop, customer, and local date.
- Barber occupancy remains protected by the PostgreSQL GiST exclusion constraint over `[starts_at, occupied_until)`. Its `scheduled`/`confirmed` predicate is the final race-safe guard, including owner bookings.
- Stable `DomainError` codes are mapped in the client; UI code does not interpret raw PostgreSQL text.

## Consequences and limits

- A failed booking does not create or remove an appointment. The current RPC returns the created row needed by the caller.
- Appointment snapshots are immutable and service/barber identity is checked by the schema hardening migration.
- The persistent database suite proves daily-limit, availability, ownership, inactive-resource, exclusion, and owner-override behavior. The Jest concurrency test proves the client loser contract; a network-backed two-session race fixture remains a release-hardening improvement because the local E2E harness has no provisioned authenticated database fixture.
- Cancellation, rescheduling, customer booking screens, and owner agenda remain future tasks.
