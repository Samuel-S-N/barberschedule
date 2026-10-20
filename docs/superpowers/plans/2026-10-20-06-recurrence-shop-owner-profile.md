# Recurrence Requests, Shop Settings and Owner Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (A) Customers request a fixed recurrence (weekly / every 2 weeks); the chosen barber or the owner accepts; the owner defines special per-service recurrence prices. (B) Improvements to Manage › Schedule and Shop screens. (C) Owner profile mirroring the customer/barber profile, including "Atender como barbeiro".

**Architecture:** Reuse the existing recurrence engine (`recurrence_series`, `ensure_recurrence_window`, hourly `materialize_recurrence_job`) untouched. New tables `recurrence_requests` and `service_recurrence_prices`, accessed only through `SECURITY DEFINER` RPCs. Accepting a request inserts a `recurrence_series` with `special_price_cents` taken from the price table, then materialises the window the same way the cron job does (temporarily setting the owner as `request.jwt.claim.sub`). Shop/schedule improvements are client-side only (existing APIs). Owner profile re-exports role-agnostic screens like `(barber)/my-profile/about.tsx` already does.

**Tech Stack:** Postgres/pgTAP, Expo Router, React Query, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/plans/2026-10-20-ux-overhaul-index.md`

## Global Constraints
- Branch `feat-recurrence-requests` from `main`; run **last** (needs Plans 1, 2, 4, 5: masks, `notifications` table, barber availability, owner `barber-profile` route, `SearchInput`).
- Frequencies exactly: `interval_weeks` ∈ {1, 2} → "Semanal"/"Weekly"/"Semanal" and "Quinzenal (a cada 2 semanas)"/"Every 2 weeks"/"Cada 2 semanas". **14 days, not 15** (keeps the same weekday; the engine steps in whole weeks) — flagged in the PR.
- Total shown for a month = price × sessions in 28 days (weekly 4, biweekly 2): "R$ 25 × 4 = R$ 100" for the owner's example (Seed cut 35 → weekly 25).
- Price source of truth: `service_recurrence_prices` (per service × frequency). Missing price ⇒ the normal price applies (`special_price_cents = null`).
- Error codes (free ones): `P0031 RECURRENCE_REQUEST_NOT_PENDING`, `P0032 RECURRENCE_PRICE_INVALID`; add both to `src/lib/errors/domain-errors.ts` (read how `P0015` is mapped there at line ~94) and `src/i18n/errors.ts`.
- Customers end an active series by contacting the shop (owner/barber end it with the existing "end series"); a customer self-cancel of an *active* series is a follow-up, not in this plan. Pending requests can be cancelled by the customer.
- Memory: TDD, `rtk`, verify UI in browser, jest only `tests/**/*.test.ts`, migrations numbered after the last one on `main` (adjust `0050…` below).

---

## Part A — Recurrence

### Task 1: Database

**Files:** Create `supabase/migrations/0050_recurrence_requests.sql`; Test `supabase/tests/013_recurrence_requests.sql`

**Produces (DB):** tables `recurrence_requests`, `service_recurrence_prices`; RPCs
`get_recurrence_quote(target_barber_service_id uuid) → (interval_weeks smallint, normal_cents integer, recurrence_cents integer)` (rows for 1 and 2),
`request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time) → setof recurrence_requests`,
`cancel_my_recurrence_request(target_request_id uuid) → void`,
`list_my_recurrence_requests() → (id, status, interval_weeks, local_start_date, local_start_time, barber_name, service_name, recurrence_cents)`,
`list_recurrence_requests(target_shop_id uuid) → (id, customer_name, customer_phone, barber_id, barber_name, service_name, interval_weeks, local_start_date, local_start_time, normal_cents, recurrence_cents)` (pending only; owner = whole shop, barber = own),
`decide_recurrence_request(target_request_id uuid, accept boolean) → setof recurrence_requests`,
`set_recurrence_price(target_service_id uuid, target_interval_weeks integer, target_price_cents integer) → void` (null price deletes), `list_recurrence_prices(target_shop_id uuid) → (service_id, interval_weeks, price_cents)`,
`create_recurrence_for_customer(target_customer_id uuid, target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time) → setof recurrence_series` (staff-initiated, for customers without an account; owner or the service's own barber; price from the table),
`add_inbox_event(target_user uuid, target_kind text, target_params jsonb, target_key text, push_event text default null) → void` (inbox row + optional push row in `notification_outbox`; the outbox `event_type` check already allows `recurrence.requested|accepted|rejected` from Plan 2),
internal `materialize_shop_as_owner(target_shop_id uuid) → void` (not granted); `notifications.kind` check extended with `recurrence_requested`, `recurrence_accepted`, `recurrence_rejected`.

- [ ] **Step 1: failing pgTAP.** Fixture: copy `supabase/tests/009_notifications.sql` setup (owner `90…01`, customer `90…02` with customers row, shop, barber `92…01` with `user_id` = new barber user `90…03` profile role `barber`, service `93…01` price 3500, barber_service `94…01`) plus `working_periods` for the weekday of the chosen date (see `004_availability.sql`). Assertions (`plan(18)`):

```sql
-- owner sets prices
set local role authenticated; select set_config('request.jwt.claim.sub', owner, true);
select lives_ok($$ select public.set_recurrence_price('93…01', 1, 2500) $$, 'owner sets weekly price');
select throws_ok($$ select public.set_recurrence_price('93…01', 3, 2500) $$, 'P0032', null, 'only 1 or 2 weeks');
-- customer quote and request
select set_config('request.jwt.claim.sub', customer, true);
select is((select recurrence_cents from public.get_recurrence_quote('94…01') where interval_weeks = 1), 2500, 'quote weekly');
select is((select normal_cents from public.get_recurrence_quote('94…01') where interval_weeks = 2), 3500, 'normal price shown');
select is((select count(*)::int from public.request_recurrence('94…01', 1, :future_monday, '10:00')), 1, 'request created');
select throws_ok($$ select * from public.request_recurrence('94…01', 1, :future_monday, '11:00') $$, '23505', null, 'one pending per customer and barber service');
select throws_ok($$ select * from public.request_recurrence('94…01', 2, :future_monday, '10:07') $$, 'P0001', null, 'first slot must be a bookable time');
select is((select count(*)::int from public.notification_outbox where event_type = 'recurrence.requested'), 2, 'barber and owner get a push for the request');
-- barber sees it, customer must not
select set_config('request.jwt.claim.sub', barber_user, true);
select is((select count(*)::int from public.list_recurrence_requests('91…01')), 1, 'barber sees own pending request');
select set_config('request.jwt.claim.sub', customer, true);
select throws_ok($$ select * from public.decide_recurrence_request('<id>', true) $$, 'P0010', null, 'customer cannot decide');
-- accept as barber
select set_config('request.jwt.claim.sub', barber_user, true);
select lives_ok($$ select * from public.decide_recurrence_request('<id>', true) $$, 'barber accepts');
select is((select special_price_cents from public.recurrence_series limit 1), 2500, 'series carries the recurrence price');
select ok((select count(*) from public.appointments where source = 'recurrence') >= 1, 'occurrences were materialised');
select throws_ok($$ select * from public.decide_recurrence_request('<id>', true) $$, 'P0031', null, 'cannot decide twice');
select is((select count(*)::int from public.notification_outbox where event_type = 'recurrence.accepted' and recipient_user_id = :customer), 1, 'customer gets a push when accepted');
-- staff-created series for a customer without an account
select is((select count(*)::int from public.create_recurrence_for_customer(:walkin_customer, '94…01', 2, :future_tuesday, '11:00')), 1, 'barber creates a series for a walk-in customer');
select is((select special_price_cents from public.recurrence_series where customer_id = :walkin_customer), null, 'no biweekly price set → normal price applies');
set local role authenticated; select set_config('request.jwt.claim.sub', :customer, true);
select throws_ok($$ select * from public.create_recurrence_for_customer(:walkin_customer, '94…01', 1, :future_tuesday, '12:00') $$, 'P0010', null, 'customers cannot create series for others');
```
(The request id is read with a `select id into temp` before the calls, as other pgTAP files do.)
- [ ] **Step 2:** `npm run test:db` → FAIL.
- [ ] **Step 3: migration** (full):

```sql
create type public.recurrence_request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');

