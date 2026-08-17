# Decision 008: Appointment lifecycle

Date: 2026-08-13
Status: accepted

## Decision

- `cancel_appointment(appointment_id)` and `reschedule_appointment(appointment_id, new_starts_at)` are security-definer RPCs; direct customer appointment writes remain unavailable.
- A customer may change only their own scheduled or confirmed appointment, and only when `starts_at - clock_timestamp() >= interval '90 minutes'`. The exact 90-minute boundary is allowed. A shop owner may override that cutoff.
- Rescheduling locks the existing row, validates the candidate with the existing availability function, and updates that same row in one transaction. It preserves the immutable service snapshots and appointment identity; any unavailable target raises a stable slot error and leaves the original appointment unchanged.
- Customer booking is a thin authenticated navigation flow under `/book`; it ends at the existing booking RPC. The shared route guard redirects owners away, and the review action requires an active customer record bound to the signed-in customer before it can submit source `customer`.
- Appointment table reads are limited to the matching customer. Anonymous callers have no table grant, other customers receive no rows, and there is deliberately no broad owner read policy until Task 8 defines agenda data and its least-privilege boundary.

## Consequences and limits

- Production uses the database clock. The exact client-facing 90-minute boundary is covered by an injected pure helper; pgTAP covers customer/anonymous RLS, cutoff rejection, owner override, valid reschedule, occupied target rejection, original-row preservation, and sequential competing reschedules to the same target.
- Stable `DomainError` mappings shield screens from PostgreSQL messages. Existing booking fallback behavior remains in the booking domain; lifecycle has its own fallback mapping.
- The Web flow uses deterministic mocked Supabase REST because no provisioned authenticated database fixture exists. It proves UI navigation, owner redirection, customer rescheduling UI, and payload wiring, not real Auth/RLS/database execution. The database target-exclusion test plus the Jest client-loser contract are not a true two-session race; that fixture remains release-hardening work.
- Task 8 will add owner manual booking and agenda. Tasks 9–13 still cover recurrence, notifications, seeds/RLS audit, release hardening, and final regression/handoff.
