# Decision 010: Recurrence and monthly customers

Date: 2026-08-13
Status: accepted

## Decision

- A series stores a shop-local anchor date/time and positive `interval_weeks`; `1`, `2`, and every other positive number cover weekly, biweekly, and N-week schedules.
- `ensure_recurrence_window(shop_id, through_date)` is owner-only, locks one shop transactionally, accepts no date farther than 90 local days ahead, and creates ordinary `source = recurrence` appointments through the existing booking/availability/exclusion path.
- Each occurrence has a local `date` attached to the UTC appointment and is unique per series/date. The materializer and every owner series mutation—edit, activation change, occurrence cancellation, and series end—use the same per-shop transaction advisory lock; repeated calls and the database uniqueness constraint cannot create a duplicate, and those mutations cannot interleave with materialization for that shop.
- An owner special price is optional and is inserted into the immutable appointment price snapshot only for its recurrence occurrence.
- Cancelling one occurrence writes an explicit exception and cancels that appointment if it exists; it does not end the series. Ending a series deactivates it, cancels future materialized appointments, and resolves still-open future conflicts, preserving every row and conflict as history.
- Editing a series is prospective: all materialized occurrences, including future ones, retain their prior local time and snapshots. Only dates materialized after the edit use the new rule.
- Unavailable occurrences create one open conflict at the requested local date/time. The system never selects a replacement; the owner can inspect the conflict and open a prefilled WhatsApp message.

## Consequences and limits

- Recurrence tables have no direct client grants. All reads and mutations use narrowly scoped owner security-definer functions and enforce the shop server-side.
- The public five-argument `book_appointment` contract remains intact. Its shared internal path is also used by materialization so availability, customer state, snapshots, and the GiST occupancy constraint keep one owner.
- The current owner screen invokes materialization after creating or editing a series. Task 10 remains responsible for automatic scheduling, push/outbox delivery, and any Edge Function.
- A conflict is a durable record rather than an automatic retry queue. Rebooking a replacement remains an intentional owner action after contacting the customer.
- The persistent test proof is repeated materialization, the series/date uniqueness rejection, cancellation's durable exception, and pgTAP regression assertions for the shared lock expression in every owner series mutation. It does not claim a real two-session database race because the harness does not open two database sessions; that network-backed fixture remains release-hardening work.
