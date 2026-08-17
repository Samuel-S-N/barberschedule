# Decision 005: Schedule and overrides

Date: 2026-08-13
Status: accepted

## Decision

- Weekly working periods store ISO weekday numbers (`1` Monday through `7` Sunday) with local `time` values.
- Date overrides store a local `date` and a `kind` of `block` or `opening`.
- A block with null times means all day; a timed block and every opening require a strictly increasing local time interval.
- Nonexistent local timestamps are rejected. For ambiguous historic `America/Sao_Paulo` timestamps, conversion selects the earlier instant (the first occurrence).
- Future availability treats a date as weekly periods plus openings minus blocks. An all-day block wins over every other record for that date.
- Only the shop owner can read, insert, or delete schedule records. Anonymous visitors and customers receive no schedule rows and no write permission.

## Consequences

- PostgreSQL enforces weekday/time validity, duplicate identical periods, and overlapping weekly periods before availability exists.
- The Expo client converts display/boundary values with `America/Sao_Paulo`, while schedule input remains local instead of storing a premature UTC instant.
- The browser owner-flow regression test intercepts the Supabase REST boundary because the current E2E harness has no seeded owner fixture; pgTAP remains the authorization proof.
- Task 4 deliberately does not expose slots, resolve conflicts between override records, create appointments, or calculate availability. Those are Task 5 and later work.
