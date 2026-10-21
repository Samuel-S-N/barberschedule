# Recurrence Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner manages recurrence **plans** (service + price per session + "every N weeks") from a list with a circular `+` and a plan form, like Barbers and Services; the customer requests a plan through booking-style steps: Barbeiro › Plano › Dia da semana › Horário › Revisão › Enviar.

**Architecture:** New table `recurrence_plans`; the old `service_recurrence_prices` table (migration `0050`) is migrated into plans and replaced by a **compatibility view** over active plans, so the existing `request_recurrence` / `decide_recurrence_request` / `create_recurrence_for_customer` keep pricing a series by (service, weeks) with no rewrite. Two of those functions are re-created only to accept any plan periodicity (1–12 weeks) instead of 1/2. New RPCs list/save plans and list a barber's plans for customers. The customer screen is a single screen with a local step trail and a shared `StepBar` (extracted from booking's `StepIndicator`).

**Tech Stack:** Postgres/pgTAP, Expo Router, React Query (`useQueries`), NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round2-design.md`

## Global Constraints
- Branch `feat-recurrence-plans` from `feat-agenda-cards`. Migration number `0053` (after `0052`); pgTAP `034_recurrence_plans.sql`.
- A plan: `service_id`, `interval_weeks` **1–12**, `price_cents` per **session** (≥ 0), optional `name`, `active`. At most one **active** plan per (service, interval). Several plans may share a service with different periodicities. Plans are deactivated, never deleted.
- Error codes (free ones): `P0032 RECURRENCE_PRICE_INVALID` (already mapped), **`P0033 RECURRENCE_PLAN_DUPLICATE`** (new; add to `src/lib/errors/domain-errors.ts` and `en/es/pt` `errors.codes`).
- Four-week total is shown only when `4 / weeks` is an integer (weeks 1, 2, 4); otherwise only the per-session price.
- Customer first date = the next occurrence of the chosen weekday, **never today** (`nextDateForWeekday`).
- Customers see only active plans of services the chosen barber offers (`list_recurrence_plans_for_barber`); the normal price shown is the barber's price (`barber_services.price_override_cents` or the service price).
- New routes need entries in `ROUTE_PARENTS` (plan r2-02): `/recurrence-plans` → `/manage`, `/recurrence-plan-form` → `/recurrence-plans`; the coverage test fails otherwise.
- Test ids: plans list card `plan-<id>`, edit `plan-edit-<id>`, form `plan-service-<serviceId>`, `plan-name`, `plan-price`, `plan-weeks`, `plan-weeks-1`, `plan-weeks-2`, `plan-save`, `plan-toggle`; customer: `plan-card-<planId>`, `weekday-<1..7>`, `recurrence-send`, steps `step-<key>` / `step-label` (from `StepBar`).
- Memory: TDD, `rtk`, verify in a browser at 375px, e2e needs `.env.local` moved aside and an Expo restart after source changes; e2e mock ids must be valid-looking UUIDs only where zod validates them (now `guid`, so any 8-4-4-4-12 hex works); apply migrations locally with `docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < file.sql` plus a `schema_migrations` row.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Database — plans, view, RPCs (pgTAP first)

**Files:**
- Create: `supabase/migrations/0053_recurrence_plans.sql`, `supabase/tests/034_recurrence_plans.sql`

**Produces (DB):**
`recurrence_plans`; view `service_recurrence_prices(shop_id, service_id, interval_weeks, price_cents)` over active plans;
`list_recurrence_plans(target_shop_id uuid) → (id, service_id, service_name, name, interval_weeks, price_cents, normal_cents, active)` (owner);
`save_recurrence_plan(target_plan_id uuid, target_service_id uuid, target_interval_weeks integer, target_price_cents integer, target_name text, target_active boolean) → void` (owner; null plan id = create);
`list_recurrence_plans_for_barber(target_barber_id uuid) → (plan_id, name, service_name, barber_service_id, interval_weeks, price_cents, normal_cents)` (any signed-in user).
Dropped: `set_recurrence_price`, `list_recurrence_prices`. Re-created: `request_recurrence`, `create_recurrence_for_customer` (periodicity now validated against active plans).

- [ ] **Step 1: Write the failing pgTAP** `supabase/tests/034_recurrence_plans.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'plans-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'plans-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'plans-barber@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'fe000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'fe000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id) values ('fe100000-0000-0000-0000-000000000001', 'Plans Shop', 'fe000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email) values ('fe200000-0000-0000-0000-000000000001', 'fe100000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000002', 'Plans Customer', 'plans-customer@shop.example');
insert into public.barbers (id, shop_id, name, user_id) values ('fe300000-0000-0000-0000-000000000001', 'fe100000-0000-0000-0000-000000000001', 'Plans Barber', 'fe000000-0000-0000-0000-000000000003');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('fe400000-0000-0000-0000-000000000001', 'fe100000-0000-0000-0000-000000000001', 'Plans Cut', 30, 3500);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('fe500000-0000-0000-0000-000000000001', 'fe100000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000001', 'fe400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time) values ('fe100000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000001', 1, '09:00', '18:00');

create temporary table plan_dates as select date_trunc('week', current_date + 14)::date as monday;
grant select on plan_dates to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- the owner creates plans
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select lives_ok($$ select public.save_recurrence_plan(null, 'fe400000-0000-0000-0000-000000000001', 1, 2500, null, true) $$, 'the owner creates a weekly plan');
select lives_ok($$ select public.save_recurrence_plan(null, 'fe400000-0000-0000-0000-000000000001', 3, 4500, 'Trimestral', true) $$, 'the owner creates a plan for every 3 weeks');
select throws_ok($$ select public.save_recurrence_plan(null, 'fe400000-0000-0000-0000-000000000001', 1, 2000, null, true) $$, 'P0033', null, 'only one active plan per service and periodicity');
select throws_ok($$ select public.save_recurrence_plan(null, 'fe400000-0000-0000-0000-000000000001', 13, 2000, null, true) $$, 'P0032', null, 'periodicity is 1 to 12 weeks');
select is((select count(*)::int from public.list_recurrence_plans('fe100000-0000-0000-0000-000000000001')), 2, 'the owner lists both plans');

-- the customer sees them through the barber, and cannot manage plans
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.list_recurrence_plans_for_barber('fe300000-0000-0000-0000-000000000001') where barber_service_id = 'fe500000-0000-0000-0000-000000000001'), 2, 'the customer sees the barber''s plans with the barber service id');
select throws_ok($$ select public.save_recurrence_plan(null, 'fe400000-0000-0000-0000-000000000001', 2, 3000, null, true) $$, 'P0010', null, 'a customer cannot create plans');

-- a request needs an active plan for that periodicity
select throws_ok($$ select * from public.request_recurrence('fe500000-0000-0000-0000-000000000001', 4, (select monday from plan_dates), '10:00') $$, 'P0015', null, 'no plan for 4 weeks: the request is invalid');
select is((select count(*)::int from public.request_recurrence('fe500000-0000-0000-0000-000000000001', 3, (select monday from plan_dates), '10:00')), 1, 'a request for the 3-week plan works');

-- the barber accepts: the series carries the plan's price and periodicity
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$ select * from public.decide_recurrence_request((select id from public.list_recurrence_requests('fe100000-0000-0000-0000-000000000001') limit 1), true) $$,
  'the barber accepts'
);
reset role;
select is(
  (select special_price_cents::text || '/' || interval_weeks::text from public.recurrence_series where customer_id = 'fe200000-0000-0000-0000-000000000001'),
  '4500/3',
  'the series uses the plan price and periodicity'
);

select * from finish();

rollback;
```
Run `npm run test:db` → the new file FAILS (`save_recurrence_plan` does not exist).

- [ ] **Step 2: Write the migration** `supabase/migrations/0053_recurrence_plans.sql`. Part A (static SQL):

```sql
-- Recurrence plans: what the owner offers (service + price per session + every N weeks).
create table public.recurrence_plans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  service_id uuid not null,
  name text,
  interval_weeks smallint not null check (interval_weeks between 1 and 12),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (shop_id, service_id) references public.services (shop_id, id) on delete cascade
);

create unique index recurrence_plans_one_active on public.recurrence_plans (service_id, interval_weeks) where active;

alter table public.recurrence_plans enable row level security;
revoke all on table public.recurrence_plans from anon, authenticated;

-- Keep the prices the owner already set.
insert into public.recurrence_plans (shop_id, service_id, interval_weeks, price_cents)
select shop_id, service_id, interval_weeks, price_cents from public.service_recurrence_prices;

drop function public.set_recurrence_price(uuid, integer, integer);
drop function public.list_recurrence_prices(uuid);
drop table public.service_recurrence_prices;

-- Compatibility view: the request/accept functions of 0050 still look prices up by (service, weeks).
create view public.service_recurrence_prices as
select shop_id, service_id, interval_weeks, price_cents from public.recurrence_plans where active;
revoke all on public.service_recurrence_prices from anon, authenticated;

-- Requests may now be for any plan periodicity.
alter table public.recurrence_requests drop constraint recurrence_requests_interval_weeks_check;
alter table public.recurrence_requests add constraint recurrence_requests_interval_weeks_check check (interval_weeks between 1 and 12);