create table public.service_recurrence_prices (
  shop_id uuid not null,
  service_id uuid not null,
  interval_weeks smallint not null check (interval_weeks in (1, 2)),
  price_cents integer not null check (price_cents >= 0),
  primary key (service_id, interval_weeks),
  foreign key (shop_id, service_id) references public.services (shop_id, id) on delete cascade
);

create table public.recurrence_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  customer_id uuid not null,
  barber_id uuid not null,
  barber_service_id uuid not null,
  interval_weeks smallint not null check (interval_weeks in (1, 2)),
  local_start_date date not null,
  local_start_time time not null,
  status public.recurrence_request_status not null default 'pending',
  series_id uuid references public.recurrence_series (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (shop_id, customer_id) references public.customers (shop_id, id) on delete restrict,
  foreign key (shop_id, barber_service_id) references public.barber_services (shop_id, id) on delete restrict
);
create unique index recurrence_requests_one_pending on public.recurrence_requests (customer_id, barber_service_id) where status = 'pending';

alter table public.service_recurrence_prices enable row level security;
alter table public.recurrence_requests enable row level security;
revoke all on table public.service_recurrence_prices, public.recurrence_requests from anon, authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'appointment_awaiting_confirmation','appointment_booked','appointment_confirmed','appointment_cancelled','appointment_rescheduled',
  'recurrence_requested','recurrence_accepted','recurrence_rejected'));

create function public.add_inbox_event(target_user uuid, target_kind text, target_params jsonb, target_key text, push_event text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if target_user is null or target_user is not distinct from auth.uid() then return; end if;
  insert into public.notifications (user_id, kind, params, event_key) values (target_user, target_kind, target_params, target_key)
  on conflict (event_key) do nothing;
  if found and push_event is not null then
    insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
    values ('push:' || target_key, push_event, target_user, target_params)
    on conflict (event_key) do nothing;
  end if;
end;
$$;
revoke all on function public.add_inbox_event(uuid, text, jsonb, text, text) from public;

-- The recurrence engine is owner-gated; this is the same impersonation materialize_recurrence_job uses.
create function public.materialize_shop_as_owner(target_shop_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  shop_row public.shops%rowtype;
  original_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select * into shop_row from public.shops where id = target_shop_id;
  perform set_config('request.jwt.claim.sub', shop_row.owner_user_id::text, true);
  perform public.ensure_recurrence_window(target_shop_id, (clock_timestamp() at time zone shop_row.timezone)::date + 90);
  perform set_config('request.jwt.claim.sub', coalesce(original_sub, ''), true);
end;
$$;
revoke all on function public.materialize_shop_as_owner(uuid) from public;

create function public.set_recurrence_price(target_service_id uuid, target_interval_weeks integer, target_price_cents integer)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare svc_shop uuid;
begin
  select shop_id into svc_shop from public.services where id = target_service_id;
  if svc_shop is null or not public.is_shop_owner(svc_shop) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_interval_weeks not in (1, 2) or target_price_cents < 0 then
    raise exception using errcode = 'P0032', message = 'RECURRENCE_PRICE_INVALID';
  end if;
  if target_price_cents is null then
    delete from public.service_recurrence_prices where service_id = target_service_id and interval_weeks = target_interval_weeks;
  else
    insert into public.service_recurrence_prices (shop_id, service_id, interval_weeks, price_cents)
    values (svc_shop, target_service_id, target_interval_weeks, target_price_cents)
    on conflict (service_id, interval_weeks) do update set price_cents = excluded.price_cents;
  end if;
end;
$$;

create function public.list_recurrence_prices(target_shop_id uuid)
returns table (service_id uuid, interval_weeks smallint, price_cents integer)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  return query select p.service_id, p.interval_weeks, p.price_cents from public.service_recurrence_prices p where p.shop_id = target_shop_id;
end;
$$;

create function public.get_recurrence_quote(target_barber_service_id uuid)
returns table (interval_weeks smallint, normal_cents integer, recurrence_cents integer)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN'; end if;
  return query
  select w.weeks::smallint,
         coalesce(bs.price_override_cents, s.price_cents),
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = w.weeks)
  from public.barber_services bs
  join public.services s on s.id = bs.service_id and s.shop_id = bs.shop_id
  cross join (values (1), (2)) as w(weeks)
  where bs.id = target_barber_service_id and bs.active and s.active;
end;
$$;

create function public.request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time)
returns setof public.recurrence_requests
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  bs public.barber_services%rowtype;
  cust public.customers%rowtype;
  tz text;
  local_today date;
  created public.recurrence_requests%rowtype;
  owner_user uuid;
  barber_user uuid;
  params jsonb;
begin
  select * into bs from public.barber_services where id = target_barber_service_id and active;
  select * into cust from public.customers where user_id = auth.uid() and shop_id = bs.shop_id and active;
  if bs.id is null or cust.id is null then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  select timezone, owner_user_id into tz, owner_user from public.shops where id = bs.shop_id;
  local_today := (clock_timestamp() at time zone tz)::date;
  if target_interval_weeks not in (1, 2) or target_start_date < local_today or target_start_date > local_today + 90 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;
  if not exists (
    select 1 from public.get_available_slots(bs.barber_id, target_start_date, bs.id) slot where slot.local_time = target_start_time
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  insert into public.recurrence_requests (shop_id, customer_id, barber_id, barber_service_id, interval_weeks, local_start_date, local_start_time)
  values (bs.shop_id, cust.id, bs.barber_id, bs.id, target_interval_weeks, target_start_date, target_start_time)
  returning * into created;

  select user_id into barber_user from public.barbers where id = bs.barber_id;
  params := jsonb_build_object('customer_name', cust.full_name, 'interval_weeks', target_interval_weeks,
    'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(barber_user, 'recurrence_requested', params, format('recreq:%s:%s', created.id, barber_user), 'recurrence.requested');
  if owner_user is distinct from barber_user then
    perform public.add_inbox_event(owner_user, 'recurrence_requested', params, format('recreq:%s:%s', created.id, owner_user), 'recurrence.requested');
  end if;

  return next created;
end;
$$;

create function public.cancel_my_recurrence_request(target_request_id uuid)
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  update public.recurrence_requests r set status = 'cancelled', decided_at = clock_timestamp()
  where r.id = target_request_id and r.status = 'pending'
    and exists (select 1 from public.customers c where c.id = r.customer_id and c.user_id = auth.uid());
$$;

create function public.list_my_recurrence_requests()
returns table (id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
               barber_name text, service_name text, recurrence_cents integer)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.status, r.interval_weeks, r.local_start_date, r.local_start_time, b.name, s.name,
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks)
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id and c.user_id = auth.uid()
  join public.barbers b on b.id = r.barber_id
  join public.barber_services bs on bs.id = r.barber_service_id
  join public.services s on s.id = bs.service_id
  order by r.created_at desc limit 20;
$$;

create function public.list_recurrence_requests(target_shop_id uuid)
returns table (id uuid, customer_name text, customer_phone text, barber_id uuid, barber_name text, service_name text,
               interval_weeks smallint, local_start_date date, local_start_time time, normal_cents integer, recurrence_cents integer)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, c.full_name, c.phone, r.barber_id, b.name, s.name, r.interval_weeks, r.local_start_date, r.local_start_time,
         coalesce(bs.price_override_cents, s.price_cents),
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks)
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id
  join public.barbers b on b.id = r.barber_id
  join public.barber_services bs on bs.id = r.barber_service_id
  join public.services s on s.id = bs.service_id
  where r.shop_id = target_shop_id and r.status = 'pending'
    and (public.is_shop_owner(target_shop_id) or public.is_own_barber(r.barber_id))
  order by r.created_at;
