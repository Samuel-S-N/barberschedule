# Barber reports with charts — design

Date: 2026-10-01. Third of three barber-side specs (1: booking, PR #20; 2: profile hub, PR #21; 3: this). Stacked on `feat-barber-profile` (migration numbering continues at 0036).

## Goal

The barber's **Earnings** tab becomes **Reports**: how much *they* earn, how many appointments they did, how many were cancelled or missed, which services and weekdays carry their work, each compared with the previous period. The barber sees only what concerns them: shop-wide / gross revenue is owner information and is **not shown** (the current "Revenue" tile and the per-service gross amounts are removed).

## Decisions (agreed with the user)

- Donut charts (hollow centre, total in the middle) for part-to-whole: appointments by outcome and top services. Friendlier than stacked bars.
- No gross revenue for the barber. The database computes **their earnings** (commission share, or the full amount for chair rental) so the app never receives the shop's gross. A shop-wide revenue report is a future *owner* report (out of scope).
- Periods: last 7 days, this month, last 90 days (server limit is 92 days), each compared with the immediately preceding period of the same length.
- Cancellations are counted on the scheduled date (the database stores neither who cancelled nor when).
- Out of scope: "My customers", day summary, owner reports, a table-wide export.

## Backend (migration `0036_barber_report.sql`)

`get_my_barber_report(period_start date, period_end date) returns jsonb`, `security definer`, `search_path = pg_catalog, public, pg_temp`, same guards as `get_my_barber_earnings`: `P0019` not a linked active barber, `P0022` range invalid or longer than 92 days; shop time zone for day boundaries; only the caller's barber row. Result:

```json
{
  "days": [{ "date": "2026-09-30", "completed": 3, "earnings_cents": 4800, "cancelled": 1, "no_show": 0, "upcoming": 2 }],
  "services": [{ "service_id": "…", "name": "Cut", "completed": 5 }]
}
```

- `days`: one row per local date that has any appointment in range (the client fills zeros).
- `earnings_cents` per day: `round(sum(price snapshot of completed) * commission_percent / 100)` for commission barbers, `sum(...)` for chair rental. Gross is never returned.
- `upcoming` = `scheduled`/`confirmed`. `services` = completed count per service snapshot name/id, ordered by count desc.
- Grants: `authenticated` only; revoked from `public, anon`.

## Front

- `src/features/reports/api.ts`: `getMyBarberReport(supabase, start, end)` → `{ days, services }` (camel-cased, numbers).
- `src/features/reports/build-report.ts` (pure, fully unit-tested): `previousRange`, `buildReport(current, previous)` → totals (`earningsCents`, `completed`, `cancelled`, `noShow`, `cancellationRate`), `delta(current, previous)` (percent, `null` when the previous value is 0), `dailySeries` (zero-filled; grouped by week when the range is longer than 31 days), `weekdayCounts` (Mon-Sun), `topServices(services, 4)` (+ "Other").
- `src/components/charts/ColumnChart.tsx`: SVG columns (≤ 24px, 4px rounded data end, square at the baseline, 2px gap, hairline grid, value label only on the peak, rounded y ticks), tap shows the value. Used for earnings per day and weekdays.
- `src/components/charts/DonutChart.tsx`: SVG ring, 2px surface gaps between slices, hole with the total (proportional figure), legend always present (swatch + label + count), ≤ 5 slices. Outcome donut uses the reserved status colours (success / danger / warning) with icon + label; the services donut uses the dataviz categorical order, validated with `validate_palette.js` against the app surface (fallback: tuned from the brand palette).
- Each chart has a "Show data" toggle listing the numbers (accessible table view).
- `app/(barber)/earnings.tsx` rewritten (route and tab key unchanged; tab label becomes "Reports"): period buttons, KPI tiles (Your earnings, Completed, Cancellation rate — Earnings and Completed carry the delta vs previous period; "Chair rent" tile kept for chair-rental barbers), then the four charts. Strings in en/es/pt; unused `barber.earnings.gross`/`breakdown`/`serviceLine` removed.
- The old `get_my_barber_earnings` RPC and `calculateBarberEarnings` stay for backwards compatibility but the screen no longer uses them (removal is a follow-up).

## Testing

- pgTAP `021_barber_report.sql`: per-day counts and earnings for commission and chair rental; gross never present in the payload; only the caller's rows; timezone day boundary; 92-day limit; non-barber rejected; empty range returns empty arrays.
- Jest: `build-report` (deltas incl. zero baseline, weekly grouping, zero fill, weekday order, top-N + Other, cancellation rate with zero denominator), API mapping, chart components render (slice and column counts, centre total, legend, data toggle).
- Playwright (REST mocked): period switch refetches with the right range, tiles and charts render, no revenue text anywhere.
- Browser check with screenshots and computed CSS against the local barber, using throwaway appointments created and deleted afterwards.