create function public.list_recurrence_plans(target_shop_id uuid)
returns table (id uuid, service_id uuid, service_name text, name text, interval_weeks smallint, price_cents integer, normal_cents integer, active boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  return query
  select p.id, p.service_id, s.name, p.name, p.interval_weeks, p.price_cents, s.price_cents, p.active
  from public.recurrence_plans p
  join public.services s on s.id = p.service_id and s.shop_id = p.shop_id
  where p.shop_id = target_shop_id
  order by s.name, p.interval_weeks;
end;
$$;

create function public.save_recurrence_plan(
  target_plan_id uuid, target_service_id uuid, target_interval_weeks integer, target_price_cents integer, target_name text, target_active boolean
)
returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  svc_shop uuid;
begin
  select shop_id into svc_shop from public.services where id = target_service_id;
  if svc_shop is null or not public.is_shop_owner(svc_shop) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_interval_weeks is null or target_interval_weeks not between 1 and 12 or target_price_cents is null or target_price_cents < 0 then
    raise exception using errcode = 'P0032', message = 'RECURRENCE_PRICE_INVALID';
  end if;
  if target_active and exists (
    select 1 from public.recurrence_plans p
    where p.service_id = target_service_id and p.interval_weeks = target_interval_weeks and p.active and p.id is distinct from target_plan_id
  ) then
    raise exception using errcode = 'P0033', message = 'RECURRENCE_PLAN_DUPLICATE';
  end if;

  if target_plan_id is null then
    insert into public.recurrence_plans (shop_id, service_id, name, interval_weeks, price_cents, active)
    values (svc_shop, target_service_id, nullif(btrim(target_name), ''), target_interval_weeks, target_price_cents, coalesce(target_active, true));
  else
    update public.recurrence_plans
    set service_id = target_service_id, name = nullif(btrim(target_name), ''), interval_weeks = target_interval_weeks,
        price_cents = target_price_cents, active = coalesce(target_active, true)
    where id = target_plan_id and shop_id = svc_shop;
    if not found then
      raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
    end if;
  end if;
end;
$$;

create function public.list_recurrence_plans_for_barber(target_barber_id uuid)
returns table (plan_id uuid, name text, service_name text, barber_service_id uuid, interval_weeks smallint, price_cents integer, normal_cents integer)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select p.id, p.name, s.name, bs.id, p.interval_weeks, p.price_cents, coalesce(bs.price_override_cents, s.price_cents)
  from public.recurrence_plans p
  join public.services s on s.id = p.service_id and s.shop_id = p.shop_id and s.active
  join public.barber_services bs on bs.service_id = s.id and bs.shop_id = p.shop_id and bs.barber_id = target_barber_id and bs.active
  join public.barbers b on b.id = bs.barber_id and b.shop_id = bs.shop_id and b.active
  where p.active and auth.uid() is not null
  order by s.name, p.interval_weeks;
$$;

revoke all on function public.list_recurrence_plans(uuid), public.save_recurrence_plan(uuid, uuid, integer, integer, text, boolean),
  public.list_recurrence_plans_for_barber(uuid) from public;
grant execute on function public.list_recurrence_plans(uuid), public.save_recurrence_plan(uuid, uuid, integer, integer, text, boolean),
  public.list_recurrence_plans_for_barber(uuid) to authenticated;
```
Part B: re-create the two functions of `0050` that hard-code "1 or 2 weeks". Append them to the migration with this script (it copies each function from `0050`, replaces `create function` by `create or replace function` and swaps the periodicity check for a plan lookup; `bs` is already defined in both bodies before that line):

```bash
python3 - <<'EOF'
source = open("supabase/migrations/0050_recurrence_requests.sql").read()
old = "  if target_interval_weeks not in (1, 2) or target_start_date < local_today or target_start_date > local_today + 90 then"
new = ("  if not exists (select 1 from public.recurrence_plans pl where pl.service_id = bs.service_id and pl.interval_weeks = target_interval_weeks and pl.active)\n"
       "     or target_start_date < local_today or target_start_date > local_today + 90 then")

parts = []
for name in ["request_recurrence", "create_recurrence_for_customer"]:
    start = source.index(f"create function public.{name}(")
    end = source.index("\n$$;", start) + len("\n$$;")
    body = source[start:end]
    assert body.count(old) == 1, name
    parts.append(body.replace("create function", "create or replace function", 1).replace(old, new, 1))

with open("supabase/migrations/0053_recurrence_plans.sql", "a") as migration:
    migration.write("\n-- Periodicity is now validated against the active plans (any of 1-12 weeks) instead of 1/2.\n")
    migration.write("\n\n".join(parts) + "\n")
EOF
```
(The `revoke/grant` lines for these two functions from `0050` still apply: `create or replace` keeps privileges.)

- [ ] **Step 3: Apply and run**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -q < supabase/migrations/0053_recurrence_plans.sql 2>&1 | grep -i error
docker exec supabase_db_barberschedule psql -U postgres -d postgres -qc "insert into supabase_migrations.schema_migrations (version,name) values ('0053','recurrence_plans') on conflict do nothing"
npm run test:db 2>&1 | grep -A6 "034_recurrence"
npm run test:db 2>&1 | grep -A6 "031_recurrence"
```
Expected: `034 ... ok` and `031_recurrence_requests.sql ... ok` (the older recurrence pgTAP file proves the compatibility view and the re-created functions still work for 1/2-week plans created through the old `set_recurrence_price`? — it calls `set_recurrence_price`, which is now dropped: **update `031_recurrence_requests.sql`**: replace its `set_recurrence_price('…service…', 1, 2500)` line by `save_recurrence_plan(null, '…service…', 1, 2500, null, true)`, add right after it a biweekly plan `save_recurrence_plan(null, '…service…', 2, 3000, null, true)` (the `10:07` assertion and the walk-in series use 2 weeks and now need an active plan, otherwise they fail with `P0015` before reaching `P0001`), and replace the invalid-interval assertion (`P0032` for weeks 3) by `save_recurrence_plan(null, '…service…', 13, 2500, null, true)`; rerun until `031` passes).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(db): recurrence plans with any 1-12 week periodicity"`

---

### Task 2: Client API, pricing helpers, labels and error code

**Files:**
- Modify: `src/features/recurrence/pricing.ts`, `src/features/recurrence/requests-api.ts` (remove `getRecurrenceQuote`, `listRecurrencePrices`, `setRecurrencePrice`), `src/lib/errors/domain-errors.ts`, `src/i18n/locales/{en,es,pt}.ts`
- Create: `src/features/recurrence/plans-api.ts`, `src/features/recurrence/price-text.ts`, `src/features/recurrence/weekday.ts`
- Test: `tests/unit/recurrence-pricing.test.ts` (rewrite), `tests/unit/recurrence-plans-api.test.ts`, `tests/unit/recurrence-weekday.test.ts`, `tests/unit/recurrence-requests-api.test.ts` (edit)

**Produces:**
```ts
// pricing.ts
export type RecurrenceWeeks = number;
sessionsPer4Weeks(weeks: number): number
fourWeekTotalCents(unitCents: number, weeks: number): number | null      // null unless 4 / weeks is an integer
recurrenceLabel(t: TFunction, weeks: number): string                      // Weekly | Every 2 weeks | Every N weeks
// price-text.ts
recurrencePriceText(t: TFunction, priceCents: number, weeks: number): string   // "R$ 25,00 per session · 4 sessions in 4 weeks = R$ 100,00"
// weekday.ts
isoWeekday(localDate: string): number                                     // Monday=1 ... Sunday=7
nextDateForWeekday(today: string, weekday: number): string                // first date after today with that weekday
// plans-api.ts
type RecurrencePlan = { active: boolean; id: string; name: string | null; normalCents: number; priceCents: number; serviceId: string; serviceName: string; weeks: number }
type BarberPlan = { barberServiceId: string; name: string | null; normalCents: number; planId: string; priceCents: number; serviceName: string; weeks: number }
listRecurrencePlans(supabase, shopId): Promise<RecurrencePlan[]>
saveRecurrencePlan(supabase, input: { active: boolean; id: string | null; name: string | null; priceCents: number; serviceId: string; weeks: number }): Promise<void>
listPlansForBarber(supabase, barberId): Promise<BarberPlan[]>
planTitle(t: TFunction, plan: { name: string | null; serviceName: string; weeks: number }): string   // name, or "Service · Weekly"
```

- [ ] **Step 1: Failing tests**

`tests/unit/recurrence-pricing.test.ts` (replace the file):

```ts
import { fourWeekTotalCents, recurrenceLabel, sessionsPer4Weeks } from "../../src/features/recurrence/pricing";
import { recurrencePriceText } from "../../src/features/recurrence/price-text";

const t = ((key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ""}`) as never;

it("counts sessions in 4 weeks", () => {
  expect(sessionsPer4Weeks(1)).toBe(4);
  expect(sessionsPer4Weeks(2)).toBe(2);
  expect(sessionsPer4Weeks(4)).toBe(1);
});

it("totals the owner's example and hides the total when 4 weeks is not a whole number of sessions", () => {
  expect(fourWeekTotalCents(2500, 1)).toBe(10000);
  expect(fourWeekTotalCents(2500, 2)).toBe(5000);
  expect(fourWeekTotalCents(2500, 4)).toBe(2500);
  expect(fourWeekTotalCents(2500, 3)).toBeNull();
});

it("labels the common periodicities and the free ones", () => {
  expect(recurrenceLabel(t, 1)).toBe("recurrence.weekly");
  expect(recurrenceLabel(t, 2)).toBe("recurrence.biweekly");
  expect(recurrenceLabel(t, 3)).toBe('recurrence.everyNWeeks{"count":3}');
});

it("price text has the total only when it exists", () => {
  expect(recurrencePriceText(t, 2500, 1)).toContain("recurrence.fourWeeks");
  expect(recurrencePriceText(t, 2500, 3)).not.toContain("recurrence.fourWeeks");
});
```
`tests/unit/recurrence-weekday.test.ts`:

```ts
import { isoWeekday, nextDateForWeekday } from "../../src/features/recurrence/weekday";

it("numbers weekdays Monday=1 to Sunday=7", () => {
  expect(isoWeekday("2026-10-19")).toBe(1); // Monday
  expect(isoWeekday("2026-10-21")).toBe(3); // Wednesday
  expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
});

it("the next date for a weekday is after today, never today", () => {
  expect(nextDateForWeekday("2026-10-21", 3)).toBe("2026-10-28"); // today is Wednesday: next Wednesday
  expect(nextDateForWeekday("2026-10-21", 4)).toBe("2026-10-22");
  expect(nextDateForWeekday("2026-10-21", 2)).toBe("2026-10-27");
  expect(nextDateForWeekday("2026-10-21", 1)).toBe("2026-10-26");
  expect(nextDateForWeekday("2026-12-31", 4)).toBe("2027-01-07");
});
```
`tests/unit/recurrence-plans-api.test.ts`:

```ts
import { listPlansForBarber, listRecurrencePlans, planTitle, saveRecurrencePlan } from "../../src/features/recurrence/plans-api";