$$;

create function public.decide_recurrence_request(target_request_id uuid, accept boolean)
returns setof public.recurrence_requests
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  req public.recurrence_requests%rowtype;
  bs public.barber_services%rowtype;
  new_series_id uuid;
  price integer;
  customer_user uuid;
  result public.recurrence_requests%rowtype;
begin
  select * into req from public.recurrence_requests where id = target_request_id for update;
  if not found then raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if not (public.is_shop_owner(req.shop_id) or public.is_own_barber(req.barber_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if req.status <> 'pending' then
    raise exception using errcode = 'P0031', message = 'RECURRENCE_REQUEST_NOT_PENDING';
  end if;

  select * into bs from public.barber_services where id = req.barber_service_id;
  select user_id into customer_user from public.customers where id = req.customer_id;

  if accept then
    select p.price_cents into price from public.service_recurrence_prices p where p.service_id = bs.service_id and p.interval_weeks = req.interval_weeks;
    insert into public.recurrence_series (shop_id, customer_id, barber_service_id, local_start_date, local_start_time, interval_weeks, special_price_cents)
    values (req.shop_id, req.customer_id, req.barber_service_id, req.local_start_date, req.local_start_time, req.interval_weeks, price)
    returning id into new_series_id;

    perform public.materialize_shop_as_owner(req.shop_id);
  end if;

  update public.recurrence_requests
  set status = case when accept then 'accepted' else 'rejected' end::public.recurrence_request_status,
      series_id = new_series_id, decided_by = auth.uid(), decided_at = clock_timestamp()
  where id = req.id returning * into result;

  perform public.add_inbox_event(customer_user, case when accept then 'recurrence_accepted' else 'recurrence_rejected' end,
    jsonb_build_object('service_name', (select name from public.services where id = bs.service_id), 'interval_weeks', req.interval_weeks),
    format('recdec:%s', req.id),
    case when accept then 'recurrence.accepted' else 'recurrence.rejected' end);

  return next result;
end;
$$;

create function public.create_recurrence_for_customer(
  target_customer_id uuid, target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time
)
returns setof public.recurrence_series
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  bs public.barber_services%rowtype;
  tz text;
  local_today date;
  price integer;
  created public.recurrence_series%rowtype;
  customer_user uuid;
begin
  select * into bs from public.barber_services where id = target_barber_service_id and active;
  if bs.id is null or not exists (
    select 1 from public.customers c where c.id = target_customer_id and c.shop_id = bs.shop_id and c.active
  ) then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  if not (public.is_shop_owner(bs.shop_id) or public.is_own_barber(bs.barber_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  select timezone into tz from public.shops where id = bs.shop_id;
  local_today := (clock_timestamp() at time zone tz)::date;
  if target_interval_weeks not in (1, 2) or target_start_date < local_today or target_start_date > local_today + 90 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  select p.price_cents into price from public.service_recurrence_prices p
  where p.service_id = bs.service_id and p.interval_weeks = target_interval_weeks;
  insert into public.recurrence_series (shop_id, customer_id, barber_service_id, local_start_date, local_start_time, interval_weeks, special_price_cents)
  values (bs.shop_id, target_customer_id, bs.id, target_start_date, target_start_time, target_interval_weeks, price)
  returning * into created;
  perform public.materialize_shop_as_owner(bs.shop_id);

  select user_id into customer_user from public.customers where id = target_customer_id;
  perform public.add_inbox_event(customer_user, 'recurrence_accepted',
    jsonb_build_object('service_name', (select name from public.services where id = bs.service_id), 'interval_weeks', target_interval_weeks),
    format('recman:%s', created.id), 'recurrence.accepted');

  return next created;
end;
$$;

revoke all on function public.set_recurrence_price(uuid, integer, integer), public.list_recurrence_prices(uuid),
  public.get_recurrence_quote(uuid), public.request_recurrence(uuid, integer, date, time), public.cancel_my_recurrence_request(uuid),
  public.list_my_recurrence_requests(), public.list_recurrence_requests(uuid), public.decide_recurrence_request(uuid, boolean),
  public.create_recurrence_for_customer(uuid, uuid, integer, date, time) from public;
grant execute on function public.set_recurrence_price(uuid, integer, integer), public.list_recurrence_prices(uuid),
  public.get_recurrence_quote(uuid), public.request_recurrence(uuid, integer, date, time), public.cancel_my_recurrence_request(uuid),
  public.list_my_recurrence_requests(), public.list_recurrence_requests(uuid), public.decide_recurrence_request(uuid, boolean),
  public.create_recurrence_for_customer(uuid, uuid, integer, date, time) to authenticated;
```
Notes: in `request_recurrence` the first occurrence is validated against `get_available_slots` (later occurrences that collide become `recurrence_conflicts` through the existing engine, shown in the owner's conflicts screen). `ensure_recurrence_window` rejects `through_date` > local today + 90 — passing exactly +90 is allowed. In `request_recurrence`, `bs` null-guard uses `bs.id is null`. `notifications.kind` check name `notifications_kind_check` is the auto name from Plan 2 — confirm with `\d public.notifications`.
- [ ] **Step 4:** `npm run test:db` → PASS (also re-run all earlier pgTAP files). **Step 5:** commit `feat(db): recurrence requests and recurrence prices`.

---

### Task 2: Pure pricing helpers and client API

**Files:** Create `src/features/recurrence/pricing.ts`, `src/features/recurrence/requests-api.ts`; Test `tests/unit/recurrence-pricing.test.ts`, `tests/unit/recurrence-requests-api.test.ts`; Modify `src/lib/errors/domain-errors.ts`, `src/i18n/errors.ts`, `src/features/notifications/inbox-api.ts` (kinds), `inbox-text.ts` stays, locales.

**Produces:**
```ts
export type RecurrenceWeeks = 1 | 2;
sessionsPer4Weeks(weeks: RecurrenceWeeks): number            // 1→4, 2→2
fourWeekTotalCents(unitCents: number, weeks: RecurrenceWeeks): number
recurrenceLabelKey(weeks: number): "recurrence.weekly" | "recurrence.biweekly"
type RecurrenceQuote = { weeks: RecurrenceWeeks; normalCents: number; recurrenceCents: number | null }
type RecurrenceRequest = { id; status; weeks; startDate; startTime; barberName; serviceName; recurrenceCents }          // customer view
type StaffRecurrenceRequest = { id; customerName; customerPhone; barberId; barberName; serviceName; weeks; startDate; startTime; normalCents; recurrenceCents }
getRecurrenceQuote(supabase, barberServiceId): Promise<RecurrenceQuote[]>
requestRecurrence(supabase, input: { barberServiceId; weeks; startDate; startTime }): Promise<void>
cancelMyRecurrenceRequest(supabase, id): Promise<void>
listMyRecurrenceRequests(supabase): Promise<RecurrenceRequest[]>
listRecurrenceRequests(supabase, shopId): Promise<StaffRecurrenceRequest[]>
decideRecurrenceRequest(supabase, id, accept: boolean): Promise<void>
listRecurrencePrices(supabase, shopId): Promise<{ serviceId: string; weeks: RecurrenceWeeks; priceCents: number }[]>
setRecurrencePrice(supabase, serviceId, weeks, priceCents: number | null): Promise<void>
createRecurrenceForCustomer(supabase, input: { customerId; barberServiceId; weeks; startDate; startTime }): Promise<void>   // staff-initiated
```
Also extends `inboxRoute` (Plan 2): `recurrence_requested` → `barber: "/my-profile/recurrence"`, `owner: "/monthly-customers"`; `recurrence_accepted|rejected` → `customer: "/me/recurrence"`.

- [ ] **Step 1: failing tests**

```ts
import { fourWeekTotalCents, recurrenceLabelKey, sessionsPer4Weeks } from "../../src/features/recurrence/pricing";

it("counts sessions in 4 weeks", () => { expect(sessionsPer4Weeks(1)).toBe(4); expect(sessionsPer4Weeks(2)).toBe(2); });
it("totals the owner's example: weekly 25 → 100", () => { expect(fourWeekTotalCents(2500, 1)).toBe(10000); expect(fourWeekTotalCents(2500, 2)).toBe(5000); });
it("labels", () => { expect(recurrenceLabelKey(1)).toBe("recurrence.weekly"); expect(recurrenceLabelKey(2)).toBe("recurrence.biweekly"); });
```
```ts
import { inboxRoute } from "../../src/features/notifications/inbox-route";
import { createRecurrenceForCustomer, decideRecurrenceRequest, getRecurrenceQuote, listRecurrenceRequests, requestRecurrence, setRecurrencePrice } from "../../src/features/recurrence/requests-api";

it("maps the quote", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ interval_weeks: 1, normal_cents: 3500, recurrence_cents: 2500 }, { interval_weeks: 2, normal_cents: 3500, recurrence_cents: null }], error: null });
  expect(await getRecurrenceQuote({ rpc } as never, "bs1")).toEqual([{ normalCents: 3500, recurrenceCents: 2500, weeks: 1 }, { normalCents: 3500, recurrenceCents: null, weeks: 2 }]);
  expect(rpc).toHaveBeenCalledWith("get_recurrence_quote", { target_barber_service_id: "bs1" });
});
it("sends the request", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });
  await requestRecurrence({ rpc } as never, { barberServiceId: "bs1", startDate: "2026-11-02", startTime: "10:00", weeks: 2 });
  expect(rpc).toHaveBeenCalledWith("request_recurrence", { target_barber_service_id: "bs1", target_interval_weeks: 2, target_start_date: "2026-11-02", target_start_time: "10:00" });
});
it("creates a series for a customer", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });
  await createRecurrenceForCustomer({ rpc } as never, { barberServiceId: "bs1", customerId: "c1", startDate: "2026-11-03", startTime: "11:00", weeks: 2 });
  expect(rpc).toHaveBeenCalledWith("create_recurrence_for_customer", { target_barber_service_id: "bs1", target_customer_id: "c1", target_interval_weeks: 2, target_start_date: "2026-11-03", target_start_time: "11:00" });
});

