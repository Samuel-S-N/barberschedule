# Decision 014: Shop contact info and weekly opening hours

Date: 2026-10-01
Status: accepted

## Decision

- `shops` gains nullable `address`, `phone` and `whatsapp` (length-checked). They are publicly readable (column grant to `anon`/`authenticated`) and updatable by the shop owner only, like `name`/`timezone`.
- Opening hours live in `shop_hours(shop_id, weekday 1..7 ISO, start_time, end_time)`, publicly readable. A day without rows is closed. **A break (lunch or any other pause) is the gap between two periods of the same weekday**; no separate break table. A gist exclusion constraint forbids overlapping periods, like `working_periods`.
- Writes go only through `set_shop_hours(p_periods jsonb)` (owner-only, `42501` otherwise). It replaces every row of the caller's shop atomically and maps any invalid element (bad weekday/time, `start >= end`, overlap) to `P0023` / `SHOP_HOURS_INVALID`; the previous hours survive a rejected call. (`P0020`–`P0022` were already used by the barber role.)
- The client converts between a per-day draft (`open`, `start`, `end`, `breaks[]`) and periods with pure helpers (`src/features/shops/hours.ts`); the customer card merges consecutive weekdays with identical periods ("Mon–Fri 09:00–12:00 · 13:00–18:00").
- Hours are informational. The availability engine (ADR 006) still uses barber working periods and overrides; shop hours do not restrict booking.
- Contact buttons use `Linking` with `tel:` and `https://wa.me/<digits>` (national numbers get Brazil's `55`). There is no map or geocoding by decision; address is plain text.

## Consequences and limits

- Shop hours and barber schedules can disagree; the owner maintains both. Dated closures/holidays are not modeled.
- The owner editor is a plain React Native screen (`/shop`) with `HH:mm` text inputs, like the other owner screens.
- Single-shop MVP: the customer and owner screens use the first shop returned by `listPublicShops`.
