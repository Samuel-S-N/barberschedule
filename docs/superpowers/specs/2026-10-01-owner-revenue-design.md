# Owner revenue report — design

Date: 2026-10-01. Fifth spec of the barber/owner reporting line (booking #20, profile #21, barber reports #22, clients #23). Stacked on `feat-barber-clients` (migration numbering continues at 0038). Revenue for the whole shop is **owner-only information**; barbers only ever see their own earnings (spec 3).

## Goal

A "Revenue" screen for the shop owner: how much the shop billed, how it splits between the barbers and the shop, which barbers and services bring it in, and how outcomes (completed / cancelled / missed) evolve, each compared with the previous period.

## Decisions (agreed with the user)

- Periods: last 7 days, this month, last 90 days (server limit 92 days), compared with the immediately preceding period of the same length.
- **Revenue** = sum of the price snapshots of **completed** appointments of all barbers.
- **Barber share**: commission barbers keep `commission_percent` of what they billed; chair-rental barbers keep everything they billed (same rule as the barber's own report).
- **Shop income** = revenue − barber share + **estimated chair rent**. Rent is estimated by proration: weekly amount × days ÷ 7, monthly amount × days ÷ 30, over the number of days of the period. The database does not record rent payments, so the screen labels it an estimate. A chair-rental barber with no appointments still counts for rent.
- Charts reuse the barber-report components: revenue per day (columns; per week over 31 days), revenue by barber (donut), revenue by service (donut), outcomes (donut). A per-barber table shows completed, revenue, barber share and shop share.
- The owner area is still a plain list of links (no tab shell, not on the design system): the screen is reached from a new "Revenue" link on the owner home. The owner-area retrofit stays a separate initiative. Out of scope: spreadsheet export and real rent payment tracking.

## Backend (migration `0038_owner_shop_report.sql`)

`get_shop_report(period_start date, period_end date) returns jsonb`, `security definer`, `search_path = pg_catalog, public, pg_temp`. The shop is the one whose `owner_user_id` is the caller (`P0029` `REPORT_FORBIDDEN` otherwise); `P0022` for an inverted range or more than 92 days; day boundaries use the shop time zone. Result:

```json
{
  "days":     [{ "date": "2026-09-30", "completed": 3, "gross_cents": 12000, "cancelled": 1, "no_show": 0, "upcoming": 2 }],
  "barbers":  [{ "barber_id": "…", "name": "Ana", "compensation_type": "commission", "completed": 3, "gross_cents": 12000,
                 "barber_share_cents": 4800, "rent_estimate_cents": 0 }],
  "services": [{ "service_id": "…", "name": "Cut", "completed": 5, "gross_cents": 20000 }]
}
```

- `days`: one row per local date with any appointment in range.
- `barbers`: every active barber of the shop plus inactive ones with appointments in range; `barber_share_cents` = `round(gross × percent / 100)` for commission barbers, `gross` for chair rental; `rent_estimate_cents` = `round(amount × days ÷ 7)` (weekly) or `round(amount × days ÷ 30)` (monthly) for chair rental, 0 for commission.
- `services`: completed count and gross per service snapshot, ordered by gross desc.
- No customer data in the payload. Grants: `authenticated` only.

## Front

- `src/features/owner-reports/api.ts` (`getShopReport`) and `src/features/owner-reports/build.ts` (pure `sumShopReport`, `barberRows`, `topByGross`) — period helpers (`previousRange`, `percentChange`, `daysBetween`, `dailySeries`) come from `src/features/reports/build-report.ts` (`dailySeries` becomes generic over `{ date: string }`).
- `DonutChart` gains an optional `formatValue` so legends can show money.
- `app/(owner)/revenue.tsx` built on the design-system components (period buttons, `StatTile`s with deltas, `ChartSection` + `ColumnChart`/`DonutChart`, per-barber `Card` rows) and a "Revenue" link on `app/(owner)/index.tsx`. New error code `REPORT_FORBIDDEN`. Strings in en/es/pt (most labels reuse the existing `barber.reports.*` keys; owner-specific ones live in `owner.revenue`).

## Testing

- pgTAP `023_owner_shop_report.sql`: per-day gross and counts, per-barber share for commission and chair rental, weekly and monthly rent proration, idle chair-rental barber listed, inactive idle barber excluded, services ordered by gross, isolation between shops, forbidden for barbers and customers, range limits, empty range.
- Jest: `build` (totals, shop income, comparison inputs, barber rows, top-by-gross), API mapping and errors, `DonutChart` money legend.
- Playwright (REST mocked): the owner opens Revenue from the home, sees tiles/charts/table, switches period.
- Browser check against the local owner/barbers with throwaway data, cleaned afterwards.