const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key}${JSON.stringify(options)}` : key)) as never;

it("lists plans for the owner", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ active: true, id: "p1", interval_weeks: 3, name: "Trimestral", normal_cents: 3500, price_cents: 4500, service_id: "s1", service_name: "Cut" }], error: null });

  expect(await listRecurrencePlans({ rpc } as never, "shop1")).toEqual([{ active: true, id: "p1", name: "Trimestral", normalCents: 3500, priceCents: 4500, serviceId: "s1", serviceName: "Cut", weeks: 3 }]);
  expect(rpc).toHaveBeenCalledWith("list_recurrence_plans", { target_shop_id: "shop1" });
});

it("saves a plan (create and edit)", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await saveRecurrencePlan({ rpc } as never, { active: true, id: null, name: " Mensal ", priceCents: 2500, serviceId: "s1", weeks: 1 });
  expect(rpc).toHaveBeenLastCalledWith("save_recurrence_plan", { target_active: true, target_interval_weeks: 1, target_name: "Mensal", target_plan_id: null, target_price_cents: 2500, target_service_id: "s1" });
  await saveRecurrencePlan({ rpc } as never, { active: false, id: "p1", name: "  ", priceCents: 0, serviceId: "s1", weeks: 2 });
  expect(rpc).toHaveBeenLastCalledWith("save_recurrence_plan", { target_active: false, target_interval_weeks: 2, target_name: null, target_plan_id: "p1", target_price_cents: 0, target_service_id: "s1" });
});

it("lists a barber's plans for customers", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ barber_service_id: "bs1", interval_weeks: 1, name: null, normal_cents: 3500, plan_id: "p1", price_cents: 2500, service_name: "Cut" }], error: null });

  expect(await listPlansForBarber({ rpc } as never, "b1")).toEqual([{ barberServiceId: "bs1", name: null, normalCents: 3500, planId: "p1", priceCents: 2500, serviceName: "Cut", weeks: 1 }]);
  expect(rpc).toHaveBeenCalledWith("list_recurrence_plans_for_barber", { target_barber_id: "b1" });
});

it("a plan's title is its name, or the service and periodicity", () => {
  expect(planTitle(t, { name: "Trimestral", serviceName: "Cut", weeks: 3 })).toBe("Trimestral");
  expect(planTitle(t, { name: null, serviceName: "Cut", weeks: 1 })).toBe("Cut · recurrence.weekly");
});

it("maps a duplicate plan to RECURRENCE_PLAN_DUPLICATE", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0033" } });

  await expect(saveRecurrencePlan({ rpc } as never, { active: true, id: null, name: null, priceCents: 1, serviceId: "s1", weeks: 1 })).rejects.toMatchObject({ code: "RECURRENCE_PLAN_DUPLICATE" });
});
```
In `tests/unit/recurrence-requests-api.test.ts` delete the `getRecurrenceQuote` test and the `setRecurrencePrice` lines (and their imports).
Run `npx jest tests/unit/recurrence-pricing.test.ts tests/unit/recurrence-weekday.test.ts tests/unit/recurrence-plans-api.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Implement**

`src/features/recurrence/pricing.ts`:

```ts
import type { TFunction } from "i18next";

export type RecurrenceWeeks = number;

// A month is counted as 4 weeks.
export const sessionsPer4Weeks = (weeks: number) => 4 / weeks;

// null when 4 weeks is not a whole number of sessions (3, 5, 6... weeks): show only the per-session price then.
export function fourWeekTotalCents(unitCents: number, weeks: number) {
  const sessions = sessionsPer4Weeks(weeks);

  return Number.isInteger(sessions) ? unitCents * sessions : null;
}

export function recurrenceLabel(t: TFunction, weeks: number) {
  if (weeks === 1) return t("recurrence.weekly");
  if (weeks === 2) return t("recurrence.biweekly");

  return t("recurrence.everyNWeeks", { count: weeks });
}
```
`src/features/recurrence/price-text.ts`:

```ts
import type { TFunction } from "i18next";

import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { fourWeekTotalCents, sessionsPer4Weeks } from "./pricing";

export function recurrencePriceText(t: TFunction, priceCents: number, weeks: number) {
  const unit = t("recurrence.perSession", { price: formatPriceBRL(priceCents) });
  const total = fourWeekTotalCents(priceCents, weeks);

  return total === null ? unit : `${unit} · ${t("recurrence.fourWeeks", { count: sessionsPer4Weeks(weeks), total: formatPriceBRL(total) })}`;
}
```
`src/features/recurrence/weekday.ts`:

```ts
// Monday = 1 ... Sunday = 7, from a local date (YYYY-MM-DD).
export function isoWeekday(localDate: string) {
  const day = new Date(`${localDate}T12:00:00Z`).getUTCDay();

  return day === 0 ? 7 : day;
}

