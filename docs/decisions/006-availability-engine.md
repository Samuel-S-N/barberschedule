# Decision 006: Availability engine

Date: 2026-08-13
Status: accepted

## Decision

- Create `0010_appointments_core.sql` before `0011_availability_functions.sql`, with `0012_availability_hardening.sql` adding cross-identity and snapshot invariants. Availability must filter the same occupied ranges that future booking writes.
- Store appointments as UTC `timestamptz` values with `starts_at`, service `ends_at`, and `occupied_until`. `occupied_until` includes the barber buffer snapshot.
- Protect scheduled and confirmed barber occupancy with a PostgreSQL GiST exclusion constraint over `[starts_at, occupied_until)`. Cancelled appointments do not participate.
- Calculate availability in PostgreSQL from local weekly working periods plus local dated openings minus blocks. Generate candidate starts every 15 minutes; a service may have any positive minute duration, and its buffer must fit the same opening.
- Merge adjacent/overlapping opening intervals before subtracting blocks, and align starts to the global quarter-hour grid rather than to an arbitrary period boundary.
- Convert candidate timestamps with the shop's IANA timezone. The public result retains the requested local date/time and returns UTC instants for the service start/end.
- Expose only `local_date`, `local_time`, `starts_at`, and `ends_at` through `get_available_slots`. The RPC is executable by anonymous/public callers; schedule and appointment tables are not directly readable.

## Consequences

- Availability cannot leak customer, appointment, or schedule records while retaining database authority for private interval inputs.
- The core appointment table supplies immutable service name, duration, price, and buffer snapshots plus reference/index structure for Task 6 without adding a booking workflow.
- Task 6 still owns booking authorization, the customer daily booking limit, stable booking errors, and atomic/concurrent booking behavior. The occupancy constraint is a storage invariant, not a completed booking transaction.