it("routes recurrence notifications", () => {
  expect(inboxRoute("recurrence_requested", "barber")).toBe("/my-profile/recurrence");
  expect(inboxRoute("recurrence_requested", "owner")).toBe("/monthly-customers");
  expect(inboxRoute("recurrence_accepted", "customer")).toBe("/me/recurrence");
});

it("decides and sets prices", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });
  await decideRecurrenceRequest({ rpc } as never, "r1", true);
  expect(rpc).toHaveBeenLastCalledWith("decide_recurrence_request", { accept: true, target_request_id: "r1" });
  await setRecurrencePrice({ rpc } as never, "s1", 1, null);
  expect(rpc).toHaveBeenLastCalledWith("set_recurrence_price", { target_interval_weeks: 1, target_price_cents: null, target_service_id: "s1" });
});
it("maps staff rows and trims seconds", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ id: "r1", customer_name: "Ana", customer_phone: "11912345678", barber_id: "b1", barber_name: "Bia", service_name: "Cut", interval_weeks: 1, local_start_date: "2026-11-02", local_start_time: "10:00:00", normal_cents: 3500, recurrence_cents: 2500 }], error: null });
  const [row] = await listRecurrenceRequests({ rpc } as never, "shop1");
  expect(row).toMatchObject({ customerName: "Ana", startTime: "10:00", weeks: 1, recurrenceCents: 2500 });
});
```
- [ ] **Step 2:** `npx jest tests/unit/recurrence-pricing.test.ts tests/unit/recurrence-requests-api.test.ts` → FAIL.
- [ ] **Step 3: implement**

```ts
// pricing.ts
export type RecurrenceWeeks = 1 | 2;

export const sessionsPer4Weeks = (weeks: RecurrenceWeeks) => 4 / weeks;
export const fourWeekTotalCents = (unitCents: number, weeks: RecurrenceWeeks) => unitCents * sessionsPer4Weeks(weeks);
export const recurrenceLabelKey = (weeks: number) => (weeks === 1 ? "recurrence.weekly" : "recurrence.biweekly");
```
```ts
// requests-api.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";
import type { RecurrenceWeeks } from "./pricing";

type Client = Pick<SupabaseClient, "rpc">;
type Row = Record<string, unknown>;

async function call(supabase: Client, name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toDomainError(error);

  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}
const time = (value: unknown) => String(value).slice(0, 5);

export type RecurrenceQuote = { weeks: RecurrenceWeeks; normalCents: number; recurrenceCents: number | null };
export type RecurrenceRequest = { id: string; status: "pending" | "accepted" | "rejected" | "cancelled"; weeks: RecurrenceWeeks; startDate: string; startTime: string; barberName: string; serviceName: string; recurrenceCents: number | null };
export type StaffRecurrenceRequest = { id: string; customerName: string; customerPhone: string | null; barberId: string; barberName: string; serviceName: string; weeks: RecurrenceWeeks; startDate: string; startTime: string; normalCents: number; recurrenceCents: number | null };

export async function getRecurrenceQuote(supabase: Client, barberServiceId: string): Promise<RecurrenceQuote[]> {
  const rows = await call(supabase, "get_recurrence_quote", { target_barber_service_id: barberServiceId });

  return rows.map((r) => ({ normalCents: Number(r.normal_cents), recurrenceCents: r.recurrence_cents === null ? null : Number(r.recurrence_cents), weeks: Number(r.interval_weeks) as RecurrenceWeeks }));
}

export async function requestRecurrence(supabase: Client, input: { barberServiceId: string; weeks: RecurrenceWeeks; startDate: string; startTime: string }) {
  await call(supabase, "request_recurrence", { target_barber_service_id: input.barberServiceId, target_interval_weeks: input.weeks, target_start_date: input.startDate, target_start_time: input.startTime });
}

export async function cancelMyRecurrenceRequest(supabase: Client, id: string) {
  await call(supabase, "cancel_my_recurrence_request", { target_request_id: id });
}

export async function listMyRecurrenceRequests(supabase: Client): Promise<RecurrenceRequest[]> {
  const rows = await call(supabase, "list_my_recurrence_requests");

  return rows.map((r) => ({ barberName: String(r.barber_name), id: String(r.id), recurrenceCents: r.recurrence_cents === null ? null : Number(r.recurrence_cents), serviceName: String(r.service_name), startDate: String(r.local_start_date), startTime: time(r.local_start_time), status: r.status as RecurrenceRequest["status"], weeks: Number(r.interval_weeks) as RecurrenceWeeks }));
}

export async function listRecurrenceRequests(supabase: Client, shopId: string): Promise<StaffRecurrenceRequest[]> {
  const rows = await call(supabase, "list_recurrence_requests", { target_shop_id: shopId });

  return rows.map((r) => ({ barberId: String(r.barber_id), barberName: String(r.barber_name), customerName: String(r.customer_name), customerPhone: (r.customer_phone as string | null) ?? null, id: String(r.id), normalCents: Number(r.normal_cents), recurrenceCents: r.recurrence_cents === null ? null : Number(r.recurrence_cents), serviceName: String(r.service_name), startDate: String(r.local_start_date), startTime: time(r.local_start_time), weeks: Number(r.interval_weeks) as RecurrenceWeeks }));
}

