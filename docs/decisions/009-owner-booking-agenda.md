# Decision 009: Owner booking and agenda

Date: 2026-08-13
Status: accepted

## Decision

- Manual owner bookings call the existing `book_appointment` security-definer RPC with source `owner`. The RPC derives authority from `auth.uid()` and `is_shop_owner`; no client flag grants permission.
- `list_owner_agenda(shop_id, local_start, local_end, limit, offset)` and `list_owner_agenda_overrides(shop_id, local_start, local_end)` are owner-only security-definer RPCs. Ranges are limited to 32 local dates, appointment rows are paginated, and no unbounded appointment history is loaded.
- Owner agenda output is scoped to one owned shop and contains its appointment snapshots plus customer/barber names and schedule overrides in the selected date range. Customer, anonymous, and other-shop callers are rejected; no broad owner table-read policy was added.
- `set_owner_appointment_status(appointment_id, new_status)` permits only scheduled/confirmed → completed/no_show. It is owner-only, has stable error codes, and updates the existing appointment row so completed/no-show history remains visible.
- The owner UI starts with a list-based day view, bounded week/month ranges, range/page navigation, status actions, and an availability-backed manual booking form. It intentionally omits drag/drop, a full calendar, recurrence conflicts, and quick customer creation.

## Consequences and limits

- Availability, occupancy, schedule checks, immutable snapshots, and the owner daily-limit exception remain owned by `book_appointment`; Task 8 creates no appointment table or parallel booking logic.
- The form selects an active existing customer and barber-service, then asks the existing availability RPC for valid local-date times. Quick customer creation is deferred because the owner customer screen already covers that lifecycle and embedding it would add a second workflow.
- pgTAP verifies same-day owner booking, customer rejection, owner-only agenda/status access, range pagination, shop isolation, schedule-block output, allowed transitions, and completed/no-show history. The deterministic Web E2E proves client navigation/payload wiring, not live Auth/RLS.
- Task 9 adds recurrence and conflict handling; Tasks 10–13 cover notifications, seed/RLS audit, release hardening, and final regression/handoff.
