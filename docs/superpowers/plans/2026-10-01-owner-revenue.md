# Owner Revenue Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Revenue" screen for the shop owner: gross revenue, barber share, shop income (with estimated chair rent), per-day/barber/service/outcome charts and a per-barber table, compared with the previous period.

**Architecture:** One owner-only jsonb RPC; pure aggregation helpers; the barber-report chart components reused (`DonutChart` gains a money formatter); a new screen `app/(owner)/revenue.tsx` linked from the owner hub.

**Tech Stack:** Supabase/Postgres + pgTAP, `react-native-svg` charts, Expo Router, TanStack Query, i18next (en/es/pt), Jest + Testing Library, Playwright (REST mocked).

**Spec:** `docs/superpowers/specs/2026-10-01-owner-revenue-design.md`

## Global Constraints

- Worktree `/home/samuel/projects/barberschedule/.claude/worktrees/owner-revenue`, branch `feat-owner-revenue`, stacked on `feat-barber-clients` (#23). Migration `0038`, pgTAP `023` (UUID prefix `ae`). Local Supabase only; `node_modules` symlinked.
- Shop revenue is owner-only: the RPC rejects anyone who is not the owner of a shop (`P0029` = `REPORT_FORBIDDEN`), `P0022` for a bad range. No customer data in the payload.
- Money rules: revenue = completed price snapshots; commission barber share = `round(gross × percent / 100)`; chair-rental barber share = gross; rent estimate = `round(amount × days ÷ 7)` weekly / `round(amount × days ÷ 30)` monthly; shop income = revenue − barber share + rent estimate. The screen labels rent an estimate.
- Chart rules from the barber reports apply (bars ≤ 24px, donut hole with total, legends, "Show data"). Strict TDD; Jest with `--forceExit`; kill processes by PID (never `pkill -f`); `rtk` for raw-read shell output. E2E needs no `.env.local` in the worktree; the real-browser check needs it (copy, then remove). New route files need a Metro restart.

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0038_owner_shop_report.sql`, `supabase/tests/023_owner_shop_report.sql` | RPC + pgTAP |
| `src/features/owner-reports/{api,build}.ts` | client + pure aggregation |
| `src/features/reports/build-report.ts` | `dailySeries` made generic |
| `src/components/charts/DonutChart.tsx` | optional `formatValue` |
| `app/(owner)/revenue.tsx`, `app/index.tsx` | the screen and its hub link |
| `src/lib/errors/domain-errors.ts`, `src/i18n/locales/*.ts` | `REPORT_FORBIDDEN`, strings |
| tests: `tests/unit/owner-report-build.test.ts`, `tests/integration/owner-report.test.ts`, `tests/unit/charts.test.ts` (extended), `tests/e2e/owner-revenue.web.spec.ts` | |

---

### Task 1: The shop report RPC

**Files:** Create `supabase/migrations/0038_owner_shop_report.sql`, `supabase/tests/023_owner_shop_report.sql`.

**Interfaces:** Produces `public.get_shop_report(period_start date, period_end date) returns jsonb` exactly as in the spec.

- [ ] **Step 1: Failing pgTAP test** — `supabase/tests/023_owner_shop_report.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't23-owner1@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't23-owner2@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't23-barber@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't23-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id in ('ae000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-000000000002');
update public.profiles set role = 'barber' where user_id = 'ae000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id, timezone)
values
  ('ae100000-0000-0000-0000-000000000001', 'T23 Shop 1', 'ae000000-0000-0000-0000-000000000001', 'America/Sao_Paulo'),
  ('ae100000-0000-0000-0000-000000000002', 'T23 Shop 2', 'ae000000-0000-0000-0000-000000000002', 'America/Sao_Paulo');

-- shop 1: A commission 40, B chair weekly 7000, D chair monthly 30000 (idle), C commission 50 inactive and idle; shop 2: E
insert into public.barbers (id, shop_id, user_id, name, active, archived_at, compensation_type, commission_percent, chair_rental_amount_cents, chair_rental_frequency)
values
  ('ae200000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-000000000003', 'Barber A', true, null, 'commission', 40, null, null),
  ('ae200000-0000-0000-0000-000000000002', 'ae100000-0000-0000-0000-000000000001', null, 'Barber B', true, null, 'chair_rental', 0, 7000, 'weekly'),
  ('ae200000-0000-0000-0000-000000000003', 'ae100000-0000-0000-0000-000000000001', null, 'Barber C', false, now(), 'commission', 50, null, null),
  ('ae200000-0000-0000-0000-000000000004', 'ae100000-0000-0000-0000-000000000001', null, 'Barber D', true, null, 'chair_rental', 0, 30000, 'monthly'),
  ('ae200000-0000-0000-0000-000000000005', 'ae100000-0000-0000-0000-000000000002', null, 'Barber E', true, null, 'commission', 10, null, null);

insert into public.customers (id, shop_id, full_name, email)
values
  ('ae300000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000001', 'T23 Customer 1', 't23-c1@example.com'),
  ('ae300000-0000-0000-0000-000000000002', 'ae100000-0000-0000-0000-000000000002', 'T23 Customer 2', 't23-c2@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values
  ('ae400000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000001', 'Cut', 30, 4000),
  ('ae400000-0000-0000-0000-000000000002', 'ae100000-0000-0000-0000-000000000001', 'Beard', 30, 3000),
  ('ae400000-0000-0000-0000-000000000003', 'ae100000-0000-0000-0000-000000000001', 'Pro Cut', 30, 5000),
  ('ae400000-0000-0000-0000-000000000004', 'ae100000-0000-0000-0000-000000000002', 'Cut', 30, 9999);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('ae500000-0000-0000-0000-000000000001', 'ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000001', 'ae400000-0000-0000-0000-000000000001'),
  ('ae500000-0000-0000-0000-000000000002', 'ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000001', 'ae400000-0000-0000-0000-000000000002'),
  ('ae500000-0000-0000-0000-000000000003', 'ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000002', 'ae400000-0000-0000-0000-000000000003'),
  ('ae500000-0000-0000-0000-000000000004', 'ae100000-0000-0000-0000-000000000002', 'ae200000-0000-0000-0000-000000000005', 'ae400000-0000-0000-0000-000000000004');

create function pg_temp.appt(shop uuid, barber uuid, customer uuid, service_name text, price integer, status public.appointment_status, back integer, hours integer default 0)
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    shop, barber, customer, bs.id, bs.service_id,
    ((current_date - back)::timestamp + interval '15 hours' + hours * interval '1 hour') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes' + hours * interval '1 hour') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes' + hours * interval '1 hour') at time zone 'UTC',
    status, service_name, 30, price, 0
  from public.barber_services bs
  join public.services s on s.id = bs.service_id
  where bs.barber_id = barber and s.name = service_name
$$;

select pg_temp.appt('ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000001', 'ae300000-0000-0000-0000-000000000001', 'Cut', 4000, 'completed', 2, 0);
select pg_temp.appt('ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000001', 'ae300000-0000-0000-0000-000000000001', 'Beard', 3000, 'completed', 2, 1);
select pg_temp.appt('ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000002', 'ae300000-0000-0000-0000-000000000001', 'Pro Cut', 5000, 'completed', 2, 0);
select pg_temp.appt('ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000001', 'ae300000-0000-0000-0000-000000000001', 'Cut', 4000, 'completed', 1, 0);
select pg_temp.appt('ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000001', 'ae300000-0000-0000-0000-000000000001', 'Cut', 4000, 'cancelled', 1, 1);
select pg_temp.appt('ae100000-0000-0000-0000-000000000001', 'ae200000-0000-0000-0000-000000000001', 'ae300000-0000-0000-0000-000000000001', 'Beard', 3000, 'no_show', 1, 2);
select pg_temp.appt('ae100000-0000-0000-0000-000000000002', 'ae200000-0000-0000-0000-000000000005', 'ae300000-0000-0000-0000-000000000002', 'Cut', 9999, 'completed', 2, 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('t23.r', public.get_shop_report(current_date - 6, current_date)::text, false);

select is((select (d ->> 'completed')::int from jsonb_array_elements(current_setting('t23.r')::jsonb -> 'days') d where d ->> 'date' = (current_date - 2)::text), 3, 'completed appointments of all barbers are counted per day');
select is((select (d ->> 'gross_cents')::int from jsonb_array_elements(current_setting('t23.r')::jsonb -> 'days') d where d ->> 'date' = (current_date - 2)::text), 12000, 'gross revenue is the sum of completed price snapshots');
select is((select (d ->> 'cancelled')::int * 10 + (d ->> 'no_show')::int from jsonb_array_elements(current_setting('t23.r')::jsonb -> 'days') d where d ->> 'date' = (current_date - 1)::text), 11, 'cancelled and no-show are counted separately');
select is((select (b ->> 'barber_share_cents')::int from jsonb_array_elements(current_setting('t23.r')::jsonb -> 'barbers') b where b ->> 'name' = 'Barber A'), 4400, 'a commission barber keeps their percentage of what they billed');
select is(
  (select (b ->> 'barber_share_cents') || ':' || (b ->> 'rent_estimate_cents') from jsonb_array_elements(current_setting('t23.r')::jsonb -> 'barbers') b where b ->> 'name' = 'Barber B'),
  '5000:7000', 'a weekly chair-rental barber keeps everything and owes a prorated rent'
);
select is(
  (select (b ->> 'rent_estimate_cents')::int from jsonb_array_elements(current_setting('t23.r')::jsonb -> 'barbers') b where b ->> 'name' = 'Barber D'),
  7000, 'a monthly rent is prorated by days over 30, even with no appointments'
);
select is(jsonb_array_length(current_setting('t23.r')::jsonb -> 'barbers'), 3, 'an inactive barber without activity is not listed');
select is(
  (current_setting('t23.r')::jsonb -> 'services' -> 0 ->> 'name') || ':' || (current_setting('t23.r')::jsonb -> 'services' -> 0 ->> 'gross_cents'),
  'Cut:8000', 'services are ordered by gross revenue'
);
select ok(not (current_setting('t23.r') ~* 'customer|email'), 'the payload carries no customer data');
select is(
  (select sum((d ->> 'gross_cents')::int)::int from jsonb_array_elements(current_setting('t23.r')::jsonb -> 'days') d),
  16000, 'another shop''s revenue never leaks in'
);
select is(
  (select sum((d ->> 'gross_cents')::int)::int from jsonb_array_elements(public.get_shop_report(current_date - 6, current_date) -> 'days') d where false),
  null::int, 'sanity: an empty aggregate is null'
);

select throws_ok($$ select public.get_shop_report(current_date - 100, current_date) $$, 'P0022', null, 'a range over 92 days is rejected');
select throws_ok($$ select public.get_shop_report(current_date, current_date - 1) $$, 'P0022', null, 'an inverted range is rejected');

select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.get_shop_report(current_date - 6, current_date) $$, 'P0029', null, 'a barber cannot read the shop report');

select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000002', true);
select is(
  (select sum((d ->> 'gross_cents')::int)::int from jsonb_array_elements(public.get_shop_report(current_date - 6, current_date) -> 'days') d),
  9999, 'each owner sees only their own shop'
);

select * from finish();
rollback;
```
(The sanity assertion on an empty aggregate is a placeholder-free no-op check; if the executor prefers, replace it with `jsonb_array_length(public.get_shop_report(current_date - 200, current_date - 190) -> 'days') = 0` for the empty-range case, and adjust `plan(n)` to the final number of assertions.)

- [ ] **Step 2: Run to fail** — `rtk npx supabase test db supabase/tests/023_owner_shop_report.sql` → FAIL (function missing).

- [ ] **Step 3: Migration** — `supabase/migrations/0038_owner_shop_report.sql`

```sql
create function public.get_shop_report(period_start date, period_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  range_start timestamptz;
  range_end timestamptz;
  period_days integer;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;
  if period_end < period_start or period_end - period_start > 91 then
    raise exception using errcode = 'P0022', message = 'EARNINGS_INVALID_RANGE';
  end if;

  period_days := period_end - period_start + 1;
  range_start := period_start::timestamp at time zone sh.timezone;
  range_end := (period_end + 1)::timestamp at time zone sh.timezone;

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d."date")
      from (
        select
          (a.starts_at at time zone sh.timezone)::date as "date",
          (count(*) filter (where a.status = 'completed'))::int as completed,
          coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)::int as gross_cents,
          (count(*) filter (where a.status = 'cancelled'))::int as cancelled,
          (count(*) filter (where a.status = 'no_show'))::int as no_show,
          (count(*) filter (where a.status in ('scheduled', 'confirmed')))::int as upcoming
        from public.appointments a
        where a.shop_id = sh.id and a.starts_at >= range_start and a.starts_at < range_end
        group by 1
      ) d
    ), '[]'::jsonb),
    'barbers', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.gross_cents desc, b.name)
      from (
        select
          br.id as barber_id,
          br.name,
          br.compensation_type::text as compensation_type,
          (count(a.id) filter (where a.status = 'completed'))::int as completed,
          coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)::int as gross_cents,
          (case
            when br.compensation_type = 'commission'
              then round(coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0) * br.commission_percent / 100)
            else coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)
          end)::int as barber_share_cents,
          (case
            when br.compensation_type = 'chair_rental'
              then round(br.chair_rental_amount_cents::numeric * period_days / (case when br.chair_rental_frequency = 'weekly' then 7 else 30 end))
            else 0
          end)::int as rent_estimate_cents
        from public.barbers br
        left join public.appointments a
          on a.barber_id = br.id and a.starts_at >= range_start and a.starts_at < range_end
        where br.shop_id = sh.id
        group by br.id
        having br.active or count(a.id) > 0
      ) b
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.gross_cents desc, s.name)
      from (
        select
          a.service_id,
          a.service_name_snapshot as name,
          count(*)::int as completed,
          sum(a.service_price_cents_snapshot)::int as gross_cents
        from public.appointments a
        where a.shop_id = sh.id and a.status = 'completed' and a.starts_at >= range_start and a.starts_at < range_end
        group by a.service_id, a.service_name_snapshot
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_shop_report(date, date) from public, anon;
grant execute on function public.get_shop_report(date, date) to authenticated;
```

- [ ] **Step 4: Apply and run** — `rtk npx supabase migration up && rtk npx supabase test db supabase/tests/023_owner_shop_report.sql supabase/tests/021_barber_report.sql supabase/tests/007_owner_booking.sql` → pass (fix `plan(n)` to the real count if needed).
- [ ] **Step 5: Commit** — `feat(db): owner shop revenue report RPC`.

---

### Task 2: Client, aggregation helpers and chart tweaks

**Files:** Create `src/features/owner-reports/build.ts`, `src/features/owner-reports/api.ts`; modify `src/features/reports/build-report.ts` (generic `dailySeries`), `src/components/charts/DonutChart.tsx` (`formatValue`), `src/lib/errors/domain-errors.ts`, `src/i18n/locales/*.ts` (error code); tests `tests/unit/owner-report-build.test.ts`, `tests/integration/owner-report.test.ts`, `tests/unit/charts.test.ts` (one new case).

**Interfaces:**
```ts
export type ShopDay = { cancelled: number; completed: number; date: string; grossCents: number; noShow: number; upcoming: number };
export type ShopBarber = { barberId: string; barberShareCents: number; compensationType: "chair_rental" | "commission"; completed: number; grossCents: number; name: string; rentEstimateCents: number };
export type ShopService = { completed: number; grossCents: number; name: string; serviceId: string };
export type ShopReport = { barbers: ShopBarber[]; days: ShopDay[]; services: ShopService[] };
export type ShopTotals = { barberShareCents: number; cancelled: number; cancellationRate: number | null; completed: number; grossCents: number; noShow: number; rentEstimateCents: number; shopIncomeCents: number };
export function sumShopReport(report: ShopReport): ShopTotals;
export function barberRows(report: ShopReport): Array<ShopBarber & { shopShareCents: number }>;
export function topByValue(items: Array<{ key: string; name: string; value: number }>, max?: number): DonutItem[];
export function getShopReport(supabase: Pick<SupabaseClient, "rpc">, start: string, end: string): Promise<ShopReport>;
```
`DomainErrorCode` gains `"REPORT_FORBIDDEN"` (`P0029`).

- [ ] **Step 1: Failing tests**

`tests/unit/owner-report-build.test.ts`:
```ts
import { barberRows, sumShopReport, topByValue, type ShopReport } from "../../src/features/owner-reports/build";

const report: ShopReport = {
  barbers: [
    { barberId: "a", barberShareCents: 4400, compensationType: "commission", completed: 3, grossCents: 11000, name: "Ana", rentEstimateCents: 0 },
    { barberId: "b", barberShareCents: 5000, compensationType: "chair_rental", completed: 1, grossCents: 5000, name: "Bruno", rentEstimateCents: 7000 },
    { barberId: "d", barberShareCents: 0, compensationType: "chair_rental", completed: 0, grossCents: 0, name: "Davi", rentEstimateCents: 7000 },
  ],
  days: [
    { cancelled: 0, completed: 3, date: "2026-09-29", grossCents: 12000, noShow: 0, upcoming: 0 },
    { cancelled: 1, completed: 1, date: "2026-09-30", grossCents: 4000, noShow: 1, upcoming: 2 },
  ],
  services: [],
};

describe("sumShopReport", () => {
  it("adds up revenue, shares, rent and shop income", () => {
    expect(sumShopReport(report)).toEqual({
      barberShareCents: 9400, cancelled: 1, cancellationRate: 0.333_333_333_333_333_3, completed: 4,
      grossCents: 16000, noShow: 1, rentEstimateCents: 14000, shopIncomeCents: 20600,
    });
  });

  it("has no cancellation rate when nothing was closed", () => {
    expect(sumShopReport({ barbers: [], days: [], services: [] }).cancellationRate).toBeNull();
  });
});

describe("barberRows", () => {
  it("adds each barber's shop share: revenue minus their share plus rent", () => {
    expect(barberRows(report).map((r) => [r.name, r.shopShareCents])).toEqual([["Ana", 6600], ["Bruno", 7000], ["Davi", 7000]]);
  });
});

describe("topByValue", () => {
  const items = [
    { key: "a", name: "A", value: 50 }, { key: "b", name: "B", value: 30 }, { key: "c", name: "C", value: 20 },
    { key: "d", name: "D", value: 10 }, { key: "e", name: "E", value: 5 }, { key: "f", name: "F", value: 5 },
  ];

  it("keeps the top N by value and folds the tail into other", () => {
    const out = topByValue(items, 4);

    expect(out.map((i) => i.key)).toEqual(["a", "b", "c", "d", "other"]);
    expect(out.at(-1)).toEqual({ key: "other", name: "", value: 10 });
  });

  it("ignores zero-value items and adds no other slice when everything fits", () => {
    expect(topByValue([{ key: "a", name: "A", value: 5 }, { key: "z", name: "Z", value: 0 }], 4).map((i) => i.key)).toEqual(["a"]);
  });
});
```
`tests/integration/owner-report.test.ts`:
```ts
import { getShopReport } from "../../src/features/owner-reports/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

describe("owner shop report client", () => {
  it("maps the jsonb payload and sends the period", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        barbers: [{ barber_id: "b1", barber_share_cents: 4400, compensation_type: "commission", completed: 3, gross_cents: 11000, name: "Ana", rent_estimate_cents: 0 }],
        days: [{ cancelled: 1, completed: 3, date: "2026-10-01", gross_cents: 11000, no_show: 0, upcoming: 2 }],
        services: [{ completed: 3, gross_cents: 11000, name: "Cut", service_id: "s1" }],
      },
      error: null,
    });

    await expect(getShopReport({ rpc } as never, "2026-10-01", "2026-10-07")).resolves.toEqual({
      barbers: [{ barberId: "b1", barberShareCents: 4400, compensationType: "commission", completed: 3, grossCents: 11000, name: "Ana", rentEstimateCents: 0 }],
      days: [{ cancelled: 1, completed: 3, date: "2026-10-01", grossCents: 11000, noShow: 0, upcoming: 2 }],
      services: [{ completed: 3, grossCents: 11000, name: "Cut", serviceId: "s1" }],
    });
    expect(rpc).toHaveBeenCalledWith("get_shop_report", { period_end: "2026-10-07", period_start: "2026-10-01" });
  });

  it("rejects ranges over 92 days before calling the database", async () => {
    const rpc = jest.fn();

    await expect(getShopReport({ rpc } as never, "2026-01-01", "2026-12-31")).rejects.toMatchObject({ code: "EARNINGS_INVALID_RANGE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a non-owner to REPORT_FORBIDDEN", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0029" } });

    await expect(getShopReport({ rpc } as never, "2026-10-01", "2026-10-07")).rejects.toMatchObject({ code: "REPORT_FORBIDDEN" });
    expect(toDomainError({ code: "P0029" }).code).toBe("REPORT_FORBIDDEN");
  });
});
```
Append to `tests/unit/charts.test.ts` inside `describe("DonutChart")`:
```ts
  it("formats legend values with a custom formatter", async () => {
    const view = await render(
      React.createElement(DonutChart, { centerLabel: "total", centerValue: "R$ 100", formatValue: (n: number) => `R$ ${n}`, slices, testID: "donut" }),
    );

    expect(view.getByText("R$ 6 · 75%")).toBeTruthy();
  });
```
- [ ] **Step 2: Run to fail** — `rtk npx jest tests/unit/owner-report-build.test.ts tests/integration/owner-report.test.ts tests/unit/charts.test.ts --forceExit` → FAIL.
- [ ] **Step 3: Implement**

`build.ts`:
```ts
import type { DonutItem } from "../reports/build-report";

export type ShopDay = { cancelled: number; completed: number; date: string; grossCents: number; noShow: number; upcoming: number };
export type ShopBarber = {
  barberId: string; barberShareCents: number; compensationType: "chair_rental" | "commission"; completed: number;
  grossCents: number; name: string; rentEstimateCents: number;
};
export type ShopService = { completed: number; grossCents: number; name: string; serviceId: string };
export type ShopReport = { barbers: ShopBarber[]; days: ShopDay[]; services: ShopService[] };
export type ShopTotals = {
  barberShareCents: number; cancelled: number; cancellationRate: number | null; completed: number; grossCents: number;
  noShow: number; rentEstimateCents: number; shopIncomeCents: number;
};

export function sumShopReport(report: ShopReport): ShopTotals {
  const days = report.days.reduce(
    (sum, d) => ({ cancelled: sum.cancelled + d.cancelled, completed: sum.completed + d.completed, grossCents: sum.grossCents + d.grossCents, noShow: sum.noShow + d.noShow }),
    { cancelled: 0, completed: 0, grossCents: 0, noShow: 0 },
  );
  const barberShareCents = report.barbers.reduce((sum, b) => sum + b.barberShareCents, 0);
  const rentEstimateCents = report.barbers.reduce((sum, b) => sum + b.rentEstimateCents, 0);
  const closed = days.completed + days.cancelled + days.noShow;

  return {
    ...days,
    barberShareCents,
    cancellationRate: closed === 0 ? null : (days.cancelled + days.noShow) / closed,
    rentEstimateCents,
    shopIncomeCents: days.grossCents - barberShareCents + rentEstimateCents,
  };
}

export function barberRows(report: ShopReport) {
  return report.barbers.map((b) => ({ ...b, shopShareCents: b.grossCents - b.barberShareCents + b.rentEstimateCents }));
}

export function topByValue(items: Array<{ key: string; name: string; value: number }>, max = 4): DonutItem[] {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const head = sorted.slice(0, max).map((i) => ({ key: i.key, name: i.name, value: i.value }));
  const rest = sorted.slice(max).reduce((sum, i) => sum + i.value, 0);

  return rest > 0 ? [...head, { key: "other", name: "", value: rest }] : head;
}
```
`api.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { daysBetween } from "../reports/build-report";
import type { ShopReport } from "./build";

const MAX_REPORT_DAYS = 92;

export async function getShopReport(supabase: Pick<SupabaseClient, "rpc">, start: string, end: string): Promise<ShopReport> {
  const length = daysBetween(start, end);

  if (!(length >= 1 && length <= MAX_REPORT_DAYS)) {
    throw new DomainError("EARNINGS_INVALID_RANGE", "Choose a period of up to 92 days.");
  }

  const { data, error } = await supabase.rpc("get_shop_report", { period_end: end, period_start: start });

  if (error) {
    const domainError = toDomainError(error);
    throw domainError.code === "BOOKING_REQUEST_FAILED"
      ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the request.")
      : domainError;
  }

  const payload = (data ?? {}) as {
    barbers?: Array<{ barber_id: string; barber_share_cents: number; compensation_type: "chair_rental" | "commission"; completed: number; gross_cents: number; name: string; rent_estimate_cents: number }>;
    days?: Array<{ cancelled: number; completed: number; date: string; gross_cents: number; no_show: number; upcoming: number }>;
    services?: Array<{ completed: number; gross_cents: number; name: string; service_id: string }>;
  };

  return {
    barbers: (payload.barbers ?? []).map((b) => ({
      barberId: b.barber_id, barberShareCents: b.barber_share_cents, compensationType: b.compensation_type, completed: b.completed,
      grossCents: b.gross_cents, name: b.name, rentEstimateCents: b.rent_estimate_cents,
    })),
    days: (payload.days ?? []).map((d) => ({ cancelled: d.cancelled, completed: d.completed, date: d.date, grossCents: d.gross_cents, noShow: d.no_show, upcoming: d.upcoming })),
    services: (payload.services ?? []).map((s) => ({ completed: s.completed, grossCents: s.gross_cents, name: s.name, serviceId: s.service_id })),
  };
}
```
`build-report.ts`: `export function dailySeries<T extends { date: string }>(days: T[], start: string, end: string, pick: (day: T) => number): SeriesPoint[]`.
`DonutChart.tsx`: add `formatValue?: (value: number) => string` to `Props`, destructure with default `String`, and render `` total > 0 ? `${formatValue(slice.value)} · ${pct}%` : formatValue(slice.value) ``.
`domain-errors.ts`: `| "REPORT_FORBIDDEN"` and `case "P0029": return new DomainError("REPORT_FORBIDDEN", "Only the shop owner can see this report.");`. `errors.codes.REPORT_FORBIDDEN`: en "Only the shop owner can see this report." / pt "Só o dono da barbearia pode ver este relatório." / es "Solo el dueño de la barbería puede ver este informe."
- [ ] **Step 4: Run** — `rtk npx jest tests/unit/owner-report-build.test.ts tests/integration/owner-report.test.ts tests/unit/charts.test.ts tests/unit/build-report.test.ts tests/unit/locale-parity.test.ts --forceExit && rtk npm run typecheck && npx eslint src tests` → PASS.
- [ ] **Step 5: Commit** — `feat(owner): shop report client, aggregation and money legend`.

---

### Task 3: The Revenue screen

**Files:** Create `app/(owner)/revenue.tsx`, `tests/e2e/owner-revenue.web.spec.ts`; modify `app/index.tsx`, `src/i18n/locales/*.ts` (`owner.revenue`, `owner.hub.revenue`).

**Interfaces:** Consumes Task 2 and the existing `barber.reports.*` strings (period labels, `completed`, `cancellationRate`, `cancellationHint`, `vsPrevious`, `noPrevious`, `outcome*`, `other`, `total`, `empty`) plus `ChartSection`, `ColumnChart`, `DonutChart`, `StatTile`, `Card`, `Button`, `EmptyState`, `SkeletonBlock`. Test IDs: `revenue-period-week|month|quarter`, `stat-revenue`, `stat-shop-income`, `stat-completed`, `stat-cancellation`, `chart-revenue`, `donut-barbers`, `donut-services`, `donut-outcome`, `barber-row-<id>`.

- [ ] **Step 1: Strings.** `owner.hub.revenue`: Revenue / Faturamento / Facturación. Group `owner.revenue` (en / pt / es): `title` Revenue / Faturamento / Facturación · `revenue` Revenue / Faturamento / Facturación · `shopIncome` Shop income / Receita da barbearia / Ingreso de la barbería · `shopIncomeHint` After barber payouts, plus estimated chair rent / Após o repasse aos barbeiros, mais o aluguel de cadeira estimado / Tras los pagos a los barberos, más el alquiler de silla estimado · `byDay` Revenue by day / Faturamento por dia / Facturación por día · `byWeek` Revenue by week / Faturamento por semana / Facturación por semana · `byBarber` Revenue by barber / Faturamento por barbeiro / Facturación por barbero · `byService` Revenue by service / Faturamento por serviço / Facturación por servicio · `barbersTable` By barber / Por barbeiro / Por barbero · `colCompleted` Completed / Concluídos / Completados · `colRevenue` Revenue / Faturamento / Facturación · `colBarberShare` Barber share / Repasse / Pago al barbero · `colShopShare` Shop share / Parte da barbearia / Parte de la barbería · `rentEstimate` Chair rent (estimate) / Aluguel de cadeira (estimativa) / Alquiler de silla (estimación) · `rentNote` Chair rent is estimated: weekly × days ÷ 7, monthly × days ÷ 30. Payments are not tracked in the app. / O aluguel de cadeira é estimado: semanal × dias ÷ 7, mensal × dias ÷ 30. Os pagamentos não são registrados no app. / El alquiler de silla es una estimación: semanal × días ÷ 7, mensual × días ÷ 30. Los pagos no se registran en la app. · `loadError` Unable to load the revenue report. / Não foi possível carregar o relatório de faturamento. / No se pudo cargar el informe de facturación.
- [ ] **Step 2: Failing e2e** — `tests/e2e/owner-revenue.web.spec.ts` (owner sign-in as in `tests/e2e/owner-agenda.web.spec.ts`: fake session with an owner id, `get_current_profile` → `role: "owner"`):
```ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const ownerId = "55555555-5555-4555-8555-555555555555";

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

const report = {
  barbers: [
    { barber_id: "b1", barber_share_cents: 4400, compensation_type: "commission", completed: 3, gross_cents: 11000, name: "Ana Barber", rent_estimate_cents: 0 },
    { barber_id: "b2", barber_share_cents: 5000, compensation_type: "chair_rental", completed: 1, gross_cents: 5000, name: "Bruno Chair", rent_estimate_cents: 7000 },
  ],
  days: [{ cancelled: 1, completed: 4, date: new Date().toISOString().slice(0, 10), gross_cents: 16000, no_show: 0, upcoming: 0 }],
  services: [{ completed: 3, gross_cents: 11000, name: "Browser Cut", service_id: "s1" }, { completed: 1, gross_cents: 5000, name: "Pro Cut", service_id: "s2" }],
};

async function mockOwnerRest(page: Page, requests: Array<Record<string, unknown>> = []) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(report);
    }
    await route.abort();
  });
}

test("the owner reaches Revenue from the hub and sees totals, charts and the barber table", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page);

  await page.goto("/");
  await page.getByRole("link", { name: "Revenue" }).click();
  await expect(page).toHaveURL(/\/revenue/);

  await expect(page.getByTestId("stat-revenue")).toContainText("R$ 160,00");
  // 16000 - (4400 + 5000) + 7000 = 13600
  await expect(page.getByTestId("stat-shop-income")).toContainText("R$ 136,00");
  await expect(page.getByTestId("stat-completed")).toContainText("4");
  await expect(page.getByTestId("chart-revenue")).toBeVisible();
  await expect(page.getByTestId("donut-barbers")).toContainText("Ana Barber");
  await expect(page.getByTestId("donut-services")).toContainText("Browser Cut");
  await expect(page.getByTestId("donut-outcome")).toContainText("Cancelled");
  await expect(page.getByTestId("barber-row-b2")).toContainText("Bruno Chair");
  await expect(page.getByTestId("barber-row-b2")).toContainText("R$ 70,00");
  await expect(page.getByText(/estimated/i).first()).toBeVisible();
});

test("switching the period requests a new range", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];

  await signInAsOwner(page);
  await mockOwnerRest(page, requests);

  await page.goto("/revenue");
  await expect(page.getByTestId("stat-revenue")).toBeVisible();
  const before = requests.length;
  await page.getByTestId("revenue-period-quarter").click();
  await expect.poll(() => requests.length > before).toBe(true);
});
```
Run (own Metro on 4173, no `.env.local`; restart Metro after adding the route) → FAIL.
- [ ] **Step 3: Implement.** `app/index.tsx`: add after the agenda link
```tsx
            <Link href="/revenue" style={styles.link}>
              {t("owner.hub.revenue")}
            </Link>
```
`app/(owner)/revenue.tsx` (same structure as `app/(barber)/earnings.tsx`, owner data):
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
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { barberRows, sumShopReport, topByValue } from "../../src/features/owner-reports/build";
import { getShopReport } from "../../src/features/owner-reports/api";
import { dailySeries, daysBetween, percentChange, previousRange, WEEKLY_THRESHOLD_DAYS } from "../../src/features/reports/build-report";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { addLocalDays } from "../../src/lib/dates/calendar-strip-days";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { colors } from "../../src/lib/design/colors";
import { formatWeekdayShort } from "../../src/lib/i18n/format";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type Period = "month" | "quarter" | "week";

function rangeFor(period: Period, today: string) {
  if (period === "week") return { end: today, start: addLocalDays(today, -6) };
  if (period === "quarter") return { end: today, start: addLocalDays(today, -89) };

  return { end: today, start: `${today.slice(0, 8)}01` };
}

export default function OwnerRevenueScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const [period, setPeriod] = useState<Period>("month");
  const today = formatInstantInShopTime(new Date()).localDate;
  const range = useMemo(() => rangeFor(period, today), [period, today]);
  const previous = useMemo(() => previousRange(range.start, range.end), [range]);

  const current = useQuery({ queryFn: () => getShopReport(supabase, range.start, range.end), queryKey: ["owner-report", range.start, range.end] });
  const before = useQuery({ queryFn: () => getShopReport(supabase, previous.start, previous.end), queryKey: ["owner-report", previous.start, previous.end] });

  const report = current.data;
  const totals = report ? sumShopReport(report) : null;
  const previousTotals = before.data ? sumShopReport(before.data) : null;
  const money = (cents: number) => formatPriceBRL(cents);
  const delta = (now: number, was: number | undefined) => {
    const change = was === undefined ? null : percentChange(now, was);

    return change === null ? t("barber.reports.noPrevious") : `${change > 0 ? "+" : ""}${change}% ${t("barber.reports.vsPrevious")}`;
  };
  const hasActivity = totals ? totals.completed + totals.cancelled + totals.noShow > 0 || (report?.days.some((d) => d.upcoming > 0) ?? false) : false;

  const grouped = daysBetween(range.start, range.end) > WEEKLY_THRESHOLD_DAYS;
  const series = report ? dailySeries(report.days, range.start, range.end, (d) => d.grossCents) : [];
  const revenueData = series.map((p) => ({
    key: p.key,
    label: grouped ? `${p.from.slice(8)}/${p.from.slice(5, 7)}` : series.length <= 8 ? formatWeekdayShort(p.from, language) : p.from.slice(8),
    value: p.value,
  }));
  const rows = report ? barberRows(report) : [];
  const donutColor = (key: string, index: number) => (key === "other" ? colors.neutral[500] : SERVICE_SLICE_COLORS[index % SERVICE_SLICE_COLORS.length]);
  const barberItems = report ? topByValue(report.barbers.map((b) => ({ key: b.barberId, name: b.name, value: b.grossCents }))) : [];
  const serviceItems = report ? topByValue(report.services.map((s) => ({ key: s.serviceId, name: s.name, value: s.grossCents }))) : [];
  const label = (item: { key: string; name: string }) => (item.key === "other" ? t("barber.reports.other") : item.name);

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("owner.revenue.title")}</Text>
          <View className="w-full max-w-[420px] flex-row flex-wrap gap-2">
            {(["week", "month", "quarter"] as const).map((key) => (
              <Button
                key={key}
                label={t(`barber.reports.period${key === "week" ? "Week" : key === "month" ? "Month" : "Quarter"}`)}
                onPress={() => setPeriod(key)}
                size="sm"
                testID={`revenue-period-${key}`}
                variant={period === key ? "dark" : "outline"}
              />
            ))}
          </View>

          <View className="w-full max-w-[420px] gap-3">
            {current.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {current.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(current.error, t, t("owner.revenue.loadError"))}</Text> : null}
            {report && totals ? (
              <>
                <View className="flex-row flex-wrap gap-3">
                  <StatTile label={t("owner.revenue.revenue")} sublabel={delta(totals.grossCents, previousTotals?.grossCents)} testID="stat-revenue" value={money(totals.grossCents)} />
                  <StatTile label={t("owner.revenue.shopIncome")} sublabel={t("owner.revenue.shopIncomeHint")} testID="stat-shop-income" value={money(totals.shopIncomeCents)} />
                  <StatTile label={t("barber.reports.completed")} sublabel={delta(totals.completed, previousTotals?.completed)} testID="stat-completed" value={String(totals.completed)} />
                  <StatTile
                    label={t("barber.reports.cancellationRate")}
                    sublabel={t("barber.reports.cancellationHint", { count: totals.cancelled + totals.noShow })}
                    testID="stat-cancellation"
                    value={totals.cancellationRate === null ? "—" : `${Math.round(totals.cancellationRate * 100)}%`}
                  />
                </View>

                {!hasActivity ? <EmptyState title={t("barber.reports.empty")} /> : null}
                {hasActivity ? (
                  <>
                    <ChartSection rows={revenueData.filter((d) => d.value > 0).map((d) => ({ label: d.label, value: money(d.value) }))} testID="section-revenue" title={t(grouped ? "owner.revenue.byWeek" : "owner.revenue.byDay")}>
                      <ColumnChart accessibilityLabel={t("owner.revenue.revenue")} data={revenueData} formatTick={(v) => (v === 0 ? "0" : String(Math.round(v / 100)))} formatValue={money} testID="chart-revenue" />
                    </ChartSection>

                    {barberItems.length > 0 ? (
                      <ChartSection rows={barberItems.map((i) => ({ label: label(i), value: money(i.value) }))} testID="section-barbers" title={t("owner.revenue.byBarber")}>
                        <DonutChart
                          centerLabel={t("owner.revenue.revenue")}
                          centerValue={money(totals.grossCents)}
                          formatValue={money}
                          slices={barberItems.map((i, index) => ({ color: donutColor(i.key, index), key: i.key, label: label(i), value: i.value }))}
                          testID="donut-barbers"
                        />
                      </ChartSection>
                    ) : null}

                    {serviceItems.length > 0 ? (
                      <ChartSection rows={serviceItems.map((i) => ({ label: label(i), value: money(i.value) }))} testID="section-services" title={t("owner.revenue.byService")}>
                        <DonutChart
                          centerLabel={t("owner.revenue.revenue")}
                          centerValue={money(totals.grossCents)}
                          formatValue={money}
                          slices={serviceItems.map((i, index) => ({ color: donutColor(i.key, index), key: i.key, label: label(i), value: i.value }))}
                          testID="donut-services"
                        />
                      </ChartSection>
                    ) : null}

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
                  </>
                ) : null}

                <Text accessibilityRole="header" className="pt-2 text-lg font-display-semibold text-ink">{t("owner.revenue.barbersTable")}</Text>
                {rows.map((row) => (
                  <Card key={row.barberId} testID={`barber-row-${row.barberId}`} variant="outlined">
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-base font-sans-semibold text-ink">{row.name}</Text>
                        <Text className="text-xs font-sans text-neutral-500">{t("owner.revenue.colCompleted")}: {row.completed}</Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.colRevenue")}</Text>
                        <Text className="text-sm font-sans-medium text-ink">{money(row.grossCents)}</Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.colBarberShare")}</Text>
                        <Text className="text-sm font-sans-medium text-ink">{money(row.barberShareCents)}</Text>
                      </View>
                      {row.rentEstimateCents > 0 ? (
                        <View className="flex-row justify-between">
                          <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.rentEstimate")}</Text>
                          <Text className="text-sm font-sans-medium text-ink">{money(row.rentEstimateCents)}</Text>
                        </View>
                      ) : null}
                      <View className="flex-row justify-between">
                        <Text className="text-sm font-sans-semibold text-ink">{t("owner.revenue.colShopShare")}</Text>
                        <Text className="text-sm font-sans-semibold text-ink">{money(row.shopShareCents)}</Text>
                      </View>
                    </View>
                  </Card>
                ))}
                {totals.rentEstimateCents > 0 ? <Text className="text-xs font-sans text-neutral-500">{t("owner.revenue.rentNote")}</Text> : null}
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```
- [ ] **Step 4: Verify** — typecheck, eslint, `jest --runInBand --forceExit` (locale parity, no-hardcoded-text, route collisions), restart Metro, Playwright specs → PASS. The e2e text assertion `getByText(/estimated/i)` relies on the en `rentNote`.
- [ ] **Step 5: Commit** — `feat(owner): revenue screen`.

---

### Task 4: Verification, review and PR

- [ ] **Step 1:** typecheck, eslint, `jest --runInBand --forceExit`, `rtk npm run test:db` (known local-only `010_full_rls` failures), e2e runner (known 4 date failures; no `.env.local` in the worktree).
- [ ] **Step 2: Real browser.** The seed owner has no usable password: set a temporary one in the local DB (`update auth.users set encrypted_password = extensions.crypt('owner1234', extensions.gen_salt('bf')) where email = 'seed-owner@example.test'`), saving the previous hash first and restoring it afterwards. Copy `.env.local`, run `npx expo start --web --port 8083`, insert throwaway appointments for several barbers (marker notes `rev-test`, throwaway barbers prefixed `Rev `, including a weekly and a monthly chair-rental barber), log in as the seed owner and check with screenshots + `getComputedStyle`: hub link, tiles and deltas, the three periods, donuts with money legends, per-barber rows with rent estimate and note, empty state. Clean every throwaway row, restore the owner hash, stop servers by PID, remove `.env.local`.
- [ ] **Step 3:** self-review (RPC only for owners, no customer data, no table grants added).
- [ ] **Step 4:** push `feat-owner-revenue`; PR via REST with base `feat-barber-clients`, body in Portuguese (summary, rules for shares and estimated rent, migration 0038 note, verification), ending with the 🤖 line.
- [ ] **Step 5:** update `project_barber_booking.md` memory (PR number, migration 0038, remaining items).

---

## Self-Review

**Spec coverage:** RPC with days/barbers/services, share and rent rules, isolation, forbidden → T1; client, pure aggregation (shop income, barber rows, top-by-value), `REPORT_FORBIDDEN`, money legend → T2; screen with tiles/deltas/charts/table/rent note and the hub link → T3; verification and PR → T4.

**Placeholder scan:** the sanity assertion in the pgTAP file is a deliberate low-value check with an explicit replacement; everything else is concrete.

**Type consistency:** `ShopReport`/`ShopBarber`/`ShopDay`/`ShopService` and the jsonb keys (`gross_cents`, `barber_share_cents`, `rent_estimate_cents`, `compensation_type`, `barber_id`, `service_id`) match SQL, API, tests and screen; `topByValue` returns `DonutItem` from `build-report.ts`; test IDs are consistent between screen and e2e.