// The first date after `today` that falls on `weekday` (1-7 days ahead, never today).
export function nextDateForWeekday(today: string, weekday: number) {
  const ahead = ((weekday - isoWeekday(today) + 6) % 7) + 1;
  const date = new Date(`${today}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + ahead);

  return date.toISOString().slice(0, 10);
}
```
`src/features/recurrence/plans-api.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TFunction } from "i18next";

import { toDomainError } from "../../lib/errors/domain-errors";
import { recurrenceLabel } from "./pricing";

type Client = Pick<SupabaseClient, "rpc">;
type Row = Record<string, unknown>;

export type RecurrencePlan = { active: boolean; id: string; name: string | null; normalCents: number; priceCents: number; serviceId: string; serviceName: string; weeks: number };
export type BarberPlan = { barberServiceId: string; name: string | null; normalCents: number; planId: string; priceCents: number; serviceName: string; weeks: number };

async function call(supabase: Client, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toDomainError(error);

  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}

export async function listRecurrencePlans(supabase: Client, shopId: string): Promise<RecurrencePlan[]> {
  const rows = await call(supabase, "list_recurrence_plans", { target_shop_id: shopId });

  return rows.map((row) => ({
    active: Boolean(row.active),
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    normalCents: Number(row.normal_cents),
    priceCents: Number(row.price_cents),
    serviceId: String(row.service_id),
    serviceName: String(row.service_name),
    weeks: Number(row.interval_weeks),
  }));
}

export async function saveRecurrencePlan(supabase: Client, input: { active: boolean; id: string | null; name: string | null; priceCents: number; serviceId: string; weeks: number }) {
  await call(supabase, "save_recurrence_plan", {
    target_active: input.active,
    target_interval_weeks: input.weeks,
    target_name: input.name?.trim() || null,
    target_plan_id: input.id,
    target_price_cents: input.priceCents,
    target_service_id: input.serviceId,
  });
}

export async function listPlansForBarber(supabase: Client, barberId: string): Promise<BarberPlan[]> {
  const rows = await call(supabase, "list_recurrence_plans_for_barber", { target_barber_id: barberId });

  return rows.map((row) => ({
    barberServiceId: String(row.barber_service_id),
    name: (row.name as string | null) ?? null,
    normalCents: Number(row.normal_cents),
    planId: String(row.plan_id),
    priceCents: Number(row.price_cents),
    serviceName: String(row.service_name),
    weeks: Number(row.interval_weeks),
  }));
}

export const planTitle = (t: TFunction, plan: { name: string | null; serviceName: string; weeks: number }) => plan.name ?? `${plan.serviceName} · ${recurrenceLabel(t, plan.weeks)}`;
```
`requests-api.ts`: delete `RecurrenceQuote`, `getRecurrenceQuote`, `listRecurrencePrices`, `setRecurrencePrice`.
`domain-errors.ts`: add `"RECURRENCE_PLAN_DUPLICATE"` to the code union and `case "P0033": return new DomainError("RECURRENCE_PLAN_DUPLICATE", "There is already an active plan for this service and periodicity.");` (next to `P0032`).

- [ ] **Step 3: Locale strings** (all three files; `en` shown, translate the values for `pt`/`es`):

```ts
// errors.codes (next to RECURRENCE_PRICE_INVALID)
      RECURRENCE_PLAN_DUPLICATE: "There is already an active plan for this service and periodicity.",
// recurrence block: add (pt/es below)
    everyNWeeks: "Every {{count}} weeks",
    choosePlan: "Choose a plan",
    chooseWeekday: "Choose the day of the week",
    chooseTime: "Choose the time",
    everyWeekday: "Every {{weekday}}",
    startsOn: "Starts on {{date}}",
    noPlans: "This barber has no recurrence plans yet.",
    noTimesWeekday: "No times on this day",
    review: "Review your request",
    steps: { barber: "Barber", plan: "Plan", review: "Review", send: "Send", time: "Time", weekday: "Day" },
// owner.manage
      plans: "Recurrence plans",
// new owner.plans block
    plans: {
      add: "Add plan",
      editTitle: "Edit plan",
      empty: "No plans yet. Tap + to create one.",
      every: "Repeats every (weeks)",
      inactive: "(inactive)",
      name: "Plan name (optional)",
      newTitle: "New plan",
      notFound: "Plan not found.",
      price: "Price per session (R$)",
      quickMonthly: "Weekly",
      quickBiweekly: "Every 2 weeks",
      save: "Save plan",
      saveError: "Unable to save the plan.",
      saved: "Plan saved.",
      service: "Service",
      title: "Recurrence plans",
    },
```
pt: `RECURRENCE_PLAN_DUPLICATE: "Já existe um plano ativo para este serviço e periodicidade."`, `everyNWeeks: "A cada {{count}} semanas"`, `choosePlan: "Escolha um plano"`, `chooseWeekday: "Escolha o dia da semana"`, `chooseTime: "Escolha o horário"`, `everyWeekday: "Toda {{weekday}}"`, `startsOn: "Começa em {{date}}"`, `noPlans: "Este barbeiro ainda não tem planos de recorrência."`, `noTimesWeekday: "Sem horários neste dia"`, `review: "Revise seu pedido"`, steps `{ barber: "Barbeiro", plan: "Plano", review: "Revisão", send: "Enviar", time: "Horário", weekday: "Dia" }`; `owner.manage.plans: "Planos de recorrência"`; owner.plans: `add: "Adicionar plano"`, `editTitle: "Editar plano"`, `empty: "Nenhum plano ainda. Toque em + para criar."`, `every: "Repete a cada (semanas)"`, `inactive: "(inativo)"`, `name: "Nome do plano (opcional)"`, `newTitle: "Novo plano"`, `notFound: "Plano não encontrado."`, `price: "Preço por sessão (R$)"`, `quickMonthly: "Semanal"`, `quickBiweekly: "Quinzenal"`, `save: "Salvar plano"`, `saveError: "Não foi possível salvar o plano."`, `saved: "Plano salvo."`, `service: "Serviço"`, `title: "Planos de recorrência"`.
es: `RECURRENCE_PLAN_DUPLICATE: "Ya hay un plan activo para este servicio y periodicidad."`, `everyNWeeks: "Cada {{count}} semanas"`, `choosePlan: "Elige un plan"`, `chooseWeekday: "Elige el día de la semana"`, `chooseTime: "Elige la hora"`, `everyWeekday: "Cada {{weekday}}"`, `startsOn: "Empieza el {{date}}"`, `noPlans: "Este barbero aún no tiene planes de recurrencia."`, `noTimesWeekday: "Sin horarios este día"`, `review: "Revisa tu solicitud"`, steps `{ barber: "Barbero", plan: "Plan", review: "Revisión", send: "Enviar", time: "Hora", weekday: "Día" }`; `owner.manage.plans: "Planes de recurrencia"`; owner.plans: `add: "Agregar plan"`, `editTitle: "Editar plan"`, `empty: "Aún no hay planes. Toca + para crear uno."`, `every: "Se repite cada (semanas)"`, `inactive: "(inactivo)"`, `name: "Nombre del plan (opcional)"`, `newTitle: "Nuevo plan"`, `notFound: "Plan no encontrado."`, `price: "Precio por sesión (R$)"`, `quickMonthly: "Semanal"`, `quickBiweekly: "Cada 2 semanas"`, `save: "Guardar plan"`, `saveError: "No se pudo guardar el plan."`, `saved: "Plan guardado."`, `service: "Servicio"`, `title: "Planes de recurrencia"`.
Place `owner.manage.plans` inside the existing `owner.manage` object (`grep -n "manage: {" src/i18n/locales/en.ts`) and `plans: { ... }` as a sibling of `owner.services`. The examples block (plan r2-03) needs `examples.weeks: "2"` added too (`en/pt/es`) for the weeks field.

- [ ] **Step 4: Migrate the old helper's callers** (so `tsc` compiles): `recurrenceLabelKey` no longer exists. Replace each use `t(recurrenceLabelKey(x))` by `recurrenceLabel(t, x)` in `src/features/notifications/NotificationsScreen.tsx` (use `label: recurrenceLabel(t, item.params.intervalWeeks ?? 1)`), `src/features/recurrence/RequestCard.tsx`, `app/(customer)/me/recurrence.tsx` (rewritten in Task 6), `app/(owner)/monthly-customers.tsx` (rewritten in Task 5) and `src/features/recurrence/ManualRecurrenceForm.tsx` (rewritten in Task 4). In `RequestCard.tsx` also replace the price block by `request.recurrenceCents !== null ? recurrencePriceText(t, request.recurrenceCents, request.weeks) : t("recurrence.normalPrice", { price: formatPriceBRL(request.normalCents) })` and drop the now unused `fourWeekTotalCents`/`sessionsPer4Weeks` imports.

- [ ] **Step 5: Run** — `npx jest tests/unit/recurrence-pricing.test.ts tests/unit/recurrence-weekday.test.ts tests/unit/recurrence-plans-api.test.ts tests/unit/recurrence-requests-api.test.ts` → PASS. (`npm run typecheck` will still fail until Tasks 4–6 rewrite the remaining callers; commit anyway.)

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: recurrence plan client api, pricing helpers, weekday helper and strings"`

---

### Task 3: Owner "Planos de recorrência" screens

**Files:**
- Create: `app/(owner)/recurrence-plans.tsx`, `app/(owner)/recurrence-plan-form.tsx`
- Modify: `app/(owner)/manage.tsx`, `app/(owner)/_layout.tsx` (`MANAGE_SCREENS`), `src/lib/navigation/parents.ts`
- Test: `tests/e2e/owner-recurrence-plans.web.spec.ts`

- [ ] **Step 1: Failing e2e** `tests/e2e/owner-recurrence-plans.web.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const P1 = "99999999-9999-4999-8999-999999999991";

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

const plans = [
  { active: true, id: P1, interval_weeks: 1, name: null, normal_cents: 3500, price_cents: 2500, service_id: S1, service_name: "Seed cut" },
  { active: false, id: "99999999-9999-4999-8999-999999999992", interval_weeks: 3, name: "Trimestral", normal_cents: 3500, price_cents: 4500, service_id: S1, service_name: "Seed cut" },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops")) return json(route, [{ id: shop }]);
    if (path.endsWith("/rpc/list_recurrence_plans")) return json(route, plans);
    if (path.endsWith("/rpc/save_recurrence_plan")) {
      (calls.saves as unknown[]).push(route.request().postDataJSON());

      return json(route, null);
    }
    if (path.endsWith("/rpc/list_owner_barbers")) return json(route, []);
    if (path.endsWith("/services") && method === "GET") {
      return json(route, [
        { active: true, archived_at: null, description: null, duration_minutes: 30, id: S1, is_standard: true, name: "Seed cut", price_cents: 3500, shop_id: shop },
        { active: true, archived_at: null, description: null, duration_minutes: 45, id: S2, is_standard: false, name: "Beard", price_cents: 4500, shop_id: shop },
      ]);
    }
    if (path.endsWith("/barber_services") && method === "GET") return json(route, []);
    await route.abort();
  });
}

test("Manage has a Recurrence plans entry; the list shows price, periodicity and inactive plans, with a + button", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { saves: [] });

  await page.goto("/manage");
  await page.getByTestId("menu-recurrence-plans").click();
  await expect(page).toHaveURL(/\/recurrence-plans/);
  await expect(page.getByTestId(`plan-${P1}`)).toContainText("Seed cut · Weekly");
  await expect(page.getByTestId(`plan-${P1}`)).toContainText("R$ 25,00 per session");
  await expect(page.getByTestId(`plan-${P1}`)).toContainText("R$ 100,00");
  await expect(page.getByTestId("plan-99999999-9999-4999-8999-999999999992")).toContainText("Trimestral");
  await expect(page.getByTestId("plan-99999999-9999-4999-8999-999999999992")).toContainText("(inactive)");
  await expect(page.getByTestId("fab-add")).toBeVisible();
});

test("the owner creates a plan: service, price, free periodicity", async ({ page }) => {
  const calls = { saves: [] as unknown[] };

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/recurrence-plans");
  await page.getByTestId("fab-add").click();
  await expect(page).toHaveURL(/\/recurrence-plan-form/);
  await expect(page.getByTestId("plan-save")).toBeDisabled();
  await page.getByTestId(`option-plan-service-${S2}`).click();
  await page.getByTestId("plan-price").fill("30,00");
  await page.getByTestId("plan-weeks-2").click(); // quick chip: every 2 weeks
  await expect(page.getByTestId("plan-weeks")).toHaveValue("2");
  await page.getByTestId("plan-weeks").fill("3");
  await page.getByTestId("plan-name").fill("Barba trimestral");
  await page.getByTestId("plan-save").click();

  await expect.poll(() => calls.saves).toEqual([{ target_active: true, target_interval_weeks: 3, target_name: "Barba trimestral", target_plan_id: null, target_price_cents: 3000, target_service_id: S2 }]);
  await expect(page).toHaveURL(/\/recurrence-plans$/);
});

test("the owner edits a plan and deactivates it with the red button", async ({ page }) => {
  const calls = { saves: [] as unknown[] };

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/recurrence-plans");
  await page.getByTestId(`plan-edit-${P1}`).click();
  await expect(page).toHaveURL(new RegExp(`/recurrence-plan-form\\?id=${P1}`));
  await expect(page.getByTestId("plan-price")).toHaveValue("25,00");
  await expect(page.getByTestId("plan-weeks")).toHaveValue("1");
  await page.getByTestId("plan-price").fill("27,00");
  await page.getByTestId("plan-save").click();
  await expect.poll(() => calls.saves).toEqual([{ target_active: true, target_interval_weeks: 1, target_name: null, target_plan_id: P1, target_price_cents: 2700, target_service_id: S1 }]);

  await expect(page.getByTestId("plan-toggle")).toHaveCSS("background-color", "rgb(220, 59, 48)");
  await page.getByTestId("plan-toggle").click();
  await expect.poll(() => (calls.saves as Array<{ target_active: boolean }>).at(-1)?.target_active).toBe(false);
});

test("back from the plan screens goes to the fixed parents", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { saves: [] });

  const back = () => page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();

  await page.goto(`/recurrence-plan-form?id=${P1}`);
  await back();
  await expect(page).toHaveURL(/\/recurrence-plans$/);
  await back();
  await expect(page).toHaveURL(/\/manage$/);
});
```
Run (Expo restarted) → FAIL (no such routes).

- [ ] **Step 2: List screen** `app/(owner)/recurrence-plans.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { FabAdd } from "../../src/components/ui/FabAdd";
import { Screen } from "../../src/components/ui/Screen";
import { listRecurrencePlans, planTitle } from "../../src/features/recurrence/plans-api";
import { recurrencePriceText } from "../../src/features/recurrence/price-text";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function RecurrencePlansScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const plans = useQuery({ enabled: shopId !== null, queryFn: () => listRecurrencePlans(supabase, shopId ?? ""), queryKey: ["owner-recurrence-plans", shopId] });
  const loading = shop.isLoading || plans.isLoading;
  const loadError = shop.error ?? plans.error;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1" contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.plans.title")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.plans.saveError"))}</Text> : null}
            {plans.data && plans.data.length === 0 ? <EmptyState title={t("owner.plans.empty")} /> : null}
            {(plans.data ?? []).map((plan) => (
              <Card key={plan.id} testID={`plan-${plan.id}`} variant="outlined">
                <View className="gap-2">
                  <Text className="text-base font-sans-semibold text-ink">{planTitle(t, plan)}{plan.active ? "" : ` ${t("owner.plans.inactive")}`}</Text>
                  <Text className="text-sm font-sans text-neutral-600">{plan.serviceName} · {t("recurrence.normalPrice", { price: formatPriceBRL(plan.normalCents) })}</Text>
                  <Text className="text-sm font-sans-medium text-ink">{recurrencePriceText(t, plan.priceCents, plan.weeks)}</Text>
                  <View className="flex-row">
                    <Button label={t("common.edit")} onPress={() => router.push({ params: { id: plan.id }, pathname: "/recurrence-plan-form" })} size="sm" testID={`plan-edit-${plan.id}`} variant="outline" />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
      <FabAdd label={t("owner.plans.add")} onPress={() => router.push("/recurrence-plan-form")} />
    </Screen>
  );
}
```
(The first line of a plan card uses the plan's name when it has one; otherwise `Seed cut · Weekly`.)

- [ ] **Step 3: Form screen** `app/(owner)/recurrence-plan-form.tsx`

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { RadioBlock } from "../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listRecurrencePlans, saveRecurrencePlan } from "../../src/features/recurrence/plans-api";
import { recurrencePriceText } from "../../src/features/recurrence/price-text";
import { useOwnerServiceCatalog } from "../../src/features/services/use-owner-catalog";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// Create (no `id`) or edit (`?id=`) a recurrence plan.
export default function RecurrencePlanFormScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const field = useFieldChain(3);
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const { catalog } = useOwnerServiceCatalog();
  const plans = useQuery({ enabled: shopId !== null, queryFn: () => listRecurrencePlans(supabase, shopId ?? ""), queryKey: ["owner-recurrence-plans", shopId] });
  const plan = id ? plans.data?.find((candidate) => candidate.id === id) ?? null : null;
  const services = (catalog.data?.services ?? []).filter((service) => service.active);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [weeksText, setWeeksText] = useState("1");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  useEffect(() => {
    if (!plan) return;
    setServiceId(plan.serviceId);
    setName(plan.name ?? "");
    setPriceText(centsToReaisInput(plan.priceCents));
    setWeeksText(String(plan.weeks));
  }, [plan]);

  const priceCents = parseReaisToCents(priceText);
  const weeks = Number(weeksText);
  const weeksValid = Number.isInteger(weeks) && weeks >= 1 && weeks <= 12;
  const valid = serviceId !== null && priceCents !== null && weeksValid;

  const save = useMutation({
    mutationFn: (active: boolean) => saveRecurrencePlan(supabase, { active, id: id ?? null, name, priceCents: priceCents ?? 0, serviceId: serviceId ?? "", weeks }),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.plans.saveError")), variant: "error" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-plans"] });
      if (id) setFeedback({ message: t("owner.plans.saved"), variant: "success" });
      else back();
    },
  });

  const loading = shop.isLoading || catalog.isLoading || plans.isLoading;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={id ? t("owner.plans.editTitle") : t("owner.plans.newTitle")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {id && plans.data && !plan ? <EmptyState title={t("owner.plans.notFound")} /> : null}

            {!id || plan ? (
              <>
                <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.plans.service")}</Text>
                <RadioBlock items={services.map((service) => ({ key: `plan-service-${service.id}`, label: service.name, onPress: () => setServiceId(service.id), selected: service.id === serviceId }))} />
                <Input {...field(0)} label={t("owner.plans.name")} onChangeText={setName} placeholder={t("examples.serviceName")} testID="plan-name" value={name} />
                <Input {...field(1)} keyboardType="numeric" label={t("owner.plans.price")} onChangeText={setPriceText} placeholder={t("examples.money")} testID="plan-price" value={priceText} />
                <View className="flex-row gap-2">
                  <Button label={t("owner.plans.quickMonthly")} onPress={() => setWeeksText("1")} size="sm" testID="plan-weeks-1" variant={weeksText === "1" ? "dark" : "outline"} />
                  <Button label={t("owner.plans.quickBiweekly")} onPress={() => setWeeksText("2")} size="sm" testID="plan-weeks-2" variant={weeksText === "2" ? "dark" : "outline"} />
                </View>
                <Input {...field(2)} keyboardType="number-pad" label={t("owner.plans.every")} onChangeText={setWeeksText} placeholder={t("examples.weeks")} testID="plan-weeks" value={weeksText} />
                {priceCents !== null && weeksValid ? <Text className="text-sm font-sans-medium text-ink" testID="plan-summary">{recurrencePriceText(t, priceCents, weeks)}</Text> : null}
                <Button disabled={!valid || save.isPending} label={t("owner.plans.save")} onPress={() => save.mutate(plan ? plan.active : true)} testID="plan-save" />
                {plan ? (
                  <Button disabled={save.isPending} label={plan.active ? t("common.deactivate") : t("common.activate")} onPress={() => save.mutate(!plan.active)} testID="plan-toggle" variant={plan.active ? "danger" : "primary"} />
                ) : null}
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
```
(`save.mutate(false)` while `valid` could be false for an incomplete edit — the toggle button is enabled only while the loaded plan fills the fields, which `useEffect` does immediately.)

- [ ] **Step 4: Menu, layout and parents**
  - `app/(owner)/manage.tsx`: in the first `MenuBlock` after the `monthly-customers` item add `{ icon: Tags, key: "recurrence-plans", label: t("owner.manage.plans"), onPress: go("/recurrence-plans") }` (import `Tags` from `lucide-react-native`).
  - `app/(owner)/_layout.tsx`: add `"recurrence-plan-form"`, `"recurrence-plans"` to `MANAGE_SCREENS` (keep the list alphabetical).
  - `src/lib/navigation/parents.ts`: add `"/recurrence-plans": "/manage"` and `"/recurrence-plan-form": "/recurrence-plans"` under `// owner`.

- [ ] **Step 5: Verify** — `npm run typecheck` (callers of Tasks 4–6 may still fail; if only those fail, continue) then restart Expo and `npx playwright test tests/e2e/owner-recurrence-plans.web.spec.ts` → PASS; `npx jest tests/unit/route-parents-coverage.test.ts` → PASS.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: owner recurrence plans list and form"`

---

### Task 4: Manual (staff-created) recurrence uses plans

**Files:**
- Modify: `src/features/recurrence/ManualRecurrenceForm.tsx` (rewrite), `app/(barber)/my-profile/recurrence.tsx` (services prop), `tests/e2e/barber-recurrence.web.spec.ts`, `tests/e2e/recurrence.web.spec.ts`, `tests/e2e/owner-recurring.web.spec.ts`

**Interfaces — Produces:** `<ManualRecurrenceForm customers={{ id: string; name: string }[]} onCreated={() => void} onSearch?={(term: string) => void} services={{ barberId: string; barberServiceId: string; label: string }[]} />`. The frequency choices are the barber's active plans for the chosen service.

- [ ] **Step 1: Failing e2e** — in `tests/e2e/barber-recurrence.web.spec.ts` replace the `get_recurrence_quote` mock line by:

```ts
    if (path.endsWith("/rpc/list_recurrence_plans_for_barber")) {
      return json(route, [
        { barber_service_id: "bs1", interval_weeks: 1, name: null, normal_cents: 4000, plan_id: "plan-w1", price_cents: 3000, service_name: "Browser Cut" },
        { barber_service_id: "bs1", interval_weeks: 3, name: "Trimestral", normal_cents: 4000, plan_id: "plan-w3", price_cents: 3500, service_name: "Browser Cut" },
      ]);
    }
```
and in the test "a barber creates a recurrence for a customer without an account" replace `await page.getByTestId("option-weeks-2").click();` by `await page.getByTestId("option-plan-plan-w3").click();` and expect `target_interval_weeks: 3`. Apply the same two edits to `tests/e2e/recurrence.web.spec.ts` (owner manual test: mock `list_recurrence_plans_for_barber` with one weekly plan, replace `option-weeks-1` by `option-plan-plan-w1`, keep `target_interval_weeks: 1`, price text `R$ 30,00 per session`) and to `tests/e2e/owner-recurring.web.spec.ts` ("creates a recurrence for a customer without an account": same mock, `option-plan-plan-w1`). Run those three specs → FAIL.

- [ ] **Step 2: Rewrite** `src/features/recurrence/ManualRecurrenceForm.tsx`

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { RadioBlock } from "../../components/domain/RadioBlock";
import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DateInput, TimeInput } from "../../components/ui/MaskedInputs";
import { SearchInput } from "../../components/ui/SearchInput";
import { errorMessage } from "../../i18n/errors";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { useSupabaseSession } from "../../providers/AppProviders";
import { listPlansForBarber, planTitle } from "./plans-api";
import { recurrencePriceText } from "./price-text";
import { createRecurrenceForCustomer } from "./requests-api";

type Props = {
  customers: { id: string; name: string }[];
  onCreated: () => void;
  onSearch?: (term: string) => void;
  services: { barberId: string; barberServiceId: string; label: string }[];
};

// Staff-created recurring series, for customers who cannot send a request (no account). The periodicity and price come from the barber's plans.
export function ManualRecurrenceForm({ customers, onCreated, onSearch, services }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [barberServiceId, setBarberServiceId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);

  const service = services.find((item) => item.barberServiceId === barberServiceId) ?? null;
  const plans = useQuery({
    enabled: service !== null,
    queryFn: () => listPlansForBarber(supabase, service?.barberId ?? ""),
    queryKey: ["barber-plans", service?.barberId],
  });
  const servicePlans = (plans.data ?? []).filter((plan) => plan.barberServiceId === barberServiceId);
  const plan = servicePlans.find((candidate) => candidate.planId === planId) ?? null;

  const term = search.trim().toLowerCase();
  const shown = customers.filter((customer) => !term || customer.name.toLowerCase().includes(term));
  const valid = customerId !== null && plan !== null && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);

  const create = useMutation({
    mutationFn: () => createRecurrenceForCustomer(supabase, { barberServiceId: barberServiceId ?? "", customerId: customerId ?? "", startDate, startTime, weeks: plan?.weeks ?? 1 }),
    onError: (caught) => setError(errorMessage(caught, t, t("recurrence.sendError"))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-recurring"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
      onCreated();
    },
  });

  return (
    <Card testID="manual-recurrence">
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("recurrence.manualCustomer")}</Text>
        <SearchInput label={t("owner.appointmentForm.searchCustomer")} onChangeText={(value) => { setSearch(value); onSearch?.(value); }} placeholder={t("examples.search")} testID="manual-customer-search" value={search} />
        <ScrollView className="max-h-[220px]" nestedScrollEnabled>
          <RadioBlock items={shown.map((customer) => ({ key: `customer-${customer.id}`, label: customer.name, onPress: () => setCustomerId(customer.id), selected: customer.id === customerId }))} />
        </ScrollView>
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("recurrence.manualService")}</Text>
        <RadioBlock items={services.map((item) => ({ key: `service-${item.barberServiceId}`, label: item.label, onPress: () => { setBarberServiceId(item.barberServiceId); setPlanId(null); }, selected: item.barberServiceId === barberServiceId }))} />
        {service !== null ? (
          <>
            <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("recurrence.choosePlan")}</Text>
            {plans.data && servicePlans.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("recurrence.noPlans")}</Text> : null}
            <RadioBlock items={servicePlans.map((candidate) => ({ key: `plan-${candidate.planId}`, label: planTitle(t, candidate), onPress: () => setPlanId(candidate.planId), selected: candidate.planId === planId }))} />
          </>
        ) : null}
        {plan ? (
          <Text className="text-sm font-sans-medium text-ink" testID="manual-recurrence-price">
            {recurrencePriceText(t, plan.priceCents, plan.weeks)} · {t("recurrence.normalPrice", { price: formatPriceBRL(plan.normalCents) })}
          </Text>
        ) : null}
        <View className="flex-row items-end gap-2">
          <View className="flex-1"><DateInput label={t("owner.recurring.startDateLabel")} onChangeValue={setStartDate} testID="manual-recurrence-date" value={startDate} /></View>
          <View className="flex-1"><TimeInput label={t("owner.recurring.timeLabel")} onChangeValue={setStartTime} testID="manual-recurrence-time" value={startTime} /></View>
        </View>
        {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
        <Button disabled={!valid || create.isPending} label={t("owner.recurring.create")} onPress={() => create.mutate()} testID="manual-recurrence-save" />
      </View>
    </Card>
  );
}
```

- [ ] **Step 3: Pass `barberId` from the callers.**
  - `app/(barber)/my-profile/recurrence.tsx`: the services prop becomes `(services.data ?? []).filter((service) => service.active).map((service) => ({ barberId: barber.data?.id ?? "", barberServiceId: service.barberServiceId, label: service.serviceName }))`.
  - `app/(owner)/monthly-customers.tsx` is rewritten in Task 5 (its `labels` memo gets `barberId`).

- [ ] **Step 4: Verify** — restart Expo; `npx playwright test tests/e2e/barber-recurrence.web.spec.ts tests/e2e/recurrence.web.spec.ts` → PASS (the owner spec is verified after Task 5).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: manual recurrence picks a plan of the barber"`