export async function createRecurrenceForCustomer(supabase: Client, input: { barberServiceId: string; customerId: string; startDate: string; startTime: string; weeks: RecurrenceWeeks }) {
  await call(supabase, "create_recurrence_for_customer", { target_barber_service_id: input.barberServiceId, target_customer_id: input.customerId, target_interval_weeks: input.weeks, target_start_date: input.startDate, target_start_time: input.startTime });
}

export async function decideRecurrenceRequest(supabase: Client, id: string, accept: boolean) {
  await call(supabase, "decide_recurrence_request", { accept, target_request_id: id });
}

export async function listRecurrencePrices(supabase: Client, shopId: string) {
  const rows = await call(supabase, "list_recurrence_prices", { target_shop_id: shopId });

  return rows.map((r) => ({ priceCents: Number(r.price_cents), serviceId: String(r.service_id), weeks: Number(r.interval_weeks) as RecurrenceWeeks }));
}

export async function setRecurrencePrice(supabase: Client, serviceId: string, weeks: RecurrenceWeeks, priceCents: number | null) {
  await call(supabase, "set_recurrence_price", { target_interval_weeks: weeks, target_price_cents: priceCents, target_service_id: serviceId });
}
```
- [ ] **Step 3b: inbox routes.** Replace the body of `src/features/notifications/inbox-route.ts` (Plan 2) with the recurrence-aware version and extend `InboxKind` with the 3 recurrence kinds:

```ts
import type { InboxKind } from "./inbox-api";

type Role = "barber" | "customer" | "owner";

const AGENDA: Record<Role, string> = { barber: "/my-agenda", customer: "/appointments", owner: "/agenda" };
const REQUESTS: Record<Role, string> = { barber: "/my-profile/recurrence", customer: "/me/recurrence", owner: "/monthly-customers" };

