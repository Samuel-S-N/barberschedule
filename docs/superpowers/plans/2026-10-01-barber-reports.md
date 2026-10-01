# Barber Reports With Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The barber's Earnings tab becomes Reports: their own earnings, completed/cancelled/missed appointments, top services and busiest weekdays, each compared with the previous period, drawn as columns and hollow donuts. No shop revenue is shown to the barber.

**Architecture:** One jsonb RPC computes per-day counts and the barber's own earnings (gross never leaves the database). Pure functions build totals, deltas and series; two hand-drawn `react-native-svg` components (`ColumnChart`, `DonutChart`) plus a `ChartSection` wrapper render them; `app/(barber)/earnings.tsx` is rewritten.

**Tech Stack:** Supabase/Postgres + pgTAP, `react-native-svg` (already installed), Expo Router, NativeWind, TanStack Query, i18next (en/es/pt), Jest + Testing Library, Playwright (REST mocked).

**Spec:** `docs/superpowers/specs/2026-10-01-barber-reports-design.md`

## Global Constraints

- Worktree `/home/samuel/projects/barberschedule/.claude/worktrees/barber-reports`, branch `feat-barber-reports`, stacked on `feat-barber-profile` (PR #21). Migration `0036`, pgTAP `021` (UUID prefix `ac`). Local Supabase only. `node_modules` is symlinked.
- The barber never sees gross revenue: no gross field in the RPC payload, no "Revenue" string, no per-service R$ amounts.
- Chart rules (dataviz skill): bars ≤ 24px with 4px rounded data end and square baseline; 2px surface gaps; hairline solid grid; value label only on the peak; text in text tokens, never the series colour; legend always present for donuts; ≤ 5 donut slices; status colours (success/danger/warning) always with icon + label; every chart has a "Show data" list.
- Every string in `en`, `es`, `pt` (locale-parity test). `className` only on plain RN elements. UI verified in a real browser. Strict TDD; Jest with `--forceExit`; kill processes by PID (never `pkill -f`). Use `rtk` for raw-read shell commands.
- The existing `get_my_barber_earnings` RPC, `getMyBarberEarnings` and `calculateBarberEarnings` stay (unused by the screen).

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0036_barber_report.sql`, `supabase/tests/021_barber_report.sql` | the report RPC and its pgTAP |
| `src/features/reports/build-report.ts` | pure: ranges, totals, deltas, series, weekday counts, top services |
| `src/features/reports/api.ts` | `getMyBarberReport` |
| `src/components/charts/geometry.ts` | pure: `niceMax`, `yTicks`, `barPath`, `donutArcs` |
| `src/components/charts/{ColumnChart,DonutChart,ChartSection}.tsx` | SVG charts and the section wrapper |
| `app/(barber)/earnings.tsx` | the Reports screen |
| `src/i18n/locales/*.ts` | `barber.reports.*`, tab label |
| `tests/unit/{build-report,chart-geometry,charts}.test.ts(x)`, `tests/integration/barber-report.test.ts`, `tests/e2e/barber-reports.web.spec.ts` | tests |

---

### Task 1: The report RPC

**Files:** Create `supabase/migrations/0036_barber_report.sql`, `supabase/tests/021_barber_report.sql`.

**Interfaces:** Produces `public.get_my_barber_report(period_start date, period_end date) returns jsonb` = `{ "days": [{date, completed, earnings_cents, cancelled, no_show, upcoming}], "services": [{service_id, name, completed}] }`. Errors `P0019` (not a linked active barber), `P0022` (range invalid or > 92 days).

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/021_barber_report.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ac000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't21-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ac000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't21-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ac000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't21-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ac000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't21-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'ac000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('ac000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id, timezone)
values ('ac100000-0000-0000-0000-000000000001', 'T21 Shop', 'ac000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, chair_rental_amount_cents, chair_rental_frequency)
values
  ('ac200000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002', 'Barber A', 'commission', 40, null, null),
  ('ac200000-0000-0000-0000-000000000002', 'ac100000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000003', 'Barber B', 'chair_rental', 0, 5000, 'weekly');

insert into public.customers (id, shop_id, full_name, email)
values ('ac300000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'T21 Customer', 't21-customer-row@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values
  ('ac400000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'Cut', 30, 4000),
  ('ac400000-0000-0000-0000-000000000002', 'ac100000-0000-0000-0000-000000000001', 'Beard', 30, 3000),
  ('ac400000-0000-0000-0000-000000000003', 'ac100000-0000-0000-0000-000000000001', 'Pro Cut', 30, 5000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('ac500000-0000-0000-0000-000000000001', 'ac100000-0000-0000-0000-000000000001', 'ac200000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000001'),
  ('ac500000-0000-0000-0000-000000000002', 'ac100000-0000-0000-0000-000000000001', 'ac200000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000002'),
  ('ac500000-0000-0000-0000-000000000003', 'ac100000-0000-0000-0000-000000000001', 'ac200000-0000-0000-0000-000000000002', 'ac400000-0000-0000-0000-000000000003');

-- helper: one appointment on local date (current_date - back), at 15:00 UTC (= 12:00 local, same date) plus an optional shift
create function pg_temp.appt(barber uuid, barber_service uuid, service uuid, name text, price integer, status public.appointment_status, back integer, shift interval default interval '0')
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  ) values (
    'ac100000-0000-0000-0000-000000000001', barber, 'ac300000-0000-0000-0000-000000000001', barber_service, service,
    ((current_date - back)::timestamp + interval '15 hours' + shift) at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours' + shift + interval '30 minutes') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours' + shift + interval '30 minutes') at time zone 'UTC',
    status, name, 30, price, 0
  )
$$;

-- barber A: d-2 two completed (Cut 4000 + Beard 3000); d-1 completed Cut 4000, cancelled Cut, no_show Beard
select pg_temp.appt('ac200000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000001', 'Cut', 4000, 'completed', 2, interval '0');
select pg_temp.appt('ac200000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000002', 'ac400000-0000-0000-0000-000000000002', 'Beard', 3000, 'completed', 2, interval '1 hour');
select pg_temp.appt('ac200000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000001', 'Cut', 4000, 'completed', 1, interval '0');
select pg_temp.appt('ac200000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000001', 'Cut', 4000, 'cancelled', 1, interval '1 hour');
select pg_temp.appt('ac200000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000002', 'ac400000-0000-0000-0000-000000000002', 'Beard', 3000, 'no_show', 1, interval '2 hours');
-- barber A: a completed Cut at 02:00 UTC on d-3 = 23:00 local on d-4 (timezone boundary)
select pg_temp.appt('ac200000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000001', 'Cut', 4000, 'completed', 3, interval '-13 hours');
-- barber A: an upcoming one tomorrow
select pg_temp.appt('ac200000-0000-0000-0000-000000000001', 'ac500000-0000-0000-0000-000000000001', 'ac400000-0000-0000-0000-000000000001', 'Cut', 4000, 'scheduled', -1, interval '0');
-- barber B (chair rental): one completed Pro Cut 5000 on d-2
select pg_temp.appt('ac200000-0000-0000-0000-000000000002', 'ac500000-0000-0000-0000-000000000003', 'ac400000-0000-0000-0000-000000000003', 'Pro Cut', 5000, 'completed', 2, interval '0');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('t21.a', public.get_my_barber_report(current_date - 7, current_date + 2)::text, false);

select is(
  (select (d ->> 'completed')::int from jsonb_array_elements(current_setting('t21.a')::jsonb -> 'days') d where d ->> 'date' = (current_date - 2)::text),
  2, 'completed appointments are counted per local day'
);
select is(
  (select (d ->> 'earnings_cents')::int from jsonb_array_elements(current_setting('t21.a')::jsonb -> 'days') d where d ->> 'date' = (current_date - 2)::text),
  2800, 'commission earnings are the barber''s share (40% of 7000)'
);
select is(
  (select (d ->> 'cancelled')::int * 10 + (d ->> 'no_show')::int from jsonb_array_elements(current_setting('t21.a')::jsonb -> 'days') d where d ->> 'date' = (current_date - 1)::text),
  11, 'cancelled and no-show are counted separately'
);
select is(
  (select (d ->> 'upcoming')::int from jsonb_array_elements(current_setting('t21.a')::jsonb -> 'days') d where d ->> 'date' = (current_date + 1)::text),
  1, 'scheduled and confirmed appointments count as upcoming'
);
select is(
  (select (d ->> 'completed')::int from jsonb_array_elements(current_setting('t21.a')::jsonb -> 'days') d where d ->> 'date' = (current_date - 4)::text),
  1, 'a late-evening local appointment lands on the shop-local date'
);
select is(
  (current_setting('t21.a')::jsonb -> 'services' -> 0 ->> 'name') || ':' || (current_setting('t21.a')::jsonb -> 'services' -> 0 ->> 'completed'),
  'Cut:3', 'services are ordered by completed count'
);
select is(
  (select sum((d ->> 'completed')::int)::int from jsonb_array_elements(current_setting('t21.a')::jsonb -> 'days') d),
  4, 'only the caller''s own appointments are included'
);
select ok(
  (current_setting('t21.a')::jsonb -> 'days' -> 0) ?& array['date', 'completed', 'earnings_cents', 'cancelled', 'no_show', 'upcoming']
  and not (current_setting('t21.a')::jsonb::text like '%gross%'),
  'the payload exposes earnings but never gross revenue'
);
select is(
  jsonb_array_length(public.get_my_barber_report(current_date - 200, current_date - 190) -> 'days'),
  0, 'an empty range returns empty arrays'
);
select throws_ok($$ select public.get_my_barber_report(current_date - 100, current_date) $$, 'P0022', null, 'a range over 92 days is rejected');
select throws_ok($$ select public.get_my_barber_report(current_date, current_date - 1) $$, 'P0022', null, 'an inverted range is rejected');

select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000003', true);
select is(
  (select (d ->> 'earnings_cents')::int from jsonb_array_elements(public.get_my_barber_report(current_date - 7, current_date) -> 'days') d where d ->> 'date' = (current_date - 2)::text),
  5000, 'chair rental earnings are the full amount of completed services'
);

select set_config('request.jwt.claim.sub', 'ac000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select public.get_my_barber_report(current_date - 7, current_date) $$, 'P0019', null, 'a non-barber cannot read reports');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to fail** — `rtk npx supabase test db supabase/tests/021_barber_report.sql` → FAIL (function missing).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0036_barber_report.sql`

```sql
create function public.get_my_barber_report(period_start date, period_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  tz text;
  range_start timestamptz;
  range_end timestamptz;
  share numeric;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if period_end < period_start or period_end - period_start > 91 then
    raise exception using errcode = 'P0022', message = 'EARNINGS_INVALID_RANGE';
  end if;

  select s.timezone into tz from public.shops s where s.id = me.shop_id;
  range_start := period_start::timestamp at time zone tz;
  range_end := (period_end + 1)::timestamp at time zone tz;
  -- The barber's own share: commission percent, or the whole amount for chair rental. Gross is never returned.
  share := case when me.compensation_type = 'commission' then me.commission_percent else 100 end;

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d."date")
      from (
        select
          (a.starts_at at time zone tz)::date as "date",
          (count(*) filter (where a.status = 'completed'))::int as completed,
          round(coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0) * share / 100)::int as earnings_cents,
          (count(*) filter (where a.status = 'cancelled'))::int as cancelled,
          (count(*) filter (where a.status = 'no_show'))::int as no_show,
          (count(*) filter (where a.status in ('scheduled', 'confirmed')))::int as upcoming
        from public.appointments a
        where a.barber_id = me.id and a.starts_at >= range_start and a.starts_at < range_end
        group by 1
      ) d
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.completed desc, s.name)
      from (
        select a.service_id, a.service_name_snapshot as name, count(*)::int as completed
        from public.appointments a
        where a.barber_id = me.id and a.status = 'completed' and a.starts_at >= range_start and a.starts_at < range_end
        group by a.service_id, a.service_name_snapshot
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_barber_report(date, date) from public, anon;
grant execute on function public.get_my_barber_report(date, date) to authenticated;
```

- [ ] **Step 4: Apply and run** — `rtk npx supabase migration up && rtk npx supabase test db supabase/tests/021_barber_report.sql supabase/tests/013_barber_role.sql supabase/tests/020_standard_services.sql` → all pass. (If the timezone-boundary test fails, check the `-13 hours` shift: 15:00 UTC − 13h = 02:00 UTC on `current_date - 3`, which is 23:00 local on `current_date - 4`.)

- [ ] **Step 5: Commit** — `feat(db): barber report RPC with per-day counts and own earnings` (+ Co-Authored-By trailer).

---

### Task 2: Pure report logic and API client

**Files:** Create `src/features/reports/build-report.ts`, `src/features/reports/api.ts`; tests `tests/unit/build-report.test.ts`, `tests/integration/barber-report.test.ts`.

**Interfaces:**
```ts
export type ReportDay = { cancelled: number; completed: number; date: string; earningsCents: number; noShow: number; upcoming: number };
export type ReportService = { completed: number; name: string; serviceId: string };
export type BarberReport = { days: ReportDay[]; services: ReportService[] };
export type ReportTotals = { cancelled: number; cancellationRate: number | null; completed: number; earningsCents: number; noShow: number; upcoming: number };
export type SeriesPoint = { from: string; key: string; value: number };
export type DonutItem = { key: string; name: string; value: number };
export function daysBetween(start: string, end: string): number;
export function previousRange(start: string, end: string): { end: string; start: string };
export function sumDays(days: ReportDay[]): ReportTotals;
export function percentChange(current: number, previous: number): number | null;
export function dailySeries(days: ReportDay[], start: string, end: string, pick: (day: ReportDay) => number): SeriesPoint[];
export function weekdayCounts(days: ReportDay[]): number[];
export function topServices(services: ReportService[], max?: number): DonutItem[];
export function getMyBarberReport(supabase: Pick<SupabaseClient, "rpc">, start: string, end: string): Promise<BarberReport>;
```

- [ ] **Step 1: Failing tests** — `tests/unit/build-report.test.ts`

```ts
import {
  dailySeries, daysBetween, percentChange, previousRange, sumDays, topServices, weekdayCounts,
  type ReportDay,
} from "../../src/features/reports/build-report";

const day = (date: string, over: Partial<ReportDay> = {}): ReportDay => ({
  cancelled: 0, completed: 0, date, earningsCents: 0, noShow: 0, upcoming: 0, ...over,
});

describe("ranges", () => {
  it("counts days inclusively", () => {
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(7);
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(1);
  });

  it("previous range has the same length and ends the day before", () => {
    expect(previousRange("2026-10-01", "2026-10-07")).toEqual({ end: "2026-09-30", start: "2026-09-24" });
    expect(previousRange("2026-10-01", "2026-10-01")).toEqual({ end: "2026-09-30", start: "2026-09-30" });
  });
});

describe("totals and deltas", () => {
  it("sums days and computes the cancellation rate from closed appointments", () => {
    const totals = sumDays([
      day("2026-10-01", { cancelled: 1, completed: 6, earningsCents: 1000, noShow: 1, upcoming: 2 }),
      day("2026-10-02", { completed: 2, earningsCents: 500 }),
    ]);

    expect(totals).toEqual({ cancelled: 1, cancellationRate: 0.2, completed: 8, earningsCents: 1500, noShow: 1, upcoming: 2 });
  });

  it("has no rate when nothing was closed", () => {
    expect(sumDays([day("2026-10-01", { upcoming: 3 })]).cancellationRate).toBeNull();
    expect(sumDays([]).cancellationRate).toBeNull();
  });

  it("rounds the percent change and returns null against a zero baseline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe("series", () => {
  it("zero-fills every day in a short range", () => {
    const points = dailySeries([day("2026-10-02", { earningsCents: 700 })], "2026-10-01", "2026-10-03", (d) => d.earningsCents);

    expect(points.map((p) => p.value)).toEqual([0, 700, 0]);
    expect(points.map((p) => p.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("groups by week when the range is longer than 31 days", () => {
    const points = dailySeries(
      [day("2026-10-01", { earningsCents: 100 }), day("2026-10-07", { earningsCents: 50 }), day("2026-10-08", { earningsCents: 10 })],
      "2026-10-01", "2026-12-29", (d) => d.earningsCents,
    );

    expect(points).toHaveLength(13);
    expect(points[0]).toEqual({ from: "2026-10-01", key: "2026-10-01", value: 150 });
    expect(points[1].value).toBe(10);
  });

  it("counts completed appointments per weekday, Monday first", () => {
    // 2026-10-05 is a Monday, 2026-10-11 a Sunday
    expect(weekdayCounts([day("2026-10-05", { completed: 2 }), day("2026-10-11", { completed: 3 }), day("2026-10-12", { completed: 1 })]))
      .toEqual([3, 0, 0, 0, 0, 0, 3]);
  });
});

describe("topServices", () => {
  const services = [
    { completed: 5, name: "Cut", serviceId: "a" }, { completed: 1, name: "Dye", serviceId: "e" },
    { completed: 3, name: "Beard", serviceId: "b" }, { completed: 2, name: "Shave", serviceId: "c" },
    { completed: 2, name: "Kids", serviceId: "d" }, { completed: 1, name: "Wax", serviceId: "f" },
  ];

  it("keeps the top N and folds the tail into other", () => {
    const items = topServices(services, 4);

    expect(items.map((i) => i.key)).toEqual(["a", "b", "d", "c", "other"]);
    expect(items.at(-1)).toEqual({ key: "other", name: "", value: 2 });
  });

  it("adds no other slice when everything fits", () => {
    expect(topServices(services.slice(0, 3), 4).map((i) => i.key)).toEqual(["a", "b", "c"]);
  });
});
```

`tests/integration/barber-report.test.ts`:
```ts
import { getMyBarberReport } from "../../src/features/reports/api";

describe("barber report client", () => {
  it("maps the jsonb payload and sends the period", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        days: [{ cancelled: 1, completed: 2, date: "2026-10-01", earnings_cents: 2800, no_show: 0, upcoming: 3 }],
        services: [{ completed: 2, name: "Cut", service_id: "s1" }],
      },
      error: null,
    });

    await expect(getMyBarberReport({ rpc } as never, "2026-10-01", "2026-10-07")).resolves.toEqual({
      days: [{ cancelled: 1, completed: 2, date: "2026-10-01", earningsCents: 2800, noShow: 0, upcoming: 3 }],
      services: [{ completed: 2, name: "Cut", serviceId: "s1" }],
    });
    expect(rpc).toHaveBeenCalledWith("get_my_barber_report", { period_end: "2026-10-07", period_start: "2026-10-01" });
  });

  it("returns empty lists for an empty payload", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { days: [], services: [] }, error: null });

    await expect(getMyBarberReport({ rpc } as never, "2026-10-01", "2026-10-07")).resolves.toEqual({ days: [], services: [] });
  });

  it("rejects ranges over 92 days before calling the database", async () => {
    const rpc = jest.fn();

    await expect(getMyBarberReport({ rpc } as never, "2026-01-01", "2026-12-31")).rejects.toMatchObject({ code: "EARNINGS_INVALID_RANGE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps an unlinked barber", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0019" } });

    await expect(getMyBarberReport({ rpc } as never, "2026-10-01", "2026-10-07")).rejects.toMatchObject({ code: "BARBER_NOT_LINKED" });
  });
});
```

- [ ] **Step 2: Run to fail** — `rtk npx jest tests/unit/build-report.test.ts tests/integration/barber-report.test.ts --forceExit` → FAIL (modules missing).

- [ ] **Step 3: Implement** — `src/features/reports/build-report.ts`

```ts
import { addLocalDays } from "../../lib/dates/calendar-strip-days";

export type ReportDay = { cancelled: number; completed: number; date: string; earningsCents: number; noShow: number; upcoming: number };
export type ReportService = { completed: number; name: string; serviceId: string };
export type BarberReport = { days: ReportDay[]; services: ReportService[] };
export type ReportTotals = { cancelled: number; cancellationRate: number | null; completed: number; earningsCents: number; noShow: number; upcoming: number };
export type SeriesPoint = { from: string; key: string; value: number };
export type DonutItem = { key: string; name: string; value: number };

// Longer ranges are shown per week so the chart stays readable.
export const WEEKLY_THRESHOLD_DAYS = 31;

export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
}

export function previousRange(start: string, end: string) {
  return { end: addLocalDays(start, -1), start: addLocalDays(start, -daysBetween(start, end)) };
}

export function sumDays(days: ReportDay[]): ReportTotals {
  const totals = days.reduce(
    (sum, d) => ({
      cancelled: sum.cancelled + d.cancelled,
      completed: sum.completed + d.completed,
      earningsCents: sum.earningsCents + d.earningsCents,
      noShow: sum.noShow + d.noShow,
      upcoming: sum.upcoming + d.upcoming,
    }),
    { cancelled: 0, completed: 0, earningsCents: 0, noShow: 0, upcoming: 0 },
  );
  const closed = totals.completed + totals.cancelled + totals.noShow;

  return { ...totals, cancellationRate: closed === 0 ? null : (totals.cancelled + totals.noShow) / closed };
}

export function percentChange(current: number, previous: number) {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

export function dailySeries(days: ReportDay[], start: string, end: string, pick: (day: ReportDay) => number): SeriesPoint[] {
  const length = daysBetween(start, end);
  const byDate = new Map(days.map((d) => [d.date, pick(d)]));
  const bucket = length > WEEKLY_THRESHOLD_DAYS ? 7 : 1;
  const points: SeriesPoint[] = [];

  for (let offset = 0; offset < length; offset += bucket) {
    let value = 0;
    for (let i = offset; i < Math.min(offset + bucket, length); i += 1) value += byDate.get(addLocalDays(start, i)) ?? 0;
    const from = addLocalDays(start, offset);
    points.push({ from, key: from, value });
  }

  return points;
}

// Monday first.
export function weekdayCounts(days: ReportDay[]) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) counts[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7] += d.completed;

  return counts;
}

export function topServices(services: ReportService[], max = 4): DonutItem[] {
  const sorted = [...services].sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));
  const head = sorted.slice(0, max).map((s) => ({ key: s.serviceId, name: s.name, value: s.completed }));
  const rest = sorted.slice(max).reduce((sum, s) => sum + s.completed, 0);

  return rest > 0 ? [...head, { key: "other", name: "", value: rest }] : head;
}
```
`src/features/reports/api.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { daysBetween, type BarberReport } from "./build-report";

const MAX_REPORT_DAYS = 92;

export async function getMyBarberReport(supabase: Pick<SupabaseClient, "rpc">, start: string, end: string): Promise<BarberReport> {
  const length = daysBetween(start, end);

  if (!(length >= 1 && length <= MAX_REPORT_DAYS)) {
    throw new DomainError("EARNINGS_INVALID_RANGE", "Choose a period of up to 92 days.");
  }

  const { data, error } = await supabase.rpc("get_my_barber_report", { period_end: end, period_start: start });

  if (error) {
    const domainError = toDomainError(error);
    throw domainError.code === "BOOKING_REQUEST_FAILED"
      ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the barber request.")
      : domainError;
  }

  const payload = (data ?? {}) as {
    days?: Array<{ cancelled: number; completed: number; date: string; earnings_cents: number; no_show: number; upcoming: number }>;
    services?: Array<{ completed: number; name: string; service_id: string }>;
  };

  return {
    days: (payload.days ?? []).map((d) => ({
      cancelled: d.cancelled, completed: d.completed, date: d.date, earningsCents: d.earnings_cents, noShow: d.no_show, upcoming: d.upcoming,
    })),
    services: (payload.services ?? []).map((s) => ({ completed: s.completed, name: s.name, serviceId: s.service_id })),
  };
}
```

- [ ] **Step 4: Run** — `rtk npx jest tests/unit/build-report.test.ts tests/integration/barber-report.test.ts --forceExit && rtk npm run typecheck && npx eslint src tests` → PASS.

- [ ] **Step 5: Commit** — `feat(barber): report calculations and API client`.

---

### Task 3: Chart components

**Files:** Create `src/components/charts/geometry.ts`, `ColumnChart.tsx`, `DonutChart.tsx`, `ChartSection.tsx`; tests `tests/unit/chart-geometry.test.ts`, `tests/unit/charts.test.ts`. Modify `src/i18n/locales/*` (`barber.reports.showData`, `hideData`).

**Interfaces:**
```ts
export function niceMax(value: number): number;
export function yTicks(max: number): number[];
export function barPath(x: number, y: number, width: number, height: number, radius: number): string;
export function donutArcs(values: number[], opts: { cx: number; cy: number; gapPx: number; inner: number; outer: number }): Array<{ d: string; index: number }>;
export type ColumnDatum = { key: string; label: string; value: number };
ColumnChart props: { accessibilityLabel: string; color?: string; data: ColumnDatum[]; formatTick?: (n: number) => string; formatValue: (n: number) => string; height?: number; mutedColor?: string; testID: string }
export type DonutSlice = { color: string; icon?: LucideIcon; key: string; label: string; value: number };
DonutChart props: { centerLabel: string; centerValue: string; size?: number; slices: DonutSlice[]; testID: string }
ChartSection props: { children: ReactNode; rows: Array<{ label: string; value: string }>; testID: string; title: string }
```

- [ ] **Step 1: Validate the donut palette** (colour is computable): run, from the skill's directory, `node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4" --mode light` (path: `/tmp/claude-1000/bundled-skills/*/dataviz/scripts/validate_palette.js`; `ls` the glob first). Record the result in the commit message. If any hard gate FAILs, re-run with the brand-tuned candidate `#DB9A34,#2a78d6,#1baf7a,#7A1F2B,#9C8E7B` and use whichever passes; the "other" slice always uses `colors.neutral[300]`. The chosen list is exported as `SERVICE_SLICE_COLORS` from `src/components/charts/geometry.ts`. Status slices use `colors.success[500]`, `colors.danger[500]`, `colors.warning[500]` with icons.

- [ ] **Step 2: Failing tests** — `tests/unit/chart-geometry.test.ts`

```ts
import { barPath, donutArcs, niceMax, yTicks } from "../../src/components/charts/geometry";

describe("scale", () => {
  it("rounds the axis maximum up to a clean number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(4800)).toBe(5000);
    expect(niceMax(1000)).toBe(1000);
  });

  it("uses three ticks from zero to the maximum", () => {
    expect(yTicks(200)).toEqual([0, 100, 200]);
  });
});

describe("barPath", () => {
  it("is empty for a zero-height bar and rounds only the top corners", () => {
    expect(barPath(0, 10, 10, 0, 4)).toBe("");
    const d = barPath(0, 0, 10, 50, 4);

    expect(d.startsWith("M 0 50")).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(2);
  });
});

describe("donutArcs", () => {
  const opts = { cx: 50, cy: 50, gapPx: 2, inner: 30, outer: 50 };

  it("returns one arc per non-zero value, keeping the original index", () => {
    expect(donutArcs([1, 1], opts).map((a) => a.index)).toEqual([0, 1]);
    expect(donutArcs([0, 5], opts).map((a) => a.index)).toEqual([1]);
  });

  it("returns nothing when there is no data", () => {
    expect(donutArcs([], opts)).toEqual([]);
    expect(donutArcs([0, 0], opts)).toEqual([]);
  });

  it("draws a single slice as a nearly full ring, not a degenerate arc", () => {
    const [arc] = donutArcs([4], opts);

    expect(arc.d).toContain("A 50 50 0 1 1");
  });
});
```
`tests/unit/charts.test.ts`:
```ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ChartSection } from "../../src/components/charts/ChartSection";
import { ColumnChart } from "../../src/components/charts/ColumnChart";
import { DonutChart } from "../../src/components/charts/DonutChart";

const layout = { nativeEvent: { layout: { height: 160, width: 320, x: 0, y: 0 } } };

describe("DonutChart", () => {
  const slices = [
    { color: "#2F9E5B", key: "completed", label: "Completed", value: 6 },
    { color: "#DC3B30", key: "cancelled", label: "Cancelled", value: 2 },
  ];

  it("shows the total in the hole and a legend row per slice with its share", async () => {
    const view = await render(React.createElement(DonutChart, { centerLabel: "total", centerValue: "8", slices, testID: "donut" }));

    expect(view.getByText("8")).toBeTruthy();
    expect(view.getByText("Completed")).toBeTruthy();
    expect(view.getByText("6 · 75%")).toBeTruthy();
    expect(view.getByText("2 · 25%")).toBeTruthy();
  });

  it("shows a dash instead of a total when there is no data", async () => {
    const view = await render(React.createElement(DonutChart, { centerLabel: "total", centerValue: "0", slices: slices.map((s) => ({ ...s, value: 0 })), testID: "donut" }));

    expect(view.getByText("0")).toBeTruthy();
    expect(view.queryByText(/%/)).toBeNull();
  });
});

describe("ColumnChart", () => {
  const data = [{ key: "a", label: "Mon", value: 100 }, { key: "b", label: "Tue", value: 300 }];

  it("renders after layout and selecting a column shows its value", async () => {
    const view = await render(
      React.createElement(ColumnChart, { accessibilityLabel: "Earnings", data, formatValue: (n: number) => `R$ ${n}`, testID: "chart" }),
    );

    await fireEvent(view.getByTestId("chart"), "layout", layout);
    await fireEvent.press(view.getByTestId("chart-bar-1"));
    expect(view.getByText("Tue: R$ 300")).toBeTruthy();
  });
});

describe("ChartSection", () => {
  it("reveals the data rows on demand", async () => {
    const view = await render(
      React.createElement(ChartSection, { rows: [{ label: "Mon", value: "2" }], testID: "section", title: "Weekdays" }, React.createElement("Text", null, "chart")),
    );

    expect(view.queryByText("Mon")).toBeNull();
    await fireEvent.press(view.getByTestId("section-toggle"));
    expect(view.getByText("Mon")).toBeTruthy();
  });
});
```
(`Text` children inside the section test may need `import { Text } from "react-native"`; use `React.createElement(Text, null, "chart")` accordingly.)

- [ ] **Step 3: Run to fail** — `rtk npx jest tests/unit/chart-geometry.test.ts tests/unit/charts.test.ts --forceExit` → FAIL (modules missing).

- [ ] **Step 4: Implement**

`geometry.ts`:
```ts
export const SERVICE_SLICE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"]; // replace with the validated list from Step 1

export function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;

  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
}

export function yTicks(max: number) {
  return [0, max / 2, max];
}

// Rounded top corners only; the bottom edge sits square on the baseline.
export function barPath(x: number, y: number, width: number, height: number, radius: number) {
  if (height <= 0 || width <= 0) return "";
  const r = Math.min(radius, width / 2, height);

  return `M ${x} ${y + height} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + width - r} ${y} Q ${x + width} ${y} ${x + width} ${y + r} L ${x + width} ${y + height} Z`;
}

type DonutOptions = { cx: number; cy: number; gapPx: number; inner: number; outer: number };

// Angles run clockwise from 12 o'clock. A 2px surface gap separates neighbouring slices.
export function donutArcs(values: number[], { cx, cy, gapPx, inner, outer }: DonutOptions) {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return [];

  const point = (radius: number, angle: number) => `${cx + radius * Math.sin(angle)} ${cy - radius * Math.cos(angle)}`;
  const drawn = values.filter((v) => v > 0).length;
  const gap = drawn > 1 ? gapPx / outer : 0;
  let cursor = 0;

  return values.flatMap((value, index) => {
    if (value <= 0) return [];
    const sweep = (value / total) * Math.PI * 2;
    const start = cursor + gap / 2;
    const end = Math.min(cursor + sweep - gap / 2, start + Math.PI * 2 - 0.001);
    cursor += sweep;
    const large = end - start > Math.PI ? 1 : 0;

    return [{
      d: `M ${point(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`,
      index,
    }];
  });
}
```
`ColumnChart.tsx` (SVG via `react-native-svg`):
```tsx
import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { colors } from "../../lib/design/colors";
import { barPath, niceMax, yTicks } from "./geometry";

export type ColumnDatum = { key: string; label: string; value: number };

type Props = {
  accessibilityLabel: string;
  color?: string;
  data: ColumnDatum[];
  formatTick?: (value: number) => string;
  formatValue: (value: number) => string;
  height?: number;
  mutedColor?: string;
  testID: string;
};

const LEFT = 34;
const RIGHT = 4;
const TOP = 18;
const BOTTOM = 22;

export function ColumnChart({ accessibilityLabel, color = colors.primary[400], data, formatTick = String, formatValue, height = 160, mutedColor, testID }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotWidth = Math.max(0, width - LEFT - RIGHT);
  const plotHeight = height - TOP - BOTTOM;
  const slot = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.min(24, Math.max(2, slot - 2));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const y = (value: number) => TOP + plotHeight - (value / max) * plotHeight;

  return (
    <View accessibilityLabel={accessibilityLabel} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} testID={testID}>
      <Text className="h-5 text-sm font-sans-medium text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>
        {selected !== null && data[selected] ? `${data[selected].label}: ${formatValue(data[selected].value)}` : ""}
      </Text>
      {width > 0 ? (
        <Svg height={height} width={width}>
          {yTicks(max).map((tick) => (
            <View key={tick}>
              <Line stroke={colors.neutral[200]} strokeWidth={1} x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} />
              <SvgText fill={colors.neutral[500]} fontSize={10} textAnchor="end" x={LEFT - 6} y={y(tick) + 3}>
                {formatTick(tick)}
              </SvgText>
            </View>
          ))}
          {data.map((d, i) => {
            const barHeight = (d.value / max) * plotHeight;
            const x = LEFT + i * slot + (slot - barWidth) / 2;
            const select = () => setSelected(selected === i ? null : i);

            return (
              <View key={d.key}>
                <Path d={barPath(x, y(d.value), barWidth, barHeight, 4)} fill={i === peak ? color : (mutedColor ?? color)} />
                {/* Hit target wider than the mark so thin bars stay tappable. */}
                <Rect fill="transparent" height={plotHeight} onPress={select} testID={`${testID}-bar-${i}`} width={slot} x={LEFT + i * slot} y={TOP} />
                {i % labelStep === 0 ? (
                  <SvgText fill={colors.neutral[500]} fontSize={10} textAnchor="middle" x={LEFT + i * slot + slot / 2} y={height - 6}>
                    {d.label}
                  </SvgText>
                ) : null}
              </View>
            );
          })}
          {data[peak] && data[peak].value > 0 ? (
            <SvgText fill={colors.neutral[700]} fontSize={10} fontWeight="600" textAnchor="middle" x={LEFT + peak * slot + slot / 2} y={y(data[peak].value) - 4}>
              {formatValue(data[peak].value)}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
```
(React Native SVG renders `View` wrappers inside `Svg` incorrectly on native; use `G` from `react-native-svg` instead of `View` for grouping — replace the two `<View key=…>` with `<G key=…>` and import `G`.)

`DonutChart.tsx`:
```tsx
import type { LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

import { colors } from "../../lib/design/colors";
import { donutArcs } from "./geometry";

export type DonutSlice = { color: string; icon?: LucideIcon; key: string; label: string; value: number };

type Props = { centerLabel: string; centerValue: string; size?: number; slices: DonutSlice[]; testID: string };

export function DonutChart({ centerLabel, centerValue, size = 180, slices, testID }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const outer = size / 2 - 2;
  const inner = outer * 0.62;
  const arcs = donutArcs(slices.map((s) => s.value), { cx: size / 2, cy: size / 2, gapPx: 2, inner, outer });

  return (
    <View className="items-center gap-4" testID={testID}>
      <View style={{ height: size, width: size }}>
        <Svg height={size} width={size}>
          {total === 0 ? (
            <Circle cx={size / 2} cy={size / 2} fill="none" r={(outer + inner) / 2} stroke={colors.neutral[200]} strokeWidth={outer - inner} />
          ) : (
            <G>{arcs.map((arc) => <Path d={arc.d} fill={slices[arc.index].color} key={slices[arc.index].key} testID={`${testID}-slice-${slices[arc.index].key}`} />)}</G>
          )}
        </Svg>
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <Text className="text-4xl font-display-bold text-ink">{centerValue}</Text>
          <Text className="text-xs font-sans text-neutral-600">{centerLabel}</Text>
        </View>
      </View>
      <View className="w-full gap-2">
        {slices.map((slice) => {
          const Icon = slice.icon;

          return (
            <View className="flex-row items-center gap-2" key={slice.key}>
              <View className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
              {Icon ? <Icon color={colors.neutral[600]} size={16} /> : null}
              <Text className="flex-1 text-sm font-sans text-ink">{slice.label}</Text>
              <Text className="text-sm font-sans-medium text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>
                {total > 0 ? `${slice.value} · ${Math.round((slice.value / total) * 100)}%` : String(slice.value)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
```
`ChartSection.tsx`:
```tsx
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Card } from "../ui/Card";

type Props = { children: ReactNode; rows: Array<{ label: string; value: string }>; testID: string; title: string };

export function ChartSection({ children, rows, testID, title }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Card testID={testID}>
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{title}</Text>
        {children}
        <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} testID={`${testID}-toggle`}>
          <Text className="text-sm font-sans-semibold text-primary-600">{open ? t("barber.reports.hideData") : t("barber.reports.showData")}</Text>
        </Pressable>
        {open ? (
          <View className="gap-1">
            {rows.map((row) => (
              <View className="flex-row justify-between" key={row.label}>
                <Text className="text-sm font-sans text-neutral-700">{row.label}</Text>
                <Text className="text-sm font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
```
Strings `barber.reports.showData` ("Show data" / "Ver dados" / "Ver datos") and `hideData` ("Hide data" / "Ocultar dados" / "Ocultar datos") in the 3 locales (new `reports` group inside `barber`). Check `Card` accepts `testID`; if not, wrap in a `View testID`.

- [ ] **Step 5: Run** — `rtk npx jest tests/unit/chart-geometry.test.ts tests/unit/charts.test.ts tests/unit/locale-parity.test.ts --forceExit && rtk npm run typecheck && npx eslint src tests` → PASS. (If `react-native-svg` needs a Jest mock, follow how existing tests render it; otherwise add a minimal `jest.mock("react-native-svg", …)` in the test file returning host components.)

- [ ] **Step 6: Commit** — `feat(charts): column and donut charts with a data table toggle`.

---

### Task 4: The Reports screen

**Files:** Modify `app/(barber)/earnings.tsx` (rewrite), `src/i18n/locales/{en,es,pt}.ts` (`barber.reports`, `tabs.earnings`, remove `barber.earnings`), `tests/e2e/barber-side.web.spec.ts` (delete the two old earnings tests); Create `tests/e2e/barber-reports.web.spec.ts`.

**Interfaces:** Consumes `getMyBarberReport`, `build-report` helpers, the chart components, `getMyBarberProfile`, `formatPriceBRL`, `StatTile`, `EmptyState`, `formatWeekdayShort`, `useLanguage`.

- [ ] **Step 1: Strings** — group `barber.reports` (en / pt / es):
`title` Reports / Relatórios / Informes · `periodWeek` Last 7 days / Últimos 7 dias / Últimos 7 días · `periodMonth` This month / Este mês / Este mes · `periodQuarter` Last 90 days / Últimos 90 dias / Últimos 90 días · `earned` Your earnings / Seus ganhos / Tus ganancias · `completed` Completed / Concluídos / Completados · `cancellationRate` Cancellation rate / Taxa de cancelamento / Tasa de cancelación · `cancellationHint` "{{count}} cancelled or missed" / "{{count}} cancelados ou faltas" / "{{count}} cancelados o ausencias" · `rentDue` Chair rent / Aluguel da cadeira / Alquiler de silla · `vsPrevious` vs previous period / vs período anterior / vs período anterior · `noPrevious` No previous data / Sem dados anteriores / Sin datos anteriores · `earningsByDay` Earnings by day / Ganhos por dia / Ganancias por día · `earningsByWeek` Earnings by week / Ganhos por semana / Ganancias por semana · `byOutcome` Appointments by outcome / Atendimentos por situação / Citas por resultado · `outcomeCompleted` Completed / Concluídos / Completados · `outcomeCancelled` Cancelled / Cancelados / Cancelados · `outcomeNoShow` Missed / Faltas / Ausencias · `topServices` Most done services / Serviços mais feitos / Servicios más realizados · `other` Other / Outros / Otros · `weekdays` Busiest weekdays / Dias da semana mais cheios / Días de la semana más ocupados · `total` total / total / total · `empty` No appointments in this period. / Sem atendimentos neste período. / Sin citas en este período. · `loadError` Unable to load your reports. / Não foi possível carregar seus relatórios. / No se pudieron cargar tus informes. · `note` Report only. Payments happen outside the app. / Só relatório. Os pagamentos acontecem fora do app. / Solo informe. Los pagos ocurren fuera de la app. (+ `showData`/`hideData` from Task 3). `tabs.earnings` becomes Reports / Relatórios / Informes. Remove the old `barber.earnings` group.

- [ ] **Step 2: Failing e2e** — `tests/e2e/barber-reports.web.spec.ts`: copy `signIn`, `barberProfile` (switch `commission_percent` to `"40.00"` as the booking spec) and `mockBarberRest` from `tests/e2e/barber-booking.web.spec.ts`; delete the two old earnings tests from `barber-side.web.spec.ts`. Tests:
```ts
const day = (date: string, over: Record<string, number> = {}) => ({ cancelled: 0, completed: 0, date, earnings_cents: 0, no_show: 0, upcoming: 0, ...over });

test("the reports tab shows the barber's own numbers, charts and no revenue", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_report")) {
      const body = route.request().postDataJSON() as Record<string, string>;
      requests.push(body);
      const current = requests.length % 2 === 1; // current period is requested first, then the previous one
      return json(route, current
        ? { days: [day("2026-10-01", { cancelled: 1, completed: 3, earnings_cents: 6000, no_show: 1 })], services: [{ completed: 2, name: "Browser Cut", service_id: "s1" }, { completed: 1, name: "Beard", service_id: "s2" }] }
        : { days: [day("2026-09-30", { completed: 2, earnings_cents: 4000 })], services: [] }).then(() => true);
    }
  });

  await page.goto("/earnings");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByTestId("stat-earned")).toContainText("R$ 60,00");
  await expect(page.getByTestId("stat-earned")).toContainText("+50%");
  await expect(page.getByTestId("stat-completed")).toContainText("3");
  await expect(page.getByTestId("stat-cancellation")).toContainText("40%");
  await expect(page.getByTestId("chart-earnings")).toBeVisible();
  await expect(page.getByTestId("donut-outcome")).toContainText("Cancelled");
  await expect(page.getByTestId("donut-services")).toContainText("Browser Cut");
  await expect(page.getByTestId("chart-weekdays")).toBeVisible();
  await expect(page.getByText(/Revenue|Faturamento/)).toHaveCount(0);

  await page.getByTestId("earnings-period-quarter").click();
  await expect.poll(() => requests.some((r) => r.period_start !== requests[0].period_start)).toBe(true);
});

test("an empty period shows the empty state instead of charts", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_report")) return json(route, { days: [], services: [] }).then(() => true);
  });

  await page.goto("/earnings");
  await expect(page.getByText("No appointments in this period.")).toBeVisible();
  await expect(page.getByTestId("donut-outcome")).toHaveCount(0);
});

test("a chair-rental barber also sees the rent tile", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ ...barberProfile, chair_rental_amount_cents: 30000, chair_rental_frequency: "monthly", commission_percent: "0.00", compensation_type: "chair_rental" }]).then(() => true);
    }
    if (url.pathname.endsWith("/rpc/get_my_barber_report")) return json(route, { days: [day("2026-10-01", { completed: 1, earnings_cents: 4000 })], services: [] }).then(() => true);
  });

  await page.goto("/earnings");
  await expect(page.getByTestId("stat-rent")).toContainText("R$ 300,00");
});
```
Run (own Metro on 4173, `EXPO_NO_DOTENV=1`, then `PLAYWRIGHT_TEST_BASE_URL=http://localhost:4173 npx playwright test tests/e2e/barber-reports.web.spec.ts`) → FAIL.

- [ ] **Step 3: Implement `app/(barber)/earnings.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, UserX, XCircle } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ChartSection } from "../../src/components/charts/ChartSection";
import { ColumnChart } from "../../src/components/charts/ColumnChart";
import { DonutChart } from "../../src/components/charts/DonutChart";
import { SERVICE_SLICE_COLORS } from "../../src/components/charts/geometry";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { StatTile } from "../../src/components/domain/StatTile";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { getMyBarberProfile } from "../../src/features/barbers/api";
import { dailySeries, percentChange, previousRange, sumDays, topServices, weekdayCounts, WEEKLY_THRESHOLD_DAYS, daysBetween } from "../../src/features/reports/build-report";
import { getMyBarberReport } from "../../src/features/reports/api";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { colors } from "../../src/lib/design/colors";
import { addLocalDays } from "../../src/lib/dates/calendar-strip-days";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatWeekdayShort } from "../../src/lib/i18n/format";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type Period = "month" | "quarter" | "week";

function rangeFor(period: Period, today: string) {
  if (period === "week") return { end: today, start: addLocalDays(today, -6) };
  if (period === "quarter") return { end: today, start: addLocalDays(today, -89) };

  return { end: today, start: `${today.slice(0, 8)}01` };
}

const WEEKDAY_REFERENCE = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-06", "2024-01-07"]; // Monday to Sunday

export default function BarberReportsScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { profile, supabase } = useSupabaseSession();
  const [period, setPeriod] = useState<Period>("month");
  const today = formatInstantInShopTime(new Date()).localDate;
  const range = useMemo(() => rangeFor(period, today), [period, today]);
  const previous = useMemo(() => previousRange(range.start, range.end), [range]);

  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const current = useQuery({ queryFn: () => getMyBarberReport(supabase, range.start, range.end), queryKey: ["barber-report", range.start, range.end] });
  const before = useQuery({ queryFn: () => getMyBarberReport(supabase, previous.start, previous.end), queryKey: ["barber-report", previous.start, previous.end] });

  const report = current.data;
  const totals = report ? sumDays(report.days) : null;
  const previousTotals = before.data ? sumDays(before.data.days) : null;
  const delta = (now: number, was: number | undefined) => {
    const change = was === undefined ? null : percentChange(now, was);

    return change === null ? t("barber.reports.noPrevious") : `${change > 0 ? "+" : ""}${change}% ${t("barber.reports.vsPrevious")}`;
  };
  const hasActivity = totals ? totals.completed + totals.cancelled + totals.noShow + totals.upcoming > 0 : false;

  const grouped = daysBetween(range.start, range.end) > WEEKLY_THRESHOLD_DAYS;
  const earningsSeries = report ? dailySeries(report.days, range.start, range.end, (d) => d.earningsCents) : [];
  const earningsData = earningsSeries.map((p) => ({
    key: p.key,
    label: grouped ? `${p.from.slice(8)}/${p.from.slice(5, 7)}` : earningsSeries.length <= 8 ? formatWeekdayShort(p.from, language) : p.from.slice(8),
    value: p.value,
  }));
  const weekdayData = report ? weekdayCounts(report.days).map((value, i) => ({ key: WEEKDAY_REFERENCE[i], label: formatWeekdayShort(WEEKDAY_REFERENCE[i], language), value })) : [];
  const serviceItems = report ? topServices(report.services) : [];
  const money = (cents: number) => formatPriceBRL(cents);

  const compensation = barber.data?.compensation;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("barber.reports.title")}</Text>
          <View className="w-full max-w-[420px] flex-row flex-wrap gap-2">
            {(["week", "month", "quarter"] as const).map((key) => (
              <Button
                key={key}
                label={t(`barber.reports.period${key === "week" ? "Week" : key === "month" ? "Month" : "Quarter"}`)}
                onPress={() => setPeriod(key)}
                size="sm"
                testID={`earnings-period-${key}`}
                variant={period === key ? "dark" : "outline"}
              />
            ))}
          </View>

          <View className="w-full max-w-[420px] gap-3">
            {current.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {current.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(current.error, t, t("barber.reports.loadError"))}</Text> : null}
            {report && totals ? (
              <>
                <View className="flex-row flex-wrap gap-3">
                  <StatTile label={t("barber.reports.earned")} sublabel={delta(totals.earningsCents, previousTotals?.earningsCents)} testID="stat-earned" value={money(totals.earningsCents)} />
                  <StatTile label={t("barber.reports.completed")} sublabel={delta(totals.completed, previousTotals?.completed)} testID="stat-completed" value={String(totals.completed)} />
                  <StatTile
                    label={t("barber.reports.cancellationRate")}
                    sublabel={t("barber.reports.cancellationHint", { count: totals.cancelled + totals.noShow })}
                    testID="stat-cancellation"
                    value={totals.cancellationRate === null ? "—" : `${Math.round(totals.cancellationRate * 100)}%`}
                  />
                  {compensation?.type === "chair_rental" ? (
                    <StatTile label={t("barber.reports.rentDue")} sublabel={t(`barber.frequency.${compensation.frequency}`)} testID="stat-rent" value={money(compensation.amountCents)} />
                  ) : null}
                </View>

                {!hasActivity ? <EmptyState title={t("barber.reports.empty")} /> : null}
                {hasActivity ? (
                  <>
                    <ChartSection rows={earningsData.filter((d) => d.value > 0).map((d) => ({ label: d.label, value: money(d.value) }))} testID="section-earnings" title={t(grouped ? "barber.reports.earningsByWeek" : "barber.reports.earningsByDay")}>
                      <ColumnChart accessibilityLabel={t("barber.reports.earned")} data={earningsData} formatTick={(v) => (v === 0 ? "0" : String(Math.round(v / 100)))} formatValue={money} testID="chart-earnings" />
                    </ChartSection>

                    <ChartSection
                      rows={[
                        { label: t("barber.reports.outcomeCompleted"), value: String(totals.completed) },
                        { label: t("barber.reports.outcomeCancelled"), value: String(totals.cancelled) },
                        { label: t("barber.reports.outcomeNoShow"), value: String(totals.noShow) },
                      ]}
                      testID="section-outcome"
                      title={t("barber.reports.byOutcome")}
                    >
                      <DonutChart
                        centerLabel={t("barber.reports.total")}
                        centerValue={String(totals.completed + totals.cancelled + totals.noShow)}
                        slices={[
                          { color: colors.success[500], icon: CheckCircle2, key: "completed", label: t("barber.reports.outcomeCompleted"), value: totals.completed },
                          { color: colors.danger[500], icon: XCircle, key: "cancelled", label: t("barber.reports.outcomeCancelled"), value: totals.cancelled },
                          { color: colors.warning[500], icon: UserX, key: "no_show", label: t("barber.reports.outcomeNoShow"), value: totals.noShow },
                        ]}
                        testID="donut-outcome"
                      />
                    </ChartSection>

                    {serviceItems.length > 0 ? (
                      <ChartSection rows={serviceItems.map((s) => ({ label: s.key === "other" ? t("barber.reports.other") : s.name, value: String(s.value) }))} testID="section-services" title={t("barber.reports.topServices")}>
                        <DonutChart
                          centerLabel={t("barber.reports.completed")}
                          centerValue={String(totals.completed)}
                          slices={serviceItems.map((s, i) => ({
                            color: s.key === "other" ? colors.neutral[300] : SERVICE_SLICE_COLORS[i % SERVICE_SLICE_COLORS.length],
                            key: s.key,
                            label: s.key === "other" ? t("barber.reports.other") : s.name,
                            value: s.value,
                          }))}
                          testID="donut-services"
                        />
                      </ChartSection>
                    ) : null}

                    <ChartSection rows={weekdayData.map((d) => ({ label: d.label, value: String(d.value) }))} testID="section-weekdays" title={t("barber.reports.weekdays")}>
                      <ColumnChart accessibilityLabel={t("barber.reports.weekdays")} color={colors.primary[500]} data={weekdayData} formatValue={(v) => String(v)} mutedColor={colors.primary[200]} testID="chart-weekdays" />
                    </ChartSection>
                  </>
                ) : null}
              </>
            ) : null}
            <Text className="text-xs font-sans text-neutral-500">{t("barber.reports.note")}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```
(The weekday labels use `formatWeekdayShort`; if a chart label row does not fit, the component's `labelStep` already thins labels.)

- [ ] **Step 4: Verify** — `rtk npm run typecheck && npx eslint app src tests && rtk npx jest --runInBand --forceExit` (including `no-hardcoded-text`, `locale-parity`, `route-collisions`) and the new Playwright spec → PASS.

- [ ] **Step 5: Commit** — `feat(barber): reports screen with earnings, outcome and service charts`.

---

### Task 5: Verification, review and PR

- [ ] **Step 1:** full checks: typecheck, eslint, `jest --runInBand --forceExit`, `rtk npm run test:db` (known local-only `010_full_rls` failures), e2e runner (known: 4 date-dependent failures).
- [ ] **Step 2: Real browser.** Copy `.env.local`, start Metro (`npx expo start --web --port 8083`), insert throwaway appointments for `Barber Teste` (`a2000000-0000-0000-0000-000000000003`) over the last weeks with all statuses via SQL (ids prefixed `ac9…`), log in as `barber@teste.com`, and check with screenshots + `getComputedStyle`/DOM: tiles, the three periods (week/month/90 days → weekly grouping), column widths ≤ 24px, donut hole text and legend, "Show data" toggles, empty state (switch to a period without data), no "Revenue" text. Delete the throwaway rows, stop servers by PID, remove `.env.local`.
- [ ] **Step 3:** self-review the diff (RPC returns no gross, only the caller's rows, `security definer` with fixed `search_path`).
- [ ] **Step 4:** push `feat-barber-reports`, open a PR (REST) with base `feat-barber-profile`, body in Portuguese (summary, migration 0036 note, verification, that gross revenue is intentionally owner-only and an owner report is a follow-up), ending with the 🤖 line.
- [ ] **Step 5:** update `project_barber_booking.md` memory (PR number, status, owner shop-wide report queued; "My customers"/day summary still queued).

---

## Self-Review

**Spec coverage:** RPC with per-day counts and own earnings, no gross → T1; pure logic (ranges, totals, deltas, series, weekday, top services) and API → T2; `ColumnChart`/`DonutChart`/data toggle with validated colours → T3; screen with KPI tiles + deltas, four charts, empty state, rent tile, tab label, removal of revenue strings → T4; testing, browser check, PR → T5. Out-of-scope items (owner report, My customers, day summary) are not implemented.

**Placeholder scan:** the donut palette is fixed in T3 Step 1 by running the validator (the code ships a reference list and says to replace it with the validated one); no other open items.

**Type consistency:** `ReportDay`/`ReportService`/`BarberReport` and the jsonb keys (`earnings_cents`, `no_show`, `service_id`) match across SQL, API, tests and screen; `ColumnDatum`, `DonutSlice`, `SERVICE_SLICE_COLORS`, `WEEKLY_THRESHOLD_DAYS` and test IDs (`stat-earned`, `stat-completed`, `stat-cancellation`, `stat-rent`, `chart-earnings`, `donut-outcome`, `donut-services`, `chart-weekdays`, `earnings-period-*`, `*-toggle`) are consistent.