---

### Task 5: Owner "Clientes recorrentes" without the Prices tab

**Files:**
- Modify: `app/(owner)/monthly-customers.tsx` (rewrite), `tests/e2e/owner-recurring.web.spec.ts`

- [ ] **Step 1: Failing e2e** — in `tests/e2e/owner-recurring.web.spec.ts`: delete the test "the owner sets the recurrence price per service and frequency" and its mocks (`list_recurrence_prices`, `set_recurrence_price`); add

```ts
test("the owner screen has only Requests and Active tabs; prices now live in the plans", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/monthly-customers");
  await expect(page.getByTestId("recurring-tab-requests")).toBeVisible();
  await expect(page.getByTestId("recurring-tab-active")).toBeVisible();
  await expect(page.getByTestId("recurring-tab-prices")).toHaveCount(0);
});
```
and in the request card test replace `toContainText("Weekly")` expectations only if the label text changed (it does not). Run → FAIL on the new test.

- [ ] **Step 2: Rewrite `app/(owner)/monthly-customers.tsx`** (the Prices tab, its query/mutation/drafts, `WEEKS`, `Input` and the money helpers disappear; the manual form gets `barberId`):

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { DateInput } from "../../src/components/ui/MaskedInputs";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import { listMonthlyCustomers } from "../../src/features/customers/monthly-api";
import { cancelRecurrenceOccurrence, endRecurrenceSeries, setRecurrenceSeriesActive } from "../../src/features/recurrence/api";
import { ManualRecurrenceForm } from "../../src/features/recurrence/ManualRecurrenceForm";
import { recurrenceLabel } from "../../src/features/recurrence/pricing";
import { RequestCard } from "../../src/features/recurrence/RequestCard";
import { decideRecurrenceRequest, listRecurrenceRequests } from "../../src/features/recurrence/requests-api";
import type { RecurrenceSeries } from "../../src/features/recurrence/types";
import { listOwnerBarberServices, listOwnerServices } from "../../src/features/services/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { useBack } from "../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type Tab = "active" | "requests";