export function inboxRoute(kind: InboxKind, role: Role) {
  return kind.startsWith("recurrence_") ? REQUESTS[role] : AGENDA[role];
}
```
- [ ] **Step 4:** run → PASS. Add `P0031`/`P0032` mapping in `domain-errors.ts` + messages in `src/i18n/errors.ts` (look at how `RECURRENCE_INVALID` is wired, copy). Extend `InboxKind` in `inbox-api.ts` with the 3 recurrence kinds; `notifications.*` i18n for them (pt: "Novo pedido de recorrência" / `{{customerName}} · {{serviceName}} · {{label}}`; "Recorrência aceita" / "Recorrência recusada" / `{{serviceName}} · {{label}}`; en/es equivalents). The `label` param is `t(recurrenceLabelKey(params.interval_weeks))` — extend `InboxItem.params` with optional `intervalWeeks` in `listNotifications`.
- [ ] **Step 5:** typecheck/lint; commit `feat: recurrence request client api`.

---

### Task 3: Locale strings for recurrence

**Files:** `src/i18n/locales/{en,es,pt}.ts`

- [ ] Add `recurrence` block (pt shown; en/es translate): `weekly: "Semanal"`, `biweekly: "Quinzenal (a cada 2 semanas)"`, `title: "Recorrência"`, `request: "Pedir recorrência"`, `chooseBarber: "Escolha o barbeiro"`, `chooseService: "Escolha o serviço"`, `chooseFrequency: "Frequência"`, `chooseFirst: "Primeiro horário"`, `perSession: "{{price}} por sessão"`, `normalPrice: "Preço normal {{price}}"`, `fourWeeks: "{{count}} sessões em 4 semanas = {{total}}"`, `send: "Enviar pedido"`, `sent: "Pedido enviado. Você será avisado quando for respondido."`, `sendError: "Não foi possível enviar o pedido."`, `status: { pending: "Aguardando resposta", accepted: "Aceito", rejected: "Recusado", cancelled: "Cancelado" }`, `cancelRequest: "Cancelar pedido"`, `empty: "Você ainda não tem pedidos de recorrência."`, `contactToEnd: "Para encerrar uma recorrência ativa, fale com a barbearia."`, plus owner/barber side: `requestsTab: "Pedidos"`, `activeTab: "Ativos"`, `pricesTab: "Preços"`, `accept: "Aceitar"`, `reject: "Recusar"`, `noRequests: "Nenhum pedido pendente."`, `priceLabel: "Preço {{frequency}} (R$)"`, `priceHint: "Deixe vazio para usar o preço normal."`, `priceSaved: "Preço salvo."`, `decideError: "Não foi possível responder ao pedido."`.
- [ ] `npm run typecheck` (en is the type source; es/pt must have every key); commit `feat(i18n): recurrence strings`.

---

### Task 4: Owner recurring screen (Pedidos / Ativos / Preços)

**Files:** Modify `app/(owner)/monthly-customers.tsx` (rewrite), `tests/e2e/owner-recurring.web.spec.ts`, `tests/e2e/recurrence.web.spec.ts` (inspect which assertions rely on the create form and replace them)

**Consumes:** Task 2 API, existing `listMonthlyCustomers` (series), `setRecurrenceSeriesActive`, `cancelRecurrenceOccurrence`, `endRecurrenceSeries`, `listOwnerServices`, `useOwnerShopId`, `parseReaisToCents`, `centsToReaisInput`, `formatPriceBRL`, `fourWeekTotalCents`, `SearchInput`, `DateInput`.

- [ ] **Step 1 (e2e first):** replace the create-form tests with: (a) three tab buttons `recurring-tab-requests|active|prices`; (b) Requests tab lists a mocked pending request (`list_recurrence_requests`) with customer, barber, service, frequency label, start date (masked display), the special price and "4 sessions = R$ 100,00"; clicking `request-accept-<id>` posts `decide_recurrence_request` `{ accept: true }`, `request-reject-<id>` posts `{ accept: false }`; (c) Prices tab: each service shows normal price + two inputs; typing `25,00` in `price-<serviceId>-1` and clicking `price-save-<serviceId>` posts `set_recurrence_price` `{ target_price_cents: 2500, target_interval_weeks: 1 }`; clearing sends `null`; (d) Active tab keeps the old series cards (edit button removed) with frequency label from `recurrenceLabelKey` and the series actions (deactivate / cancel occurrence / end) unchanged. Run → FAIL.
- [ ] **Step 2:** rewrite the screen: keep `ScreenHeader`, conflicts link, query setup. Remove: creation form, `editRecurrenceSeries` usage, search/customer/service radio selection, interval/time/price inputs. Local state `tab: "requests" | "active" | "prices"` rendered as three `Button size="sm"` (variant `dark`/`outline`). Requests: `useQuery(["owner-recurrence-requests", shopId], listRecurrenceRequests)`; each `Card` shows `customerName`, `serviceName · barberName`, `t(recurrenceLabelKey(weeks))`, `formatDateNumeric(startDate)` + `startTime`, price line (`perSession` + `fourWeeks` when `recurrenceCents !== null`, else `normalPrice`), and two buttons (`Accept` primary, `Reject` `variant="danger"`) calling `decideRecurrenceRequest`; on success invalidate `["owner-recurrence-requests"]`, `["owner-recurring"]`, `["owner-agenda"]`. Prices: query `listRecurrencePrices` + services (`listOwnerServices`, active only); per service row state `drafts[serviceId][weeks]` string initialised from the price list via `centsToReaisInput`; one Save button per service sends both weeks (`parseReaisToCents`; empty ⇒ `null`; invalid ⇒ inline error `owner.services.priceLabel`-style message, reuse `owner.recurring.validation`), then toast `recurrence.priceSaved`; show under each input `fourWeeks` preview via `fourWeekTotalCents(cents, weeks)` when valid. Active: an "Adicionar manualmente" button (`recurring-manual`, label `recurrence.addManual` "Adicionar manualmente"/"Add manually"/"Agregar manualmente") that toggles `<ManualRecurrenceForm />` (below) above the existing series list; the existing series list (change `everyWeeks` text to `t(recurrenceLabelKey(item.intervalWeeks))`; date via `formatDateNumeric`); keep the occurrence-date `DateInput` (Plan 1). Use `useBack("/manage")`.
- [ ] **Step 3:** typecheck/lint/jest/e2e; screenshots (375px) of the three tabs; commit `feat: owner recurrence requests, prices and active series`.

---

### Task 4b: Manual (staff-created) recurrence form

For customers without an account (they cannot send a request). Shared by the owner (Active tab) and the barber (Task 6 screen).

**Files:** Create `src/features/recurrence/ManualRecurrenceForm.tsx`; Test: e2e in Tasks 4 and 6.

**Interfaces — Produces:** `<ManualRecurrenceForm customers={{ id: string; name: string }[]} services={{ barberServiceId: string; label: string }[]} onSearch?={(term: string) => void} onCreated={() => void} />` — owns its state: customer search (`SearchInput`, filters `customers` locally and calls `onSearch` for the barber's server-side search) → `RadioBlock` of customers; `RadioBlock` of services; frequency `RadioBlock` (weekly / biweekly via `recurrenceLabelKey`); `DateInput` start date (default today); `TimeInput` start time (default `09:00`); preview of the price using `getRecurrenceQuote(supabase, barberServiceId)` (`perSession` + `fourWeeks`, or `normalPrice`); submit `testID="manual-recurrence-save"` → `createRecurrenceForCustomer`, then `ensure` nothing else (the RPC already materialises), invalidate `["owner-recurring"]`, `["barber-agenda"]`, call `onCreated`. Disabled until customer, service, a valid ISO date and `HH:MM` time are set. Errors via `errorMessage(error, t, t("recurrence.sendError"))` (`SLOT_UNAVAILABLE` maps to the existing unavailable-slot text).

- [ ] **Step 1 (e2e first, in the owner spec of Task 4):** click `recurring-manual`, pick a customer (`recurrence-customer-<id>`), a service, frequency, type date/time (masked), expect the preview text, click `manual-recurrence-save` → asserts `POST /rpc/create_recurrence_for_customer` body, the form closes and the series list refetches.
- [ ] **Step 2:** implement the component with the composition above (all building blocks exist: `RadioBlock`, `Input`-based inputs, `Button`).
- [ ] **Step 3:** typecheck/lint; commit `feat: manual recurrence form for staff`.

---

### Task 5: Customer request screen

**Files:** Create `app/(customer)/me/recurrence.tsx`; Modify `app/(customer)/_layout.tsx` (`<Stack.Screen name="me/recurrence" />`), `app/(customer)/(tabs)/profile.tsx` (menu item "Recorrência", icon `Repeat`), `tests/e2e/recurrence.web.spec.ts`

**Consumes:** `listPublicBarbers` (Plan 3 avatars), `useBarberServices(barberId)`, `getRecurrenceQuote`, `requestRecurrence`, `listMyRecurrenceRequests`, `cancelMyRecurrenceRequest`, `getAvailableSlotsQueryOptions` (`src/features/availability/query`), `MonthCalendar`, `TimeSlotPicker`, `RadioBlock`, `BarberCard`, `ServiceCard`, `useShopInfo`/shop id (`useQuery listPublicShops` first shop, as `book/index.tsx`).

- [ ] **Step 1 (e2e first):** from the profile hub open "Recurrence" → sees empty text; start request: pick barber (`barber-card-<id>`), service (`service-card-<id>`), see two frequency radios each with the quote text ("R$ 25,00 per session · R$ 100,00 for 4 weeks · normal R$ 35,00"); pick Weekly; pick a date in `MonthCalendar` and a time slot (mock `get_available_slots`); click `recurrence-send` → asserts `POST /rpc/request_recurrence` body `{ target_barber_service_id, target_interval_weeks: 1, target_start_date: <date>, target_start_time: "09:00" }`; list shows the new request with status "Awaiting reply" and a cancel button posting `cancel_my_recurrence_request`. → FAIL.
- [ ] **Step 2:** implement as a single scroll screen with a local `step` state (`"list" | "barber" | "service" | "frequency" | "when"`), reusing the booking components so nothing new is styled: list step shows requests (`listMyRecurrenceRequests`, query key `["my-recurrence-requests"]`) + `Button recurrence.request` + the `contactToEnd` note; barber step = `BarberCard` list; service step = `ServiceCard` list; frequency step = `RadioBlock` with items built from `getRecurrenceQuote` (`label`: `${t(recurrenceLabelKey(q.weeks))} — ${recurrenceCents ? t("recurrence.perSession", …) + " · " + t("recurrence.fourWeeks", { count: sessionsPer4Weeks(q.weeks), total: formatPriceBRL(fourWeekTotalCents(q.recurrenceCents, q.weeks)) }) : t("recurrence.normalPrice", …)}`); when step = `MonthCalendar` (`today` from `formatInstantInShopTime(useNow())`) + `TimeSlotPicker` fed by `useQuery(getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }))` exactly as `book/time.tsx` (Plan 3) does; `Send` button calls `requestRecurrence` with `startsAt`'s `localDate/localTime`, then invalidates `["my-recurrence-requests"]`, shows `recurrence.sent`, returns to `list`. Back button: `step === "list" ? useBack("/profile") : previous step` (local stack array).
- [ ] **Step 3:** profile menu item (`profile.menu.recurrence`: "Recurrence"/"Recorrência"/"Recurrencia") → `/me/recurrence`; register the route in the customer `Stack`.
- [ ] **Step 4:** typecheck/lint/jest/e2e; screenshots; commit `feat: customer recurrence request flow`.

---

### Task 6: Barber requests screen

**Files:** Create `app/(barber)/my-profile/recurrence.tsx`; Modify `app/(barber)/my-profile/index.tsx` (menu item after "Disponibilidade"), `tests/e2e/barber-recurrence.web.spec.ts`

- [ ] **Step 1 (e2e first):** barber profile → "Recurrence requests" → mocked `list_recurrence_requests` row → Accept posts `decide_recurrence_request {accept:true}`; Reject `{accept:false}`; WhatsApp contact link (`whatsappUrl(customerPhone)`) present. → FAIL.
- [ ] **Step 2:** screen = the Requests tab card from Task 4 extracted as `src/features/recurrence/RequestCard.tsx` (props `{ request: StaffRecurrenceRequest; busy: boolean; onDecide: (accept: boolean) => void }`) and reused by both owner and barber screens (move code out of Task 4's screen; adjust that task if executing out of order). Shop id for barbers: `getMyBarberProfile(supabase).shopId` (query key `["my-barber-profile", userId]`). Invalidate `["barber-recurrence-requests"]` and `["barber-agenda"]` after deciding.
- [ ] **Step 2b:** below the requests, a `recurring-manual` button toggling `<ManualRecurrenceForm />` with `customers` from `searchMyCustomers(supabase, term)` (`src/features/appointments/barber-booking.ts`, same call the agenda booking sheet uses; `onSearch` updates the term) and `services` from `listMyBarberServices(supabase)` filtered to `active` (`label: serviceName`). Add an e2e case for it (`create_recurrence_for_customer` called).
- [ ] **Step 3:** menu item label `barber.hub.menu.recurrence` ("Pedidos de recorrência"); typecheck/lint/e2e; commit `feat: barber recurrence requests`.

---

## Part B — Schedule and shop improvements (client-side, existing APIs)

Improvements delivered (all asked as "ofertar melhorias"; each is independent — drop any line the user declines at review):
1. Shop hours: **"Copiar para todos os dias"** per day (copies start/end/breaks to every other open day) and **"Aplicar a seg–sex"**.
2. Shop hours: masked time fields (Plan 1) and inline validation message under the day card on blur (uses `draftToPeriods` result).
3. Shop: **"Dias fechados"** card — close the whole shop on a date (feriado): creates an all-day `block` override for every active barber; list of upcoming closures with "Reabrir".
4. Schedule (per barber): **"Copiar horário da barbearia"** button that creates the barber's weekly periods from the shop hours (only when the barber has none), and a read-only **lunch break** line from Plan 4.
5. Schedule: weekly summary table of the selected barber (reuses the markup of the barber Availability screen) above the add-period form.

### Task 7: Pure helpers

**Files:** Create `src/features/shops/day-tools.ts`; Test `tests/unit/day-tools.test.ts`

**Produces:** `copyDayToOthers(days: Record<number, DayDraft>, fromWeekday: number, targets: number[]): Record<number, DayDraft>` (targets get `{...days[from]}` with deep-copied `breaks`, `enabled: true`); `closedDates(overrides: { barberId: string; localDate: string; kind: string; startTime: string | null }[], activeBarberIds: string[], today: string): string[]` (dates ≥ today where every active barber has an all-day `block`; sorted ascending).

- [ ] **Step 1: failing tests**

```ts
import { closedDates, copyDayToOthers } from "../../src/features/shops/day-tools";

const day = { breaks: [{ end: "13:00", start: "12:00" }], enabled: true, end: "18:00", start: "09:00" };

it("copies a day to the other weekdays without sharing break arrays", () => {
  const out = copyDayToOthers({ 1: day, 2: { breaks: [], enabled: false, end: "17:00", start: "10:00" } }, 1, [2]);
  expect(out[2]).toEqual(day);
  expect(out[2].breaks).not.toBe(day.breaks);
  expect(out[1]).toBe(day);
});

it("a date is closed when every active barber has an all-day block", () => {
  const o = (barberId: string, localDate: string, startTime: string | null = null, kind = "block") => ({ barberId, kind, localDate, startTime });
  expect(closedDates([o("a", "2026-12-25"), o("b", "2026-12-25"), o("a", "2026-12-26"), o("b", "2026-12-24"), o("a", "2026-12-24", "10:00")], ["a", "b"], "2026-12-01")).toEqual(["2026-12-25"]);
  expect(closedDates([o("a", "2026-11-01"), o("b", "2026-11-01")], ["a", "b"], "2026-12-01")).toEqual([]);
});
```
- [ ] **Step 2:** FAIL → **Step 3:** implement

```ts
import type { DayDraft } from "./hours";

export function copyDayToOthers(days: Record<number, DayDraft>, fromWeekday: number, targets: number[]) {
  const source = days[fromWeekday];
  const next = { ...days };

  for (const weekday of targets) {
    if (weekday !== fromWeekday) next[weekday] = { ...source, breaks: source.breaks.map((pause) => ({ ...pause })), enabled: true };
  }

  return next;
}

type Override = { barberId: string; kind: string; localDate: string; startTime: string | null };