export default function MonthlyCustomersScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const today = formatInstantInShopTime(new Date()).localDate;
  const [tab, setTab] = useState<Tab>("requests");
  const [manualOpen, setManualOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [occurrenceDate, setOccurrenceDate] = useState(today);

  const data = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const id = shopId ?? "";
      const [customers, barberServices, barbers, services, series] = await Promise.all([
        listOwnerCustomers(supabase, id),
        listOwnerBarberServices(supabase, id),
        listOwnerBarbers(supabase, id),
        listOwnerServices(supabase, id),
        listMonthlyCustomers(supabase, id),
      ]);

      return { barberServices: barberServices.filter((item) => item.active), barbers, customers: customers.filter((customer) => customer.active), series, services };
    },
    queryKey: ["owner-recurring", shopId],
  });
  const requests = useQuery({ enabled: shopId !== null, queryFn: () => listRecurrenceRequests(supabase, shopId ?? ""), queryKey: ["owner-recurrence-requests", shopId] });

  // Service choices are labelled "Barber · Service"; the same label names the service on each series.
  const labels = useMemo(() => {
    const map = new Map<string, { barberId: string; label: string }>();
    for (const item of data.data?.barberServices ?? []) {
      const barber = data.data?.barbers.find((candidate: OwnerBarber) => candidate.id === item.barberId);
      const service = data.data?.services.find((candidate) => candidate.id === item.serviceId);
      if (barber && service) map.set(item.id, { barberId: barber.id, label: `${barber.name} · ${service.name}` });
    }

    return map;
  }, [data.data]);

  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-recurring"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
  };

  const decide = useMutation({
    mutationFn: (input: { accept: boolean; id: string }) => decideRecurrenceRequest(supabase, input.id, input.accept),
    onError: (error) => fail(error, t("recurrence.decideError")),
    onSuccess: refresh,
  });
  const change = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onError: (error) => fail(error, t("owner.recurring.updateError")),
    onSuccess: refresh,
  });

  const busy = decide.isPending || change.isPending;
  const loading = shop.isLoading || data.isLoading;
  const loadError = shop.error ?? data.error;
  const tabButton = (key: Tab, label: string) => (
    <Button key={key} label={label} onPress={() => setTab(key)} size="sm" testID={`recurring-tab-${key}`} variant={tab === key ? "dark" : "outline"} />
  );

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.recurring.title")} />
            <Button label={t("owner.recurring.conflictsLink")} onPress={() => router.push("/recurrence-conflicts")} size="sm" testID="recurrence-conflicts-link" variant="outline" />
            <View className="flex-row gap-2">
              {tabButton("requests", t("recurrence.requestsTab"))}
              {tabButton("active", t("recurrence.activeTab"))}
            </View>

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.recurring.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            {tab === "requests" ? (
              <>
                {requests.data && requests.data.length === 0 ? <EmptyState title={t("recurrence.noRequests")} /> : null}
                {(requests.data ?? []).map((request) => (
                  <RequestCard busy={busy} key={request.id} onDecide={(accept) => decide.mutate({ accept, id: request.id })} request={request} />
                ))}
              </>
            ) : null}

            {tab === "active" ? (
              <>
                <Button label={t("recurrence.addManual")} onPress={() => setManualOpen((open) => !open)} size="sm" testID="recurring-manual" variant="outline" />
                {manualOpen ? (
                  <ManualRecurrenceForm
                    customers={(data.data?.customers ?? []).map((customer) => ({ id: customer.id, name: customer.fullName }))}
                    onCreated={() => {
                      setManualOpen(false);
                      setFeedback({ message: t("owner.recurring.saved"), variant: "success" });
                    }}
                    services={[...labels.entries()].map(([barberServiceId, item]) => ({ barberId: item.barberId, barberServiceId, label: item.label }))}
                  />
                ) : null}
                <DateInput label={t("owner.recurring.occurrenceLabel")} onChangeValue={setOccurrenceDate} testID="recurrence-occurrence-date" value={occurrenceDate} />
                {(data.data?.series ?? []).map((item: RecurrenceSeries) => (
                  <Card key={item.id} testID={`series-${item.id}`} variant="outlined">
                    <View className="gap-2">
                      <Text className="text-base font-sans-semibold text-ink">{item.customerName || item.customerId} · {recurrenceLabel(t, item.intervalWeeks)}</Text>
                      {labels.get(item.barberServiceId) ? <Text className="text-sm font-sans text-neutral-600">{labels.get(item.barberServiceId)?.label}</Text> : null}
                      <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                        {t("owner.recurring.detail", {
                          date: formatDateNumeric(item.localStartDate, language),
                          price: item.specialPriceCents === null ? t("owner.recurring.catalogPrice") : formatPriceBRL(item.specialPriceCents),
                          state: item.active ? t("owner.recurring.active") : t("owner.recurring.inactive"),
                          time: item.localStartTime,
                        })}
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {item.active ? <Button disabled={busy} label={t("common.deactivate")} onPress={() => change.mutate(() => setRecurrenceSeriesActive(supabase, item.id, false))} size="sm" testID={`series-deactivate-${item.id}`} variant="outline" /> : null}
                        <Button disabled={busy} label={t("owner.recurring.cancelOccurrence")} onPress={() => change.mutate(() => cancelRecurrenceOccurrence(supabase, item.id, occurrenceDate))} size="sm" testID={`series-cancel-${item.id}`} variant="outline" />
                        <Button disabled={busy || !item.active} label={t("owner.recurring.endSeries")} onPress={() => change.mutate(() => endRecurrenceSeries(supabase, item.id))} size="sm" testID={`series-end-${item.id}`} variant="danger" />
                      </View>
                    </View>
                  </Card>
                ))}
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
```
Remove from `src/i18n/locales/*` nothing (unused keys such as `recurrence.priceLabel`, `recurrence.pricesTab`, `recurrence.priceHint`, `recurrence.priceSaved`, `recurrence.savePrice` may stay or be deleted; delete them if `rg` shows no use).

- [ ] **Step 3: Verify** — `npm run typecheck` (only the customer screen may still fail until Task 6), restart Expo, `npx playwright test tests/e2e/owner-recurring.web.spec.ts tests/e2e/recurrence.web.spec.ts` → PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: owner recurring customers screen without prices (they are plans now)"`

---

### Task 6: Customer flow with steps (Barbeiro › Plano › Dia › Horário › Revisão › Enviar)

**Files:**
- Create: `src/components/domain/StepBar.tsx`, `src/features/recurrence/PlanCard.tsx`
- Modify: `src/components/domain/StepIndicator.tsx` (use `StepBar`), `src/components/domain/index.ts`, `app/(customer)/me/recurrence.tsx` (rewrite), `tests/e2e/recurrence-request.web.spec.ts` (rewrite)

**Produces:**
```ts
export type StepBarProps = {
  canSelect?: (key: string) => boolean;
  currentKey: string;
  label: string;
  onSelect?: (key: string) => void;
  steps: { key: string; label: string }[];
};
export function StepBar(props: StepBarProps): JSX.Element     // test ids: step-indicator, step-<key>, step-label
export function PlanCard(props: { normalText: string; onPress: () => void; priceText: string; testID: string; title: string }): JSX.Element
```

- [ ] **Step 1: Failing e2e** — rewrite `tests/e2e/recurrence-request.web.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { barberId, barberServiceId, json, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

const slot = { ends_at: "2099-01-04T12:30:00Z", local_date: "2099-01-04", local_time: "09:00:00", starts_at: "2099-01-04T12:00:00Z" };

test("a customer requests a plan: barber, plan, weekday, time, review, send; and can cancel the pending request", async ({ page }) => {
  const calls: Record<string, unknown> = {};
  let requests: unknown[] = [];

  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_recurrence_plans_for_barber")) {
      await json(route, [
        { barber_service_id: barberServiceId, interval_weeks: 1, name: null, normal_cents: 3500, plan_id: "plan-w1", price_cents: 2500, service_name: "Browser Cut" },
        { barber_service_id: barberServiceId, interval_weeks: 3, name: "Trimestral", normal_cents: 3500, plan_id: "plan-w3", price_cents: 3000, service_name: "Browser Cut" },
      ]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/get_available_slots")) {
      await json(route, [slot]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/list_my_recurrence_requests")) {
      await json(route, requests);
      return true;
    }
    if (url.pathname.endsWith("/rpc/request_recurrence")) {
      calls.request = route.request().postDataJSON();
      requests = [{ barber_name: "Browser Barber", id: "rq1", interval_weeks: 1, local_start_date: "2099-01-04", local_start_time: "09:00:00", recurrence_cents: 2500, service_name: "Browser Cut", status: "pending" }];
      await json(route, [{}]);
      return true;
    }
    if (url.pathname.endsWith("/rpc/cancel_my_recurrence_request")) {
      calls.cancel = route.request().postDataJSON();
      requests = [];
      await json(route, null);
      return true;
    }
  });

  await page.goto("/profile");
  await page.getByTestId("menu-recurrence").click();
  await expect(page).toHaveURL(/\/me\/recurrence/);
  await expect(page.getByText("You have no recurrence requests yet.")).toBeVisible();

  await page.getByTestId("recurrence-request").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 6 · Barber");
  await page.getByTestId(`barber-card-${barberId}`).click();

  // Plans of that barber: price per session, 4-week total when it exists, and the regular price.
  await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 6 · Plan");
  await expect(page.getByTestId("plan-card-plan-w1")).toContainText("Browser Cut · Weekly");
  await expect(page.getByTestId("plan-card-plan-w1")).toContainText("R$ 25,00 per session");
  await expect(page.getByTestId("plan-card-plan-w1")).toContainText("R$ 100,00");
  await expect(page.getByTestId("plan-card-plan-w3")).toContainText("Trimestral");
  await expect(page.getByTestId("plan-card-plan-w3")).not.toContainText("sessions in 4 weeks");
  await page.getByTestId("plan-card-plan-w1").click();

  // The weekday, then the times of its next occurrence.
  await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 6 · Day");
  await expect(page.getByTestId("weekday-1")).toBeVisible();
  await expect(page.getByTestId("weekday-7")).toBeVisible();
  await page.getByTestId("weekday-1").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 4 of 6 · Time");
  await expect(page.getByTestId("recurrence-time-continue")).toBeDisabled();
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByTestId("recurrence-time-continue").click();

  // Review, then send.
  await expect(page.getByTestId("step-label")).toHaveText("Step 5 of 6 · Review");
  await expect(page.getByTestId("recurrence-review")).toContainText("Every Monday");
  await expect(page.getByTestId("recurrence-review")).toContainText("09:00");
  await page.getByTestId("recurrence-send").click();
  await expect.poll(() => calls.request).toEqual({ target_barber_service_id: barberServiceId, target_interval_weeks: 1, target_start_date: "2099-01-04", target_start_time: "09:00" });

  await expect(page.getByTestId("my-request-status-rq1")).toHaveText("Awaiting reply");
  await page.getByTestId("my-request-cancel-rq1").click();
  await expect.poll(() => calls.cancel).toEqual({ target_request_id: "rq1" });
});

test("completed steps lead back and a barber without plans says so", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_recurrence_plans_for_barber")) {
      await json(route, []);
      return true;
    }
    if (url.pathname.endsWith("/rpc/list_my_recurrence_requests")) {
      await json(route, []);
      return true;
    }
  });

  await page.goto("/me/recurrence");
  await page.getByTestId("recurrence-request").click();
  await page.getByTestId(`barber-card-${barberId}`).click();
  await expect(page.getByText("This barber has no recurrence plans yet.")).toBeVisible();
  await page.getByTestId("step-barber").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 1 of 6 · Barber");
});
```
Run (Expo restarted) → FAIL.

- [ ] **Step 2: `StepBar`** `src/components/domain/StepBar.tsx`

```tsx
import { Pressable, Text, View } from "react-native";

export type StepBarProps = {
  canSelect?: (key: string) => boolean;
  currentKey: string;
  label: string;
  onSelect?: (key: string) => void;
  steps: { key: string; label: string }[];
};

// Slim progress segments + one label line. Completed segments can lead back when `canSelect` allows it.
export function StepBar({ canSelect, currentKey, label, onSelect, steps }: StepBarProps) {
  const position = steps.findIndex((step) => step.key === currentKey) + 1;

  return (
    <View className="w-full max-w-[420px] gap-1" testID="step-indicator">
      <View className="flex-row gap-1.5">
        {steps.map((step, index) => {
          const number = index + 1;
          const color = number < position ? "bg-primary-400" : number === position ? "bg-primary-600" : "bg-neutral-200";
          const enabled = number < position && Boolean(onSelect) && (canSelect ? canSelect(step.key) : true);

          return (
            <Pressable
              accessibilityLabel={step.label}
              accessibilityRole={enabled ? "button" : "text"}
              className="flex-1 justify-center py-2"
              disabled={!enabled}
              key={step.key}
              onPress={() => onSelect?.(step.key)}
              testID={`step-${step.key}`}
            >
              <View className={`h-1.5 rounded-full ${color}`} />
            </Pressable>
          );
        })}
      </View>
      <Text className="text-sm font-sans-medium text-neutral-600" style={{ fontVariant: ["tabular-nums"] }} testID="step-label">{label}</Text>
    </View>
  );
}
```
`src/components/domain/StepIndicator.tsx` (booking) becomes a thin wrapper; behaviour and test ids stay the same:

```tsx
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { BOOKING_STEPS, stepHref, stepNumber } from "../../features/booking/steps";
import type { BookingIds, BookingStep } from "../../features/booking/steps";
import { StepBar } from "./StepBar";

export function StepIndicator({ current, ids }: { current: BookingStep; ids: BookingIds }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <StepBar
      canSelect={(key) => stepHref(key as BookingStep, ids) !== null}
      currentKey={current}
      label={t("book.stepOf", { current: stepNumber(current), name: t(`book.steps.${current}`), total: BOOKING_STEPS.length })}
      onSelect={(key) => {
        const href = stepHref(key as BookingStep, ids);

        if (href) router.dismissTo(href as never);
      }}
      steps={BOOKING_STEPS.map((step) => ({ key: step, label: t(`book.steps.${step}`) }))}
    />
  );
}
```
Export `StepBar` from `src/components/domain/index.ts`. Verify the booking e2e still passes: `npx playwright test tests/e2e/booking.web.spec.ts`.

- [ ] **Step 3: `PlanCard`** `src/features/recurrence/PlanCard.tsx`

```tsx
import { Pressable, Text, View } from "react-native";

import { Card } from "../../components/ui/Card";

export function PlanCard({ normalText, onPress, priceText, testID, title }: { normalText: string; onPress: () => void; priceText: string; testID: string; title: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
      <Card variant="outlined">
        <View className="gap-1">
          <Text className="text-base font-sans-semibold text-ink">{title}</Text>
          <Text className="text-sm font-sans-medium text-ink">{priceText}</Text>
          <Text className="text-xs font-sans text-neutral-600">{normalText}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
```

- [ ] **Step 4: Rewrite the customer screen** `app/(customer)/me/recurrence.tsx`

```tsx
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { BarberCard } from "../../../src/components/domain/BarberCard";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { StepBar } from "../../../src/components/domain/StepBar";
import { TimeSlotPicker } from "../../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { getAvailableSlotsQueryOptions } from "../../../src/features/availability/query";
import type { AvailableSlot } from "../../../src/features/availability/types";
import { listPublicBarbers } from "../../../src/features/barbers/api";
import { PlanCard } from "../../../src/features/recurrence/PlanCard";
import { listPlansForBarber, planTitle } from "../../../src/features/recurrence/plans-api";
import type { BarberPlan } from "../../../src/features/recurrence/plans-api";
import { recurrenceLabel } from "../../../src/features/recurrence/pricing";
import { recurrencePriceText } from "../../../src/features/recurrence/price-text";
import { cancelMyRecurrenceRequest, listMyRecurrenceRequests, requestRecurrence } from "../../../src/features/recurrence/requests-api";
import { nextDateForWeekday } from "../../../src/features/recurrence/weekday";
import { listPublicShops } from "../../../src/features/shops/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../../src/lib/i18n/format";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useNow } from "../../../src/lib/use-now";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Step = "barber" | "list" | "plan" | "review" | "time" | "weekday";
const FLOW = ["barber", "plan", "weekday", "time", "review", "send"] as const;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

// The customer asks for a recurrence plan: barber › plan › weekday › time › review › send. The barber or the owner answers.
export default function CustomerRecurrenceScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(useNow()).localDate;
  const [trail, setTrail] = useState<Step[]>(["list"]);
  const step = trail[trail.length - 1];
  const [barberId, setBarberId] = useState("");
  const [plan, setPlan] = useState<BarberPlan | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const go = (next: Step) => setTrail((current) => [...current, next]);
  const goBack = () => (trail.length > 1 ? setTrail((current) => current.slice(0, -1)) : back());

  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shopId = shops.data?.[0]?.id ?? "";
  const barbers = useQuery({ enabled: Boolean(shopId), queryFn: () => listPublicBarbers(supabase, shopId), queryKey: ["public-barbers", shopId] });
  const plans = useQuery({ enabled: Boolean(barberId), queryFn: () => listPlansForBarber(supabase, barberId), queryKey: ["barber-plans", barberId] });
  const requests = useQuery({ queryFn: () => listMyRecurrenceRequests(supabase), queryKey: ["my-recurrence-requests"] });

  // The first date of a weekday is its next occurrence; weekdays without any free time are disabled.
  const dates = Object.fromEntries(WEEKDAYS.map((day) => [day, nextDateForWeekday(today, day)])) as Record<number, string>;
  const weekdaySlots = useQueries({
    queries: WEEKDAYS.map((day) => ({
      ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId: plan?.barberServiceId ?? "", localDate: dates[day] }),
      enabled: step === "weekday" && Boolean(barberId && plan),
    })),
  });
  const slots = weekday ? weekdaySlots[weekday - 1].data ?? [] : [];
  const slotRows: TimeSlot[] = slots.map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime }));
  const chosen = startsAt ? formatInstantInShopTime(new Date(startsAt)) : null;

  const send = useMutation({
    mutationFn: () => requestRecurrence(supabase, { barberServiceId: plan?.barberServiceId ?? "", startDate: chosen?.localDate ?? "", startTime: chosen?.localTime ?? "", weeks: plan?.weeks ?? 1 }),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.sendError")), variant: "error" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-recurrence-requests"] });
      setFeedback({ message: t("recurrence.sent"), variant: "success" });
      setStartsAt(null);
      setTrail(["list"]);
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelMyRecurrenceRequest(supabase, id),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.sendError")), variant: "error" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-recurrence-requests"] }),
  });

  const stepLabels = FLOW.map((key) => ({ key, label: t(`recurrence.steps.${key}`) }));
  const current = step === "list" ? null : step;
  const weekdayName = weekday ? t(`owner.schedule.weekdays.${WEEKDAY_KEYS[weekday - 1]}`) : "";

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={t("recurrence.title")} />
            {current ? (
              <StepBar
                canSelect={(key) => trail.includes(key as Step)}
                currentKey={current}
                label={t("book.stepOf", { current: FLOW.indexOf(current) + 1, name: t(`recurrence.steps.${current}`), total: FLOW.length })}
                onSelect={(key) => setTrail((existing) => existing.slice(0, existing.indexOf(key as Step) + 1))}
                steps={stepLabels}
              />
            ) : null}

            {step === "list" ? (
              <>
                <Button label={t("recurrence.request")} onPress={() => go("barber")} testID="recurrence-request" />
                <Text className="text-sm font-sans text-neutral-600">{t("recurrence.contactToEnd")}</Text>
                {requests.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
                {requests.data && requests.data.length === 0 ? <EmptyState title={t("recurrence.empty")} /> : null}
                {(requests.data ?? []).map((request) => (
                  <Card key={request.id} testID={`my-request-${request.id}`} variant="outlined">
                    <View className="gap-2">
                      <Text className="text-base font-sans-semibold text-ink">{request.serviceName} · {request.barberName}</Text>
                      <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                        {recurrenceLabel(t, request.weeks)} · {formatDateNumeric(request.startDate, language)} {request.startTime}
                      </Text>
                      <Text className="text-sm font-sans-medium text-ink" testID={`my-request-status-${request.id}`}>{t(`recurrence.status.${request.status}`)}</Text>
                      {request.status === "pending" ? (
                        <View className="flex-row">
                          <Button disabled={cancel.isPending} label={t("recurrence.cancelRequest")} onPress={() => cancel.mutate(request.id)} size="sm" testID={`my-request-cancel-${request.id}`} variant="outline" />
                        </View>
                      ) : null}
                    </View>
                  </Card>
                ))}
              </>
            ) : null}

            {step === "barber" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseBarber")}</Text>
                {(barbers.data ?? []).map((barber) => (
                  <BarberCard avatarUrl={barber.avatarUrl} key={barber.id} name={barber.name} onPress={() => { setBarberId(barber.id); setPlan(null); setWeekday(null); setStartsAt(null); go("plan"); }} testID={`barber-card-${barber.id}`} />
                ))}
              </>
            ) : null}

            {step === "plan" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.choosePlan")}</Text>
                {plans.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
                {plans.data && plans.data.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("recurrence.noPlans")}</Text> : null}
                {(plans.data ?? []).map((candidate) => (
                  <PlanCard
                    key={candidate.planId}
                    normalText={t("recurrence.normalPrice", { price: formatPriceBRL(candidate.normalCents) })}
                    onPress={() => { setPlan(candidate); setWeekday(null); setStartsAt(null); go("weekday"); }}
                    priceText={recurrencePriceText(t, candidate.priceCents, candidate.weeks)}
                    testID={`plan-card-${candidate.planId}`}
                    title={planTitle(t, candidate)}
                  />
                ))}
              </>
            ) : null}

            {step === "weekday" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseWeekday")}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const result = weekdaySlots[day - 1];
                    const noTimes = result.isSuccess && (result.data ?? []).length === 0;

                    return (
                      <Button
                        disabled={noTimes}
                        key={day}
                        label={t(`owner.schedule.weekdays.${WEEKDAY_KEYS[day - 1]}`)}
                        onPress={() => { setWeekday(day); setStartsAt(null); go("time"); }}
                        testID={`weekday-${day}`}
                        variant="outline"
                      />
                    );
                  })}
                </View>
              </>
            ) : null}

            {step === "time" && weekday ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseTime")}</Text>
                <Text className="text-sm font-sans text-neutral-600">{t("recurrence.everyWeekday", { weekday: weekdayName })} · {t("recurrence.startsOn", { date: formatDateNumeric(dates[weekday], language) })}</Text>
                {weekdaySlots[weekday - 1].isLoading ? <SkeletonBlock height={56} width={320} /> : null}
                {weekdaySlots[weekday - 1].isSuccess && slots.length === 0 ? <EmptyState title={t("recurrence.noTimesWeekday")} /> : null}
                {slotRows.length > 0 ? <TimeSlotPicker onSelectSlot={(time) => setStartsAt(slots.find((slot: AvailableSlot) => slot.localTime === time)?.startsAt ?? null)} slots={slotRows} /> : null}
                <Button disabled={!startsAt} label={t("book.continue")} onPress={() => go("review")} testID="recurrence-time-continue" />
              </>
            ) : null}

            {step === "review" && plan && chosen ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.review")}</Text>
                <Card testID="recurrence-review">
                  <View className="gap-2">
                    <Text className="text-base font-sans-semibold text-ink">{planTitle(t, plan)}</Text>
                    <Text className="text-sm font-sans text-neutral-700">{t("recurrence.everyWeekday", { weekday: weekdayName })} · {recurrenceLabel(t, plan.weeks)}</Text>
                    <Text className="text-sm font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>{t("recurrence.startsOn", { date: formatDateNumeric(chosen.localDate, language) })} · {chosen.localTime}</Text>
                    <Text className="text-sm font-sans-medium text-ink">{recurrencePriceText(t, plan.priceCents, plan.weeks)}</Text>
                  </View>
                </Card>
                <Button disabled={send.isPending} label={t("recurrence.send")} onPress={() => send.mutate()} testID="recurrence-send" />
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```
Notes for the implementer: the step bar's `send` segment is the label of the final **Enviar** button (there is no sixth screen); `weekdaySlots[...]` queries are cached per date so the time step reuses the weekday step's data; `getAvailableSlotsQueryOptions` is the same helper booking uses.

- [ ] **Step 5: Verify** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/recurrence-request.web.spec.ts tests/e2e/booking.web.spec.ts` → PASS. Screenshot the flow at 375px (plan list, weekday buttons, time, review) and compare the step bar with booking's.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: customer recurrence flow by plan, weekday and time with steps"`

---

### Task 7: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db` (only the known `010`/`012` dev-data failures), full web e2e (`--workers=3`); restore `.env.local`; push `feat-recurrence-plans`; PR via `gh api` REST (base: `feat-agenda-cards`). Deploy note: apply migration `0053` to hosted Supabase (user's step); the existing weekly/biweekly prices become plans automatically. On a phone: owner Manage › Planos de recorrência (create a plan), customer Perfil › Recorrência (barbeiro › plano › dia › horário › revisão › enviar), then accept as barber/owner.