export function closedDates(overrides: Override[], activeBarberIds: string[], today: string) {
  if (activeBarberIds.length === 0) return [];
  const byDate = new Map<string, Set<string>>();

  for (const o of overrides) {
    if (o.kind !== "block" || o.startTime !== null || o.localDate < today) continue;
    byDate.set(o.localDate, (byDate.get(o.localDate) ?? new Set()).add(o.barberId));
  }

  return [...byDate].filter(([, ids]) => activeBarberIds.every((id) => ids.has(id))).map(([date]) => date).sort();
}
```
- [ ] **Step 4:** PASS; commit `feat: shop day tools`.

### Task 8: Shop screen

**Files:** Modify `app/(owner)/shop.tsx`, `tests/e2e/owner-shop.web.spec.ts`; locales (`owner.shop.copyToAll`, `copyToWeekdays`, `closedTitle`, `closedAdd`, `closedNone`, `reopen`, `closedAdded`, `closedError`: "Copiar para todos os dias", "Copiar para seg–sex", "Dias fechados", "Fechar barbearia nesta data", "Nenhuma data fechada.", "Reabrir", "Barbearia fechada nesta data.", "Não foi possível alterar a data.")

- [ ] **Step 1 (e2e first):** on an open day click `shop-copy-all-1` → every other day shows the same start/end (assert `shop-start-3` value); `shop-copy-weekdays-1` affects only weekdays 2–5 (Mon is 1); add a closed date with `DateInput` testID `shop-closed-date` + `shop-closed-add` → asserts one `POST schedule_overrides` per active barber with `kind: "block"` and null times; closed list shows the date; `shop-reopen-<date>` deletes those overrides. → FAIL.
- [ ] **Step 2:** per-day card: two `size="sm"` outline buttons under the breaks (`copyDayToOthers(days, weekday, WEEKDAYS)` / `[2,3,4,5]`, via `setDays`). Closed-dates card at the end: queries `listOwnerBarbers` + `listOwnerScheduleOverrides(supabase, shopId)` (`["owner-schedule", shopId]` key, shared with the schedule screen), `closedDates(...)`; add = `Promise.all(activeBarbers.map(b => createScheduleOverride(supabase, { barberId: b.id, endTime: null, kind: "block", localDate, shopId, startTime: null })))`, reopen = delete every matching override id. Need `useOwnerShopId` (the screen currently reads the first public shop; use `useOwnerShopId` for the new card only). Disable the add button unless `localDate` is a valid ISO date ≥ today.
- [ ] **Step 3:** typecheck/lint/jest/e2e; screenshot; commit `feat: shop hours copy tools and closed dates`.

### Task 9: Schedule screen

**Files:** Modify `app/(owner)/schedule.tsx`, `tests/e2e/schedule.spec.ts` / owner schedule spec (`rg -l "owner/schedule|/schedule" tests/e2e`)

- [ ] **Step 0:** read-only lunch line under the selected barber's summary: query `listShopLunchBreaks(supabase, shopId)` (Plan 4; key `["owner-lunch", shopId]`), show `barber.availability.lunchTitle`: `HH:MM–HH:MM` (or hide when none). The owner cannot edit it (barber-owned).
- [ ] **Step 1 (e2e first):** with a barber that has no periods and mocked `list_shop_hours`: `schedule-copy-shop-hours` appears, click → one `POST working_periods` per shop period for the selected barber; with existing periods the button is hidden. Weekly summary shows each weekday row (`schedule-summary-<n>`). → FAIL.
- [ ] **Step 2:** summary: render the 7 rows like the barber Availability screen (`day.length === 0 ? t("barber.availability.closed") : periods…`); copy button: `listShopHours(supabase, shopId)` (from `src/features/shops/api`) → `createWorkingPeriod(supabase, parseWorkingPeriodInput({ barberId, shopId, weekday, startTime, endTime }))` sequentially (overlap constraint is DB-side); invalidate `["owner-schedule"]`. Masked `TimeInput`/`DateInput` already applied by Plan 1.
- [ ] **Step 3:** typecheck/lint/jest/e2e; commit `feat: schedule summary and copy shop hours`.

---

## Part C — Owner profile

### Task 10: Staff profile RPC

**Files:** Create `supabase/migrations/0051_staff_profile.sql`; Test `supabase/tests/014_staff_profile.sql`; Modify `src/features/account/api.ts`; Test `tests/unit/staff-profile.test.ts`

**Produces:** `public.update_my_staff_profile(p_full_name text, p_nickname text default null) returns void` (updates `profiles` only; `PROFILE_INVALID` `P0017` on blank name or nickname > 30); `updateMyStaffProfile(supabase, { fullName, nickname })`.

- [ ] **Step 1 (pgTAP first):** owner calls it → `profiles.full_name`/`nickname` updated; blank name → `P0017`; anon → exception. FAIL.
- [ ] **Step 2:** migration:

```sql
create function public.update_my_staff_profile(p_full_name text, p_nickname text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  if btrim(coalesce(p_full_name, '')) = '' or char_length(btrim(coalesce(p_nickname, ''))) > 30 then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;
  update public.profiles set full_name = btrim(p_full_name), nickname = nullif(btrim(p_nickname), ''), updated_at = clock_timestamp()
  where user_id = auth.uid();
end;
$$;
revoke all on function public.update_my_staff_profile(text, text) from public, anon;
grant execute on function public.update_my_staff_profile(text, text) to authenticated;
```
- [ ] **Step 3:** unit test + client fn in `account/api.ts` (copy `callRpc` usage of `updateMyProfile`):

```ts
export async function updateMyStaffProfile(supabase: RpcClient, input: { fullName: string; nickname: string | null }) {
  await callRpc(supabase, "update_my_staff_profile", { p_full_name: input.fullName, p_nickname: input.nickname?.trim() || null });
}
```
Test: `rpc` called with `("update_my_staff_profile", { p_full_name: "Ana", p_nickname: null })` — adjust to `callRpc`'s real signature (read lines 1-28 of `account/api.ts`).
- [ ] **Step 4:** PASS; commit `feat: staff profile update`.

### Task 11: Owner profile hub and screens

**Files:** Modify `app/(owner)/settings.tsx` (hub), `app/(owner)/_layout.tsx` (hidden screens `owner-profile`, highlight `settings`), locales; Create `app/(owner)/owner-profile/_layout.tsx` (`Stack`, like `app/(barber)/clients/_layout.tsx`), `account.tsx`, `security.tsx`, `security/password.tsx`, `privacy.tsx`, `about.tsx`, `settings.tsx`; Test `tests/e2e/owner-profile.web.spec.ts`

URL note: folder is `owner-profile` (not `my-profile`/`profile`) because the barber and customer groups already own `/my-profile/*` and `/profile`.

- [ ] **Step 1 (e2e first):** hub shows avatar, name, e-mail, role "Owner", menu: Meus dados, Segurança, "Atender como barbeiro" switch row, Privacidade, Configurações, Sobre, Sair. Meus dados: edit name and nickname, press `owner-save` at the **end of the page** → asserts `POST /rpc/update_my_staff_profile`; change-photo and change-e-mail controls present (same test ids as barber account: `account-avatar`, `account-change-email`). "Atender como barbeiro": toggle on with no linked row → asserts `POST /barbers` with `{ name, shop_id, user_id: <owner uid> }`; toggle off → `PATCH /barbers` `active: false`; when on, a link `owner-profile-my-barber` opens `/barber-profile?id=<id>`. → FAIL.
- [ ] **Step 2: account.tsx** = copy of `app/(barber)/my-profile/account.tsx` with: remove bio and `getMyBarberProfile`; fields `fullName` (`Input`) and `nickname` (`Input`, 30 chars) prefilled from `useMyProfile()`; save mutation `updateMyStaffProfile` then invalidate `["my-profile"]`; photo mutation = the customer's (`uploadMyAvatar` only, no `updateMyBarberProfile`); e-mail change block unchanged; **Save button last** (`testID="owner-save"`, label `common.saveProfile` "Salvar perfil"/"Save profile"/"Guardar perfil" — add key; Plan 4 reuses `barber.profile.save`, keep both). Use `useFieldChain(2)` and `useBack("/settings")`.
- [ ] **Step 3: re-exports** (like `(barber)/my-profile/about.tsx`): `about.tsx`, `security.tsx`, `security/password.tsx`, `settings.tsx` → `export { default } from "../../(customer)/me/<same>"` (path depth +1 for `security/password`). These screens call `useBack()` and push to `/me/...` routes: read each (`rg "router.push\(\"/me" app/(customer)/me`) — `me/settings.tsx` pushes `/me/language` (customer-group URL, unreachable for owners) ⇒ for owners write `settings.tsx` as a thin copy that pushes `/language` (the existing owner language screen) and keeps the export-data button; `me/security.tsx` pushes `/me/security/password` ⇒ same: thin copy pushing `/owner-profile/security/password`. Fallback for `useBack` stays the shared default `/profile` only for cold starts; pass explicit fallbacks in the copies (`/settings`).
- [ ] **Step 4: privacy.tsx** = copy of barber privacy: note explaining that the shop owner account cannot be deleted from the app (`owner.privacyNote`: "A conta do dono da barbearia não pode ser excluída pelo app. Fale com o suporte."/en/es) + terms button to `/legal`. Verify `deleteMyAccount` is not offered.
- [ ] **Step 5: hub** (`settings.tsx`): Avatar `onPress` → `/owner-profile/account` with `uri={profile.data?.avatarUrl}` (use `useMyProfile`), `name={profile.data?.nickname || profile?.fullName}`; `MenuBlock` 1: Meus dados (`User`), Segurança (`ShieldCheck`); `MenuBlock` 2: row "Atender como barbeiro" implemented as a `Switch` row (not a MenuBlock item — copy the `Switch` styling from `shop.tsx` day rows) bound to `useOwnerAsBarber()`; when on, a `MenuBlock` item "Meus serviços e horários" → `/barber-profile?id=<id>` (Plan 5 screen; the owner configures own services/compensation there and own hours via Manage › Horários); `MenuBlock` 3: Privacidade (`Lock`), Configurações (`Settings`), Sobre (`Info`); sign-out button unchanged; the old `language` item moves under Configurações (keep `/language` route). `_layout.tsx`: add `"owner-profile"` to `ACCOUNT_SCREENS`.
- [ ] **Step 6: hook** `src/features/barbers/owner/use-owner-as-barber.ts`:

```ts
export function useOwnerAsBarber() {
  const { profile, supabase } = useSupabaseSession();
  const queryClient = useQueryClient();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const barbers = useQuery({ enabled: shopId !== null, queryFn: () => listOwnerBarbers(supabase, shopId ?? ""), queryKey: ["owner-barbers-list", shopId] });
  const mine = barbers.data?.find((barber) => barber.userId === profile?.userId) ?? null;
  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (mine) return setBarberActive(supabase, mine.id, on);
      if (!on) return null;

      return createBarber(supabase, { name: profile?.nickname || profile?.fullName || "Owner", shopId: shopId ?? "", userId: profile?.userId });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-barbers"] }),
  });

  return { active: Boolean(mine?.active), barberId: mine?.id ?? null, isLoading: barbers.isLoading, toggle };
}
```
Check `BarberInput`/`parseBarberInput` accepts `userId` (it does: `createBarber` forwards `parsed.userId`) and that RLS lets the owner insert a barber row linked to their own user (the `invite-barber` edge function links users with the service role; a direct insert with `user_id` = owner may violate a policy/trigger — **verify with a quick pgTAP/psql insert as the owner**; if it fails, add `public.link_owner_as_barber()` SECURITY DEFINER to the migration of Task 10 that inserts/reactivates the owner's barber row, and call it from the hook instead). The owner's profile role stays `owner`; the barber-only RPCs (`list_my_barber_*`) keep working because they key off `barbers.user_id = auth.uid()`, but the app UI never routes the owner to the barber group.
- [ ] **Step 7:** typecheck/lint/jest/e2e; screenshots at 375px of the hub and each sub-screen; commit `feat: owner profile hub`.

---

### Task 12: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest && npm run test:db`; full web e2e for recurrence, owner-*, barber-*, profile; `/code-review`; push `feat-recurrence-requests`; PR via `gh api` REST listing the two migrations (`0050`, `0051`), the 14-vs-15-day decision, and the owner-as-barber verification result.
