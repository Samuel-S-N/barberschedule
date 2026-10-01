# Barber Booking From the Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A barber books appointments from their own agenda (day → free slot → name-only-required form → confirm), for customers who have an account, will have one later (same verified email), or are name-only.

**Architecture:** Three small migrations add a `'barber'` booking source, barber-scoped customer RPCs, and an email *claim* in `ensure_my_customer`. The front adds a pure day-timeline builder, a typed API module and a `Modal` booking sheet wired into `my-agenda.tsx`.

**Tech Stack:** Supabase/Postgres (plpgsql, pgTAP), Expo Router + React Native Web, NativeWind, TanStack Query, i18next (en/es/pt), Jest + Testing Library, Playwright (REST mocked).

**Spec:** `docs/superpowers/specs/2026-10-01-barber-booking-design.md`

## Global Constraints

- Work in worktree `/home/samuel/projects/barberschedule/.claude/worktrees/barber-booking` (branch `feat-barber-booking`); run everything from there. Stage only your own files.
- Local Supabase only (already running in Docker). Never touch the hosted project.
- Migrations are numbered after `0030_shop_info.sql`: this plan adds `0031`, `0032`, `0033`. pgTAP files continue after `016_shop_info.sql`: add `017`, `018`, `019`.
- New error codes: `P0024` = `CUSTOMER_NAME_REQUIRED`, `P0025` = `CUSTOMER_EMAIL_INVALID` (`P0017` is already `PROFILE_INVALID`).
- Only `name` is required; email and phone are optional. Email is unique per shop (`lower(email)`).
- Claim by email only when `auth.users.email_confirmed_at is not null`.
- Every user string lives in `en`, `es` and `pt` (`tests/unit/locale-parity.test.ts` enforces equal keys and placeholders).
- Use `rtk` before shell commands whose output is read raw. TDD: failing test first, always.
- UI work is verified in a real browser (screenshots + computed CSS); `className` only on plain RN elements.
- Prefix for `npx` commands: `node_modules` is symlinked from the main checkout in Task 1.

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0031_barber_booking_schema.sql` | `'barber'` source, `customers.created_by_barber_id`, relaxed contact check, unique email, `book_appointment_internal` barber rule |
| `supabase/migrations/0032_barber_customer_rpcs.sql` | `barber_find_or_create_customer`, `barber_search_customers` |
| `supabase/migrations/0033_claim_customer_on_signup.sql` | `ensure_my_customer` claims an unlinked same-email customer |
| `supabase/tests/017_barber_booking.sql`, `018_barber_customer_rpcs.sql`, `019_claim_customer_on_signup.sql` | pgTAP |
| `src/lib/errors/domain-errors.ts` | two new codes |
| `src/features/appointments/types.ts` | `AppointmentSource` + `'barber'` |
| `src/features/appointments/barber-booking.ts` | validation, phone normalisation, RPC wrappers |
| `src/features/appointments/day-slots.ts` | pure timeline builder |
| `src/components/domain/BarberBookingSheet.tsx` | the booking `Modal` |
| `app/(barber)/my-agenda.tsx` | timeline + sheet wiring |
| `src/i18n/locales/{en,es,pt}.ts` | strings and error messages |
| `supabase/seed.sql` | test barber `barber@teste.com` |
| `tests/unit/*`, `tests/integration/barber-booking.test.ts`, `tests/e2e/barber-booking.web.spec.ts` | Jest / Playwright |

---

### Task 1: Schema, `'barber'` source and booking rule

**Files:**
- Create: `supabase/migrations/0031_barber_booking_schema.sql`
- Create: `supabase/tests/017_barber_booking.sql`

**Interfaces:**
- Produces: `appointment_source` value `'barber'`; column `customers.created_by_barber_id uuid`; `book_appointment(barber_service_id, customer_id, starts_at, 'barber', notes)` callable by the owning barber only, exempt from the one-booking-per-day limit.

- [ ] **Step 0: Link dependencies into the worktree**

```bash
cd /home/samuel/projects/barberschedule/.claude/worktrees/barber-booking && ln -s /home/samuel/projects/barberschedule/node_modules node_modules && rtk git status --short | head
```
Expected: no `node_modules` noise (it is git-ignored).

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/017_barber_booking.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't17-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't17-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't17-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't17-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('a1000000-0000-0000-0000-000000000001', 'T17 Shop', 'a0000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Barber A'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'T17 Customer', 't17-customer@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'T17 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'a1000000-0000-0000-0000-000000000001', b, weekday, '00:00', '23:59'
from generate_series(1, 7) as weekday, unnest(array['a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002']::uuid[]) as b;

select set_config('t17.start', (date_trunc('hour', clock_timestamp()) + interval '4 hours')::text, false);

select throws_ok(
  $$ insert into public.customers (shop_id, full_name) values ('a1000000-0000-0000-0000-000000000001', 'Name only') $$,
  '23514', null, 'a customer with only a name is rejected unless a barber created it'
);
select lives_ok(
  $$ insert into public.customers (shop_id, full_name, created_by_barber_id)
     values ('a1000000-0000-0000-0000-000000000001', 'Walk-in', 'a2000000-0000-0000-0000-000000000001') $$,
  'a barber-created customer may have only a name'
);
select throws_ok(
  $$ insert into public.customers (shop_id, full_name, email) values ('a1000000-0000-0000-0000-000000000001', 'Dup', 'T17-Customer@Example.com') $$,
  '23505', null, 'email is unique per shop, case-insensitively'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.book_appointment('a5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz, 'barber', 'First') $$,
  'barber books on their own service'
);
select lives_ok(
  $$ select * from public.book_appointment('a5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz + interval '1 hour', 'barber', 'Second') $$,
  'barber may book the same customer twice on one day (no daily limit)'
);
select throws_ok(
  $$ select * from public.book_appointment('a5000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz + interval '2 hours', 'barber', null) $$,
  'P0008', null, 'barber A cannot book on barber B''s service'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select * from public.book_appointment('a5000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz + interval '3 hours', 'barber', null) $$,
  'P0008', null, 'a customer cannot use the barber source'
);

reset role;
select is(
  (select count(*)::int from public.appointments where source = 'barber' and barber_id = 'a2000000-0000-0000-0000-000000000001'),
  2, 'both barber bookings are stored with source barber'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to see it fail**

Run: `rtk npx supabase test db supabase/tests/017_barber_booking.sql`
Expected: FAIL (`created_by_barber_id` column / enum value `barber` do not exist).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0031_barber_booking_schema.sql`

`book_appointment_internal` is re-created from `0017_recurrence_functions.sql` lines 1-135 with exactly three edits (marked `-- NEW`). Copy that function verbatim and apply them.

```sql
alter type public.appointment_source add value if not exists 'barber';

alter table public.customers
  add column created_by_barber_id uuid references public.barbers (id) on delete restrict;

alter table public.customers drop constraint customers_contact_present;
alter table public.customers add constraint customers_contact_present
  check (
    email is not null or phone is not null or user_id is not null
    or anonymized_at is not null or created_by_barber_id is not null
  );

create unique index customers_shop_email_key
  on public.customers (shop_id, lower(email)) where email is not null;

create or replace function public.book_appointment_internal(
  target_barber_service_id uuid,
  target_customer_id uuid,
  target_starts_at timestamptz,
  target_source public.appointment_source,
  target_notes text,
  target_special_price_cents integer default null,
  target_recurrence_series_id uuid default null,
  target_recurrence_occurrence_date date default null
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target record;
  local_day date;
  owner_actor boolean;
  barber_actor boolean; -- NEW
  daily_lock_key bigint;
begin
  -- ... body identical to 0017 up to and including the owner_actor assignment ...

  owner_actor := public.is_shop_owner(target.shop_id);
  barber_actor := public.is_own_barber(target.barber_id); -- NEW
  if target_source = 'customer' and target.customer_user_id is distinct from actor_id then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if target_source in ('owner', 'recurrence') and not owner_actor then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if target_source = 'barber' and not barber_actor then -- NEW
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  -- ... local_day, recurrence check, advisory lock identical ...

  if not (owner_actor or target_source = 'barber') and exists ( -- NEW (was: not owner_actor)
    select 1 from public.appointments a
    where a.shop_id = target.shop_id
      and a.customer_id = target_customer_id
      and a.status <> 'cancelled'
      and (a.starts_at at time zone target.timezone)::date = local_day
  ) then
    raise exception using errcode = 'P0002', message = 'DAILY_BOOKING_LIMIT';
  end if;

  -- ... rest (start-in-future check, get_available_slots check, insert + exclusion_violation handler) identical ...
end;
$$;

revoke all on function public.book_appointment_internal(uuid, uuid, timestamptz, public.appointment_source, text, integer, uuid, date) from public;
```

The "identical" comments are instructions to the implementer, not literals: the committed file must contain the full function text (no `...` lines). Keep the existing `revoke` line from 0017:499 exactly (the function keeps its signature).

- [ ] **Step 4: Apply and run the test**

```bash
rtk npx supabase migration up && rtk npx supabase test db supabase/tests/017_barber_booking.sql
```
Expected: `All tests successful.` (8 tests). If the one-per-day test fails with `P0002`, the NEW condition was not applied.

- [ ] **Step 5: Regression — existing pgTAP files for booking/recurrence/barber role**

Run: `rtk npx supabase test db supabase/tests/005_booking.sql supabase/tests/007_owner_booking.sql supabase/tests/008_recurrence.sql supabase/tests/013_barber_role.sql`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0031_barber_booking_schema.sql supabase/tests/017_barber_booking.sql
git commit -m "feat(db): barber booking source, name-only customers and unique customer email

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Barber customer RPCs

**Files:**
- Create: `supabase/migrations/0032_barber_customer_rpcs.sql`
- Create: `supabase/tests/018_barber_customer_rpcs.sql`

**Interfaces:**
- Consumes: `customers.created_by_barber_id`, `is_own_barber` (Task 1 / `0026`).
- Produces:
  - `public.barber_find_or_create_customer(target_name text, target_email text default null, target_phone text default null) returns public.customers`
  - `public.barber_search_customers(term text default null) returns table (id uuid, full_name text, email text, phone text, has_account boolean)`
  - Errors: `P0008` not an active barber, `P0024` blank name, `P0025` bad email, `P0007` archived customer.

- [ ] **Step 1: Write the failing test** — `supabase/tests/018_barber_customer_rpcs.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't18-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't18-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't18-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't18-account@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 't18-unconfirmed@example.com', 'x', null);

update public.profiles set role = 'owner' where user_id = 'b0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('b1000000-0000-0000-0000-000000000001', 'T18 Shop', 'b0000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Barber A'),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'T18 Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('b5000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001');

-- Barber B already served "Zed Client"; barber A has not.
insert into public.customers (id, shop_id, full_name, email)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Zed Client', 'zed@example.com');
insert into public.appointments (
  shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values (
  'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001',
  now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', now() - interval '2 days' + interval '30 minutes',
  'completed', 'T18 Cut', 30, 4000, 0
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select full_name from public.barber_find_or_create_customer('  Ana Souza ')), 'Ana Souza', 'name-only customer is created with a trimmed name');
select is(
  (select created_by_barber_id from public.barber_find_or_create_customer('Ana Souza')),
  'b2000000-0000-0000-0000-000000000001'::uuid, 'name-only rows record the creating barber'
);
select is(
  (select id from public.barber_find_or_create_customer('Bia', 'Bia@Example.com', '(11) 99999-0000')),
  (select id from public.barber_find_or_create_customer('Someone else', 'bia@example.com')),
  'the same email (any case) returns the same customer instead of a duplicate'
);
select is((select phone from public.barber_find_or_create_customer('Bia', 'bia@example.com')), '11999990000', 'phone is stored as digits only');
select is(
  (select user_id from public.barber_find_or_create_customer('Acc', 't18-account@example.com')),
  'b0000000-0000-0000-0000-000000000004'::uuid, 'a confirmed existing account is linked immediately'
);
select is(
  (select user_id from public.barber_find_or_create_customer('Unc', 't18-unconfirmed@example.com')),
  null::uuid, 'an unconfirmed account is not linked'
);
select throws_ok($$ select * from public.barber_find_or_create_customer('   ') $$, 'P0024', null, 'blank name is rejected');
select throws_ok($$ select * from public.barber_find_or_create_customer('X', 'not-an-email') $$, 'P0025', null, 'malformed email is rejected');

select is((select count(*)::int from public.barber_search_customers('zed')), 0, 'barber A does not see barber B''s clients');
select is((select count(*)::int from public.barber_search_customers('ana')), 1, 'barber A finds the customer they created, by name');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select * from public.barber_find_or_create_customer('Hack') $$, 'P0008', null, 'a non-barber cannot create customers');
select throws_ok($$ select * from public.barber_search_customers('a') $$, 'P0008', null, 'a non-barber cannot search customers');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to fail**

Run: `rtk npx supabase test db supabase/tests/018_barber_customer_rpcs.sql`
Expected: FAIL (functions do not exist).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0032_barber_customer_rpcs.sql`

```sql
create function public.barber_find_or_create_customer(
  target_name text,
  target_email text default null,
  target_phone text default null
)
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  clean_name text := nullif(btrim(target_name), '');
  clean_email text := lower(nullif(btrim(target_email), ''));
  clean_phone text := nullif(regexp_replace(coalesce(target_phone, ''), '\D', '', 'g'), '');
  account_id uuid;
  result public.customers;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if clean_name is null then
    raise exception using errcode = 'P0024', message = 'CUSTOMER_NAME_REQUIRED';
  end if;
  if clean_email is not null and clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'P0025', message = 'CUSTOMER_EMAIL_INVALID';
  end if;

  if clean_email is not null then
    select * into result from public.customers where shop_id = me.shop_id and lower(email) = clean_email;
    if found then
      if not result.active then
        raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
      end if;
      return result;
    end if;

    select u.id into account_id
    from auth.users u
    join public.profiles p on p.user_id = u.id and p.role = 'customer'
    where lower(u.email) = clean_email and u.email_confirmed_at is not null;

    if account_id is not null then
      select * into result from public.customers where shop_id = me.shop_id and user_id = account_id;
      if found then
        if not result.active then
          raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
        end if;
        return result;
      end if;
    end if;
  end if;

  begin
    insert into public.customers (shop_id, user_id, full_name, email, phone, created_by_barber_id)
    values (me.shop_id, account_id, clean_name, clean_email, clean_phone, me.id)
    returning * into result;
  exception when unique_violation then
    -- A concurrent request created the same email first.
    select * into result from public.customers where shop_id = me.shop_id and lower(email) = clean_email;
    if not found then
      raise;
    end if;
  end;

  return result;
end;
$$;

create function public.barber_search_customers(term text default null)
returns table (id uuid, full_name text, email text, phone text, has_account boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  needle text := lower(btrim(coalesce(term, '')));
  digits text := regexp_replace(coalesce(term, ''), '\D', '', 'g');
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  return query
  select c.id, c.full_name, c.email, c.phone, c.user_id is not null
  from public.customers c
  left join lateral (
    select max(a.starts_at) as last_at
    from public.appointments a
    where a.customer_id = c.id and a.barber_id = me.id
  ) seen on true
  where c.shop_id = me.shop_id
    and c.active
    and (seen.last_at is not null or c.created_by_barber_id = me.id)
    and (
      needle = ''
      or position(needle in lower(c.full_name)) > 0
      or position(needle in lower(coalesce(c.email, ''))) > 0
      or (digits <> '' and position(digits in coalesce(c.phone, '')) > 0)
    )
  order by coalesce(seen.last_at, c.created_at) desc
  limit 8;
end;
$$;

revoke all on function public.barber_find_or_create_customer(text, text, text) from public, anon;
revoke all on function public.barber_search_customers(text) from public, anon;
grant execute on function public.barber_find_or_create_customer(text, text, text) to authenticated;
grant execute on function public.barber_search_customers(text) to authenticated;
```

- [ ] **Step 4: Apply and run**

```bash
rtk npx supabase migration up && rtk npx supabase test db supabase/tests/018_barber_customer_rpcs.sql
```
Expected: 12 tests pass. If the "same email, different name" assertion fails, check the `lower(email)` lookup precedes the insert.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0032_barber_customer_rpcs.sql supabase/tests/018_barber_customer_rpcs.sql
git commit -m "feat(db): barber find-or-create and search customer RPCs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Claim an unlinked customer on signup

**Files:**
- Create: `supabase/migrations/0033_claim_customer_on_signup.sql`
- Create: `supabase/tests/019_claim_customer_on_signup.sql`

**Interfaces:**
- Consumes: unique `(shop_id, lower(email))` index (Task 1).
- Produces: `ensure_my_customer()` (same signature as `0023`) now links an unlinked, active customer with the account's email when the account's email is confirmed.

- [ ] **Step 1: Write the failing test** — `supabase/tests/019_claim_customer_on_signup.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't19-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't19-confirmed@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't19-unconfirmed@example.com', 'x', null);

update public.profiles set role = 'owner' where user_id = 'c0000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id, created_at)
values ('c1000000-0000-0000-0000-000000000001', 'T19 Shop', 'c0000000-0000-0000-0000-000000000001', '2000-01-01');

insert into public.customers (id, shop_id, full_name, email, phone)
values
  ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Pre Confirmed', 'T19-Confirmed@example.com', '11900000001'),
  ('c3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Pre Unconfirmed', 't19-unconfirmed@example.com', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
select is((select id from public.ensure_my_customer()), 'c3000000-0000-0000-0000-000000000001'::uuid, 'a confirmed signup claims the existing same-email customer');
select is((select full_name from public.ensure_my_customer()), 'Pre Confirmed', 'the claimed row keeps its history and name');

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', true);
select isnt((select id from public.ensure_my_customer()), 'c3000000-0000-0000-0000-000000000002'::uuid, 'an unconfirmed signup never claims');
select is((select email from public.ensure_my_customer()), null, 'the new unconfirmed row does not duplicate the taken email');

reset role;
select is(
  (select user_id from public.customers where id = 'c3000000-0000-0000-0000-000000000002'),
  null::uuid, 'the unclaimed customer stays unlinked'
);

select * from finish();
rollback;
```
(`ensure_my_customer` requires profile role `customer`; profiles default to `customer` for new `auth.users`, as in the existing tests.)

- [ ] **Step 2: Run to fail**

Run: `rtk npx supabase test db supabase/tests/019_claim_customer_on_signup.sql`
Expected: FAIL (first assertion returns a new row id, or the unconfirmed insert hits the unique index).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0033_claim_customer_on_signup.sql`

Re-create `ensure_my_customer()` from `0023_customer_self_service.sql:29-~90` (verbatim) with the following changes; keep its existing `revoke`/`grant` (re-issue them in this file):

1. Declare `account_confirmed boolean;` and select it with the email:
```sql
select email, email_confirmed_at is not null, coalesce(raw_user_meta_data, '{}'::jsonb)
into account_email, account_confirmed, meta
from auth.users where id = actor;
```
2. Immediately before the existing `insert`, add the claim:
```sql
if account_confirmed then
  update public.customers c
  set user_id = actor
  where c.shop_id = shop
    and c.user_id is null
    and c.active
    and lower(c.email) = lower(account_email)
    and not exists (select 1 from public.customers x where x.shop_id = shop and x.user_id = actor);
end if;
```
3. In the insert, only store the account email when no other row in the shop already owns it (so an unconfirmed signup does not violate `customers_shop_email_key`):
```sql
case when exists (
  select 1 from public.customers x where x.shop_id = shop and lower(x.email) = lower(account_email)
) then null else account_email end,
```
in place of `account_email` in the `values` list. The `on conflict (shop_id, user_id) where user_id is not null do nothing` stays; the following `select ... where shop_id = shop and user_id = actor` returns the claimed or new row.

- [ ] **Step 4: Apply and run**

```bash
rtk npx supabase migration up && rtk npx supabase test db supabase/tests/019_claim_customer_on_signup.sql supabase/tests/011_customer_self_service.sql supabase/tests/017_barber_booking.sql supabase/tests/018_barber_customer_rpcs.sql
```
Expected: all pass (011 proves signup bootstrap is unchanged for plain new customers).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0033_claim_customer_on_signup.sql supabase/tests/019_claim_customer_on_signup.sql
git commit -m "feat(db): claim an unlinked customer by confirmed email on signup

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Front data layer (errors, types, API, validation)

**Files:**
- Modify: `src/lib/errors/domain-errors.ts`
- Modify: `src/features/appointments/types.ts:1`
- Create: `src/features/appointments/barber-booking.ts`
- Test: `tests/integration/barber-booking.test.ts`

**Interfaces:**
- Consumes: `bookAppointment(supabase, BookingInput)` from `./api`; RPCs from Tasks 2.
- Produces:
```ts
export type BarberCustomer = { email: string | null; fullName: string; hasAccount: boolean; id: string; phone: string | null };
export type BarberCustomerInput = { email?: string | null; name: string; phone?: string | null };
export function normalizePhone(value: string): string;
export function parseBarberCustomerInput(input: BarberCustomerInput): { email: string | null; name: string; phone: string | null };
export async function searchMyCustomers(supabase, term: string): Promise<BarberCustomer[]>;
export async function findOrCreateCustomer(supabase, input: BarberCustomerInput): Promise<BarberCustomer>;
export async function bookAsBarber(supabase, input: { barberServiceId: string; customer: BarberCustomerInput | { id: string }; notes?: string | null; startsAt: string }): Promise<Appointment>;
```
and `DomainErrorCode` gains `"CUSTOMER_NAME_REQUIRED" | "CUSTOMER_EMAIL_INVALID"`.

- [ ] **Step 1: Write the failing test** — `tests/integration/barber-booking.test.ts`

```ts
import {
  bookAsBarber,
  findOrCreateCustomer,
  normalizePhone,
  parseBarberCustomerInput,
  searchMyCustomers,
} from "../../src/features/appointments/barber-booking";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const customerRow = { email: "ana@example.com", full_name: "Ana", has_account: true, id: "customer-1", phone: null };
const createdRow = { active: true, email: null, full_name: "Walk In", id: "customer-2", phone: null, user_id: null };
const appointmentRow = {
  barber_buffer_minutes_snapshot: 0, barber_id: "barber-1", barber_service_id: "bs-1", created_at: "2026-10-01T10:00:00Z",
  customer_id: "customer-2", ends_at: "2026-10-02T12:30:00Z", id: "appt-1", notes: null, occupied_until: "2026-10-02T12:30:00Z",
  service_duration_minutes_snapshot: 30, service_id: "s-1", service_name_snapshot: "Cut", service_price_cents_snapshot: 5000,
  shop_id: "shop-1", source: "barber" as const, starts_at: "2026-10-02T12:00:00Z", status: "scheduled" as const, updated_at: "2026-10-01T10:00:00Z",
};

describe("barber booking input", () => {
  it("keeps only digits in phones", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("11999990000");
  });

  it("requires a name and trims it; email and phone are optional", () => {
    expect(parseBarberCustomerInput({ name: "  Ana  " })).toEqual({ email: null, name: "Ana", phone: null });
    expect(() => parseBarberCustomerInput({ name: "   " })).toThrow(expect.objectContaining({ code: "CUSTOMER_NAME_REQUIRED" }));
  });

  it("lowercases a valid email and rejects a malformed one", () => {
    expect(parseBarberCustomerInput({ email: " Ana@Example.COM ", name: "Ana" }).email).toBe("ana@example.com");
    expect(() => parseBarberCustomerInput({ email: "nope", name: "Ana" })).toThrow(expect.objectContaining({ code: "CUSTOMER_EMAIL_INVALID" }));
  });
});

describe("barber booking RPCs", () => {
  it("maps the new database error codes", () => {
    expect(toDomainError({ code: "P0024" }).code).toBe("CUSTOMER_NAME_REQUIRED");
    expect(toDomainError({ code: "P0025" }).code).toBe("CUSTOMER_EMAIL_INVALID");
  });

  it("searches only through the barber RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [customerRow], error: null });

    await expect(searchMyCustomers({ rpc } as never, " an ")).resolves.toEqual([
      { email: "ana@example.com", fullName: "Ana", hasAccount: true, id: "customer-1", phone: null },
    ]);
    expect(rpc).toHaveBeenCalledWith("barber_search_customers", { term: "an" });
  });

  it("creates or finds a customer with the target_* parameters", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: createdRow, error: null });

    await expect(findOrCreateCustomer({ rpc } as never, { name: "Walk In" })).resolves.toMatchObject({ fullName: "Walk In", hasAccount: false, id: "customer-2" });
    expect(rpc).toHaveBeenCalledWith("barber_find_or_create_customer", { target_email: null, target_name: "Walk In", target_phone: null });
  });

  it("books for a new customer: find-or-create, then book with source barber", async () => {
    const rpc = jest.fn().mockImplementation((name: string) =>
      Promise.resolve(name === "book_appointment" ? { data: [appointmentRow], error: null } : { data: createdRow, error: null }),
    );

    await expect(
      bookAsBarber({ rpc } as never, { barberServiceId: "bs-1", customer: { name: "Walk In" }, startsAt: "2026-10-02T12:00:00Z" }),
    ).resolves.toMatchObject({ id: "appt-1", source: "barber" });
    expect(rpc).toHaveBeenLastCalledWith("book_appointment", {
      barber_service_id: "bs-1", customer_id: "customer-2", notes: null, source: "barber", starts_at: "2026-10-02T12:00:00Z",
    });
  });

  it("books for an existing customer without creating one", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await bookAsBarber({ rpc } as never, { barberServiceId: "bs-1", customer: { id: "customer-1" }, startsAt: "2026-10-02T12:00:00Z" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("book_appointment", expect.objectContaining({ customer_id: "customer-1", source: "barber" }));
  });

  it("surfaces a slot conflict as SLOT_UNAVAILABLE", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0001" } });

    await expect(
      bookAsBarber({ rpc } as never, { barberServiceId: "bs-1", customer: { id: "customer-1" }, startsAt: "2026-10-02T12:00:00Z" }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `rtk npx jest tests/integration/barber-booking.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/errors/domain-errors.ts` — add to the union `| "CUSTOMER_NAME_REQUIRED" | "CUSTOMER_EMAIL_INVALID"` and, before `default:` in `toDomainError`:
```ts
    case "P0024":
      return new DomainError("CUSTOMER_NAME_REQUIRED", "Enter the customer's name.");
    case "P0025":
      return new DomainError("CUSTOMER_EMAIL_INVALID", "Enter a valid email or leave it blank.");
```
`src/features/appointments/types.ts:1` →
```ts
export type AppointmentSource = "customer" | "owner" | "recurrence" | "barber";
```
`src/features/appointments/barber-booking.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { bookAppointment } from "./api";
import type { Appointment } from "./types";

type BarberBookingClient = Pick<SupabaseClient, "rpc">;

export type BarberCustomer = { email: string | null; fullName: string; hasAccount: boolean; id: string; phone: string | null };
export type BarberCustomerInput = { email?: string | null; name: string; phone?: string | null };
export type BarberBookingInput = {
  barberServiceId: string;
  customer: BarberCustomerInput | { id: string };
  notes?: string | null;
  startsAt: string;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function parseBarberCustomerInput(input: BarberCustomerInput) {
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone ? normalizePhone(input.phone) || null : null;

  if (!name) throw new DomainError("CUSTOMER_NAME_REQUIRED", "Enter the customer's name.");
  if (email && !EMAIL_PATTERN.test(email)) throw new DomainError("CUSTOMER_EMAIL_INVALID", "Enter a valid email or leave it blank.");

  return { email, name, phone };
}

export async function searchMyCustomers(supabase: BarberBookingClient, term: string): Promise<BarberCustomer[]> {
  const { data, error } = await supabase.rpc("barber_search_customers", { term: term.trim() });
  if (error) throw toDomainError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as { email: string | null; full_name: string; has_account: boolean; id: string; phone: string | null };

    return { email: r.email, fullName: r.full_name, hasAccount: r.has_account, id: r.id, phone: r.phone };
  });
}

export async function findOrCreateCustomer(supabase: BarberBookingClient, input: BarberCustomerInput): Promise<BarberCustomer> {
  const parsed = parseBarberCustomerInput(input);
  const { data, error } = await supabase.rpc("barber_find_or_create_customer", {
    target_email: parsed.email,
    target_name: parsed.name,
    target_phone: parsed.phone,
  });
  if (error) throw toDomainError(error);

  const r = data as { email: string | null; full_name: string; id: string; phone: string | null; user_id: string | null };

  return { email: r.email, fullName: r.full_name, hasAccount: r.user_id !== null, id: r.id, phone: r.phone };
}

export async function bookAsBarber(supabase: BarberBookingClient, input: BarberBookingInput): Promise<Appointment> {
  const customerId = "id" in input.customer ? input.customer.id : (await findOrCreateCustomer(supabase, input.customer)).id;

  return bookAppointment(supabase, {
    barberServiceId: input.barberServiceId,
    customerId,
    notes: input.notes ?? null,
    source: "barber",
    startsAt: input.startsAt,
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `rtk npx jest tests/integration/barber-booking.test.ts && rtk npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/errors/domain-errors.ts src/features/appointments/types.ts src/features/appointments/barber-booking.ts tests/integration/barber-booking.test.ts
git commit -m "feat(barber): booking API, validation and error codes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Day timeline builder

**Files:**
- Create: `src/features/appointments/day-slots.ts`
- Test: `tests/unit/day-slots.test.ts`

**Interfaces:**
- Consumes: `BarberAgendaAppointment` (`barber-agenda.ts`), `AvailableSlot` (`src/features/availability/types.ts`), `formatInstantInShopTime`.
- Produces:
```ts
export type DayEntry =
  | { kind: "appointment"; appointment: BarberAgendaAppointment; time: string }
  | { kind: "free"; slot: AvailableSlot; time: string };
export function buildDayTimeline(appointments: BarberAgendaAppointment[], slots: AvailableSlot[]): DayEntry[];
export function slotFitsService(slot: AvailableSlot, nextBusyStart: string | null, durationMinutes: number): boolean;
```
`buildDayTimeline` returns appointments (not cancelled) and free slots merged ascending by start instant; a free slot that starts inside an appointment's `[startsAt, occupiedUntil)` is dropped. `slotFitsService(slot, nextBusyStart, minutes)` is true when `slot.startsAt + minutes` is `<= nextBusyStart` (or `nextBusyStart` is null).

- [ ] **Step 1: Write the failing test** — `tests/unit/day-slots.test.ts`

```ts
import { buildDayTimeline, slotFitsService } from "../../src/features/appointments/day-slots";

const slot = (startsAt: string, localTime: string) => ({ endsAt: startsAt, localDate: "2026-10-02", localTime, startsAt });
const appt = (id: string, startsAt: string, occupiedUntil: string, status = "scheduled") =>
  ({ id, occupiedUntil, startsAt, status }) as never;

describe("buildDayTimeline", () => {
  it("merges appointments and free slots in time order", () => {
    const timeline = buildDayTimeline(
      [appt("a1", "2026-10-02T13:00:00.000Z", "2026-10-02T13:30:00.000Z")],
      [slot("2026-10-02T12:00:00.000Z", "09:00"), slot("2026-10-02T14:00:00.000Z", "11:00")],
    );

    expect(timeline.map((entry) => entry.kind)).toEqual(["free", "appointment", "free"]);
  });

  it("drops free slots that start inside an appointment", () => {
    const timeline = buildDayTimeline(
      [appt("a1", "2026-10-02T13:00:00.000Z", "2026-10-02T14:00:00.000Z")],
      [slot("2026-10-02T13:30:00.000Z", "10:30")],
    );

    expect(timeline.map((entry) => entry.kind)).toEqual(["appointment"]);
  });

  it("ignores cancelled appointments", () => {
    const timeline = buildDayTimeline([appt("a1", "2026-10-02T13:00:00.000Z", "2026-10-02T13:30:00.000Z", "cancelled")], []);

    expect(timeline).toEqual([]);
  });
});

describe("slotFitsService", () => {
  const s = slot("2026-10-02T12:00:00.000Z", "09:00");

  it("fits when the service ends before the next busy start", () => {
    expect(slotFitsService(s, "2026-10-02T12:30:00.000Z", 30)).toBe(true);
  });

  it("does not fit when it would overlap the next appointment", () => {
    expect(slotFitsService(s, "2026-10-02T12:20:00.000Z", 30)).toBe(false);
  });

  it("always fits when nothing follows", () => {
    expect(slotFitsService(s, null, 90)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail** — `rtk npx jest tests/unit/day-slots.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/features/appointments/day-slots.ts`

```ts
import type { AvailableSlot } from "../availability/types";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import type { BarberAgendaAppointment } from "./barber-agenda";

export type DayEntry =
  | { appointment: BarberAgendaAppointment; kind: "appointment"; time: string }
  | { kind: "free"; slot: AvailableSlot; time: string };

export function buildDayTimeline(appointments: BarberAgendaAppointment[], slots: AvailableSlot[]): DayEntry[] {
  const live = appointments.filter((appointment) => appointment.status !== "cancelled");
  const free = slots.filter((slot) => !live.some((a) => slot.startsAt >= a.startsAt && slot.startsAt < a.occupiedUntil));

  const entries: Array<DayEntry & { at: string }> = [
    ...live.map((appointment) => ({
      appointment,
      at: appointment.startsAt,
      kind: "appointment" as const,
      time: formatInstantInShopTime(new Date(appointment.startsAt)).localTime,
    })),
    ...free.map((slot) => ({ at: slot.startsAt, kind: "free" as const, slot, time: slot.localTime })),
  ];

  return entries.sort((a, b) => a.at.localeCompare(b.at)).map(({ at: _at, ...entry }) => entry as DayEntry);
}

export function slotFitsService(slot: AvailableSlot, nextBusyStart: string | null, durationMinutes: number) {
  if (!nextBusyStart) return true;

  return new Date(slot.startsAt).getTime() + durationMinutes * 60_000 <= new Date(nextBusyStart).getTime();
}
```

- [ ] **Step 4: Run** — `rtk npx jest tests/unit/day-slots.test.ts && rtk npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/appointments/day-slots.ts tests/unit/day-slots.test.ts
git commit -m "feat(barber): day timeline builder for the agenda

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: i18n strings and error messages

**Files:**
- Modify: `src/i18n/locales/en.ts`, `es.ts`, `pt.ts` (inside `barber.agenda` and `errors.codes`)
- Test: existing `tests/unit/locale-parity.test.ts`

**Interfaces:**
- Produces keys used by Task 7/8, under `barber.agenda`: `bookTitle`, `bookCustomerName`, `bookEmail`, `bookPhone`, `bookService`, `bookConfirm`, `bookCancel`, `bookRecent`, `bookNoEmailHint`, `bookSuccess`, `bookError`, `bookServiceNoFit`, `freeSlot`, `slotsTitle`, `noFreeSlots`, `hasAccount`, `walkIn`; under `errors.codes`: `CUSTOMER_NAME_REQUIRED`, `CUSTOMER_EMAIL_INVALID`.

- [ ] **Step 1: Run the parity test as the guard** — `rtk npx jest tests/unit/locale-parity.test.ts` → PASS (baseline).

- [ ] **Step 2: Add keys to `en.ts`** (keep keys alphabetical inside each group, as the file does)

In `barber.agenda`:
```ts
      bookCancel: "Cancel",
      bookConfirm: "Book",
      bookCustomerName: "Customer name",
      bookEmail: "Email (optional)",
      bookError: "Could not book this time.",
      bookNoEmailHint: "Without an email the customer will not see this appointment in the app.",
      bookPhone: "Phone (optional)",
      bookRecent: "Recent customers",
      bookService: "Service",
      bookServiceNoFit: "Does not fit before the next appointment",
      bookSuccess: "Appointment booked.",
      bookTitle: "Book {{time}}",
      freeSlot: "Free",
      hasAccount: "Has an account",
      noFreeSlots: "No free times this day.",
      slotsTitle: "Day schedule",
      walkIn: "Walk-in",
```
In `errors.codes`:
```ts
      CUSTOMER_EMAIL_INVALID: "Enter a valid email or leave it blank.",
      CUSTOMER_NAME_REQUIRED: "Enter the customer's name.",
```
- [ ] **Step 3: Add the same keys to `pt.ts` and `es.ts`**

pt: `Cancelar`, `Agendar`, `Nome do cliente`, `Email (opcional)`, `Não foi possível agendar este horário.`, `Sem email, o cliente não verá este agendamento no app.`, `Telefone (opcional)`, `Clientes recentes`, `Serviço`, `Não cabe antes do próximo atendimento`, `Atendimento agendado.`, `Agendar {{time}}`, `Livre`, `Tem conta`, `Sem horários livres neste dia.`, `Agenda do dia`, `Avulso`; errors: `Informe um email válido ou deixe em branco.`, `Informe o nome do cliente.`
es: `Cancelar`, `Reservar`, `Nombre del cliente`, `Email (opcional)`, `No se pudo reservar este horario.`, `Sin email, el cliente no verá esta cita en la app.`, `Teléfono (opcional)`, `Clientes recientes`, `Servicio`, `No cabe antes de la siguiente cita`, `Cita reservada.`, `Reservar {{time}}`, `Libre`, `Tiene cuenta`, `No hay horarios libres este día.`, `Agenda del día`, `Sin registro`; errors: `Ingresa un email válido o déjalo en blanco.`, `Ingresa el nombre del cliente.`

- [ ] **Step 4: Run** — `rtk npx jest tests/unit/locale-parity.test.ts && rtk npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales
git commit -m "feat(i18n): barber booking strings in en, es and pt

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `BarberBookingSheet` component

**Files:**
- Create: `src/components/domain/BarberBookingSheet.tsx`
- Modify: `src/components/domain/index.ts` (export it, following the file's pattern)
- Test: `tests/unit/barber-booking-sheet.test.ts`

**Interfaces:**
- Consumes: `BarberCustomer`, `BarberCustomerInput` (Task 4), `MyBarberService` (`src/features/barbers/types.ts`), `Input`, `useFieldChain`, `Button`, `Card`.
- Produces:
```ts
export type BarberBookingSheetProps = {
  busy?: boolean;
  fitsService: (service: MyBarberService) => boolean;   // false disables the option with a reason
  onClose: () => void;
  onSearch: (term: string) => void;                      // parent runs the query
  onSubmit: (input: { customer: BarberCustomerInput | { id: string }; serviceId: string }) => void;
  recent: BarberCustomer[];
  services: MyBarberService[];
  slotLabel: string;                                     // e.g. "09:30"
  visible: boolean;
};
```
Behaviour: typing in the name field calls `onSearch(text)` and shows `recent` as suggestion chips (tap fills name/email/phone and remembers `{ id }`); editing name/email/phone afterwards clears the remembered id. The first fitting service is pre-selected. Confirm is disabled while `name` is blank, no fitting service is selected, or `busy`. When email is empty and a name is typed, the no-email hint is shown. Submit sends `{ id }` if a suggestion is untouched, else the typed fields.

- [ ] **Step 1: Write the failing test** — `tests/unit/barber-booking-sheet.test.ts`

```ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { BarberBookingSheet } from "../../src/components/domain/BarberBookingSheet";

const services = [
  { active: true, barberServiceId: "bs-long", durationMinutes: 60, priceCents: 8000, serviceId: "s2", serviceName: "Cut and beard" },
  { active: true, barberServiceId: "bs-cut", durationMinutes: 30, priceCents: 4000, serviceId: "s1", serviceName: "Cut" },
];
const recent = [{ email: "ana@example.com", fullName: "Ana Souza", hasAccount: true, id: "c1", phone: "11999990000" }];

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    fitsService: (service: { durationMinutes: number }) => service.durationMinutes <= 30,
    onClose: jest.fn(), onSearch: jest.fn(), onSubmit: jest.fn(), recent, services, slotLabel: "09:30", visible: true, ...overrides,
  };

  return { props, view: render(React.createElement(BarberBookingSheet, props as never)) };
}

describe("BarberBookingSheet", () => {
  it("disables confirm until a name is typed, then submits only the typed fields", async () => {
    const { props, view } = setup();
    const v = await view;

    expect(v.getByTestId("barber-book-confirm").props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(v.getByTestId("barber-book-name"), "Walk In");
    fireEvent.press(v.getByTestId("barber-book-confirm"));

    expect(props.onSubmit).toHaveBeenCalledWith({ customer: { email: "", name: "Walk In", phone: "" }, serviceId: "bs-cut" });
  });

  it("pre-selects the first service that fits and disables the ones that do not", async () => {
    const v = await setup().view;

    expect(v.getByTestId("barber-book-service-bs-cut").props.accessibilityState?.selected).toBe(true);
    expect(v.getByTestId("barber-book-service-bs-long").props.accessibilityState?.disabled).toBe(true);
  });

  it("fills the form from a recent customer and submits their id", async () => {
    const { props, view } = setup();
    const v = await view;

    fireEvent.press(v.getByTestId("barber-book-recent-c1"));
    expect(v.getByTestId("barber-book-name").props.value).toBe("Ana Souza");
    fireEvent.press(v.getByTestId("barber-book-confirm"));

    expect(props.onSubmit).toHaveBeenCalledWith({ customer: { id: "c1" }, serviceId: "bs-cut" });
  });

  it("falls back to typed fields once a suggestion is edited", async () => {
    const { props, view } = setup();
    const v = await view;

    fireEvent.press(v.getByTestId("barber-book-recent-c1"));
    fireEvent.changeText(v.getByTestId("barber-book-name"), "Ana S");
    fireEvent.press(v.getByTestId("barber-book-confirm"));

    expect(props.onSubmit).toHaveBeenCalledWith({ customer: { email: "ana@example.com", name: "Ana S", phone: "11999990000" }, serviceId: "bs-cut" });
  });

  it("shows the no-email hint only while a name is typed without an email", async () => {
    const v = await setup().view;

    expect(v.queryByTestId("barber-book-no-email")).toBeNull();
    fireEvent.changeText(v.getByTestId("barber-book-name"), "Walk In");
    expect(v.getByTestId("barber-book-no-email")).toBeTruthy();
    fireEvent.changeText(v.getByTestId("barber-book-email"), "w@example.com");
    expect(v.queryByTestId("barber-book-no-email")).toBeNull();
  });

  it("asks the parent to search as the name changes", async () => {
    const { props, view } = setup();
    const v = await view;

    fireEvent.changeText(v.getByTestId("barber-book-name"), "An");
    expect(props.onSearch).toHaveBeenCalledWith("An");
  });
});
```

(i18n in unit tests: `jest.setup.ts` initialises i18next; assertions use test IDs and values, not translated text. If the project's `useTranslation` needs the init import, follow `tests/unit/i18n-init.test.ts`.)

- [ ] **Step 2: Run to fail** — `rtk npx jest tests/unit/barber-booking-sheet.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/components/domain/BarberBookingSheet.tsx`

```tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import type { BarberCustomer, BarberCustomerInput } from "../../features/appointments/barber-booking";
import type { MyBarberService } from "../../features/barbers/types";
import { Button } from "../ui/Button";
import { Input, useFieldChain } from "../ui/Input";
import { formatPriceBRL } from "./ServiceCard";

export type BarberBookingSheetProps = {
  busy?: boolean;
  fitsService: (service: MyBarberService) => boolean;
  onClose: () => void;
  onSearch: (term: string) => void;
  onSubmit: (input: { customer: BarberCustomerInput | { id: string }; serviceId: string }) => void;
  recent: BarberCustomer[];
  services: MyBarberService[];
  slotLabel: string;
  visible: boolean;
};

export function BarberBookingSheet({ busy = false, fitsService, onClose, onSearch, onSubmit, recent, services, slotLabel, visible }: BarberBookingSheetProps) {
  const { t } = useTranslation();
  const field = useFieldChain(3);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);

  const firstFit = useMemo(() => services.find((service) => fitsService(service))?.barberServiceId ?? null, [fitsService, services]);
  const selected = serviceId && services.some((s) => s.barberServiceId === serviceId && fitsService(s)) ? serviceId : firstFit;

  useEffect(() => {
    if (visible) {
      setName("");
      setEmail("");
      setPhone("");
      setPickedId(null);
      setServiceId(null);
    }
  }, [visible, slotLabel]);

  const edit = (setter: (value: string) => void) => (value: string) => {
    setPickedId(null);
    setter(value);
  };

  const pick = (customer: BarberCustomer) => {
    setPickedId(customer.id);
    setName(customer.fullName);
    setEmail(customer.email ?? "");
    setPhone(customer.phone ?? "");
  };

  const canConfirm = name.trim() !== "" && selected !== null && !busy;
  const confirm = () => {
    if (!canConfirm || !selected) return;
    onSubmit({ customer: pickedId ? { id: pickedId } : { email, name, phone }, serviceId: selected });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[90%] w-full rounded-t-2xl bg-surface">
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled">
            <View className="items-center gap-3 p-5">
              <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
                {t("barber.agenda.bookTitle", { time: slotLabel })}
              </Text>
              <View className="w-full max-w-[420px] gap-3">
                <Input
                  {...field(0)}
                  label={t("barber.agenda.bookCustomerName")}
                  onChangeText={(value) => {
                    edit(setName)(value);
                    onSearch(value);
                  }}
                  testID="barber-book-name"
                  value={name}
                />
                {recent.length > 0 ? (
                  <View className="gap-2">
                    <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.bookRecent")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {recent.map((customer) => (
                        <Pressable
                          accessibilityRole="button"
                          className="rounded-full border border-neutral-300 px-3 py-2"
                          key={customer.id}
                          onPress={() => pick(customer)}
                          testID={`barber-book-recent-${customer.id}`}
                        >
                          <Text className="text-sm font-sans-medium text-ink">{customer.fullName}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <Input {...field(1)} keyboardType="email-address" label={t("barber.agenda.bookEmail")} onChangeText={edit(setEmail)} testID="barber-book-email" value={email} />
                <Input {...field(2)} keyboardType="phone-pad" label={t("barber.agenda.bookPhone")} onChangeText={edit(setPhone)} testID="barber-book-phone" value={phone} />
                {name.trim() !== "" && email.trim() === "" ? (
                  <Text className="text-sm font-sans text-neutral-600" testID="barber-book-no-email">
                    {t("barber.agenda.bookNoEmailHint")}
                  </Text>
                ) : null}
                <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.bookService")}</Text>
                {services.map((service) => {
                  const fits = fitsService(service);

                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ disabled: !fits, selected: selected === service.barberServiceId }}
                      className={`rounded-xl border p-3 ${selected === service.barberServiceId ? "border-ink bg-neutral-100" : "border-neutral-300"} ${fits ? "" : "opacity-50"}`}
                      disabled={!fits}
                      key={service.barberServiceId}
                      onPress={() => setServiceId(service.barberServiceId)}
                      testID={`barber-book-service-${service.barberServiceId}`}
                    >
                      <Text className="text-base font-sans-medium text-ink">{service.serviceName}</Text>
                      <Text className="text-sm font-sans text-neutral-600">
                        {`${service.durationMinutes} min · ${formatPriceBRL(service.priceCents)}`}
                      </Text>
                      {fits ? null : <Text className="text-xs font-sans text-danger-500">{t("barber.agenda.bookServiceNoFit")}</Text>}
                    </Pressable>
                  );
                })}
                <View className="flex-row gap-2">
                  <Button label={t("barber.agenda.bookCancel")} onPress={onClose} testID="barber-book-cancel" variant="outline" />
                  <Button disabled={!canConfirm} label={t("barber.agenda.bookConfirm")} onPress={confirm} testID="barber-book-confirm" />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
```
`Input` must forward `keyboardType` and `testID`; if it does not (check `src/components/ui/Input.tsx`), add the passthrough there in this task and cover it in the test. Add `export * from "./BarberBookingSheet";` (or the file's named-export style) to `src/components/domain/index.ts`.

Note on the `Pressable` `className`: it is a plain RN element, so NativeWind applies (project rule).

- [ ] **Step 4: Run** — `rtk npx jest tests/unit/barber-booking-sheet.test.ts && rtk npm run typecheck && rtk npm run lint` → PASS. Fix typing of `Button`'s `disabled` accessibility state if the first assertion fails (read `Button.tsx` for how disabled is exposed).

- [ ] **Step 5: Commit**

```bash
git add src/components/domain/BarberBookingSheet.tsx src/components/domain/index.ts tests/unit/barber-booking-sheet.test.ts
git commit -m "feat(barber): booking sheet with name-first form and recent customers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire the timeline and sheet into `my-agenda`

**Files:**
- Modify: `app/(barber)/my-agenda.tsx`
- Test: `tests/e2e/barber-booking.web.spec.ts` (Playwright, REST mocked like `tests/e2e/barber-side.web.spec.ts`)

**Interfaces:**
- Consumes: `buildDayTimeline`, `slotFitsService` (Task 5), `BarberBookingSheet` (Task 7), `bookAsBarber`, `searchMyCustomers` (Task 4), `getAvailableSlots` (`src/features/availability/api.ts`), `listMyBarberServices` (`src/features/barbers/api.ts`), strings from Task 6.

- [ ] **Step 1: Write the failing e2e spec** — `tests/e2e/barber-booking.web.spec.ts`

Copy the `signIn`, `commissionProfile`, `agendaRow` and `mockBarberRest` helpers from `tests/e2e/barber-side.web.spec.ts` (extract nothing; same style). Extend the mock with:
- `/rpc/get_available_slots` → one slot at tomorrow-today? Use today: `[{ ends_at, local_date: today, local_time: "23:00", starts_at: <today 23:00 shop-local as ISO> }]`. Compute with `new Date()` plus 3 hours so it is always in the future relative to the mock (the mock does not validate it).
- `/rpc/barber_search_customers` → `[]`.
- `/rpc/barber_find_or_create_customer` → `{ id: "cust-new", full_name: "Walk In", email: null, phone: null, user_id: null }` and records the body.
- `/rpc/book_appointment` → an `agendaRow`-shaped row with `source: "barber"`, and records the body.

Test:
```ts
test("barber books a name-only customer from a free slot", async ({ page }) => {
  const bodies: Record<string, unknown> = {};
  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    const name = url.pathname.split("/rpc/")[1];
    if (name === "get_available_slots") { /* json(route, [slotRow]) */ return true; }
    if (name === "barber_search_customers") { await json(route, []); return true; }
    if (name === "barber_find_or_create_customer" || name === "book_appointment") {
      bodies[name] = route.request().postDataJSON();
      await json(route, name === "book_appointment" ? [agendaRow({ source: "barber" })] : createdCustomerRow);
      return true;
    }
    return false;
  });

  await page.goto("/my-agenda");
  await page.getByTestId("barber-free-slot").first().click();
  await page.getByTestId("barber-book-name").fill("Walk In");
  await page.getByTestId("barber-book-confirm").click();

  await expect(page.getByTestId("barber-book-name")).toBeHidden();
  expect(bodies.barber_find_or_create_customer).toMatchObject({ target_name: "Walk In", target_email: null });
  expect(bodies.book_appointment).toMatchObject({ barber_service_id: "bs1", customer_id: "cust-new", source: "barber" });
});
```
(`json(route, …)` and the handler contract come from `tests/e2e/customer-helpers.ts`; return `true` when handled, as the existing spec does. Fill in the slot row exactly as `AvailableSlotRow`.)

- [ ] **Step 2: Run to fail**

Run: `rtk npm run test:e2e:web -- tests/e2e/barber-booking.web.spec.ts` (move `.env.local` aside first per the e2e gotcha memory, and restore it after).
Expected: FAIL (`barber-free-slot` not found).

- [ ] **Step 3: Implement in `my-agenda.tsx`**

Add imports for the items above, then inside the component:

```tsx
const [bookingSlot, setBookingSlot] = useState<AvailableSlot | null>(null);
const [customerTerm, setCustomerTerm] = useState("");

const services = useQuery({ queryFn: () => listMyBarberServices(supabase), queryKey: ["my-barber-services"] });
const activeServices = useMemo(() => (services.data ?? []).filter((s) => s.active), [services.data]);
const shortest = useMemo(
  () => [...activeServices].sort((a, b) => a.durationMinutes - b.durationMinutes)[0] ?? null,
  [activeServices],
);
const slots = useQuery({
  enabled: Boolean(barber.data && shortest),
  queryFn: () => getAvailableSlots(supabase, { barberId: barber.data?.id ?? "", barberServiceId: shortest?.barberServiceId ?? "", localDate: selectedDate }),
  queryKey: ["barber-slots", barber.data?.id, shortest?.barberServiceId, selectedDate],
});
const customers = useQuery({
  enabled: bookingSlot !== null,
  queryFn: () => searchMyCustomers(supabase, customerTerm),
  queryKey: ["barber-customers", customerTerm],
});
const timeline = useMemo(() => buildDayTimeline(dayAppointments, slots.data ?? []), [dayAppointments, slots.data]);
const nextBusyStart = useMemo(
  () => dayAppointments.filter((a) => a.status !== "cancelled" && bookingSlot && a.startsAt > bookingSlot.startsAt).map((a) => a.startsAt).sort()[0] ?? null,
  [bookingSlot, dayAppointments],
);

const book = useMutation({
  mutationFn: (input: { customer: BarberCustomerInput | { id: string }; serviceId: string }) => {
    if (!bookingSlot) throw new Error("No slot selected.");
    return bookAsBarber(supabase, { barberServiceId: input.serviceId, customer: input.customer, startsAt: bookingSlot.startsAt });
  },
  onError: (error) => {
    fail(error, t("barber.agenda.bookError"));
    void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
  },
  onSuccess: () => {
    setBookingSlot(null);
    setFeedback({ message: t("barber.agenda.bookSuccess"), variant: "success" });
    void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
    void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
    void queryClient.invalidateQueries({ queryKey: ["barber-customers"] });
  },
});
```
Include `book.isPending` in `busy`. Replace the day's appointment list (`dayAppointments.map(renderAppointment)` and its `EmptyState`) with the timeline:

```tsx
<View className="w-full max-w-[420px] gap-3">
  <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("barber.agenda.slotsTitle")}</Text>
  {agenda.isLoading || slots.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
  {agenda.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(agenda.error, t, t("barber.agenda.loadError"))}</Text> : null}
  {!agenda.isLoading && !slots.isLoading && timeline.length === 0 ? <EmptyState title={t("barber.agenda.noFreeSlots")} /> : null}
  {timeline.map((entry) =>
    entry.kind === "appointment" ? (
      renderAppointment(entry.appointment)
    ) : (
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center justify-between rounded-xl border border-dashed border-neutral-300 p-3"
        key={`free-${entry.slot.startsAt}`}
        onPress={() => setBookingSlot(entry.slot)}
        testID="barber-free-slot"
      >
        <Text className="text-lg font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{entry.time}</Text>
        <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.freeSlot")}</Text>
      </Pressable>
    ),
  )}
</View>
```
Mount the sheet next to the `Toast`:
```tsx
<BarberBookingSheet
  busy={book.isPending}
  fitsService={(service) => (bookingSlot ? slotFitsService(bookingSlot, nextBusyStart, service.durationMinutes) : true)}
  onClose={() => setBookingSlot(null)}
  onSearch={setCustomerTerm}
  onSubmit={(input) => book.mutate(input)}
  recent={customers.data ?? []}
  services={activeServices}
  slotLabel={bookingSlot?.localTime ?? ""}
  visible={bookingSlot !== null}
/>
```
Add `Pressable` to the `react-native` import. The pending-closure block and block-time form stay unchanged.

- [ ] **Step 4: Run all front checks**

```bash
rtk npm run typecheck && rtk npm run lint && rtk npx jest --runInBand && rtk npm run test:e2e:web
```
Expected: all green (restore `.env.local` after e2e). If `barber-side.web.spec.ts` fails because it asserted the old empty-day text, update that spec's expectation to the new `noFreeSlots` string rather than weakening the new behaviour.

- [ ] **Step 5: Commit**

```bash
git add "app/(barber)/my-agenda.tsx" tests/e2e/barber-booking.web.spec.ts tests/e2e/barber-side.web.spec.ts
git commit -m "feat(barber): book from a free slot on the agenda timeline

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Test barber user, browser verification and PR

**Files:**
- Modify: `supabase/seed.sql` (append the test barber)
- Modify: `tests/integration/seed-contract.test.ts` only if it pins seed counts (read it first)

**Interfaces:**
- Produces: local login `barber@teste.com` / `barber1234`, role `barber`, linked to a **new** barber row `Barber Teste` (active, with the shop's services via `barber_services` and Mon-Sat working periods), so `db reset` recreates it.

- [ ] **Step 1: Read `supabase/seed.sql` and `tests/integration/seed-contract.test.ts`** to match the existing seeding style (shop/service ids, how seed users are inserted into `auth.users` + `auth.identities` with a bcrypt hash via `crypt('barber1234', gen_salt('bf'))`).

- [ ] **Step 2: Append to `supabase/seed.sql`**: an `auth.users` row for `barber@teste.com` (confirmed email, `crypt('barber1234', gen_salt('bf'))`, matching the columns the file already uses for other seed users) plus its `auth.identities` row; `update public.profiles set role = 'barber', full_name = 'Barber Teste'`; insert into `public.barbers` (new id, the seed shop, `user_id` = the new user, `name = 'Barber Teste'`); `barber_services` for every seed service; `working_periods` weekdays 1-6, 09:00-18:00. Keep the pgTAP seed counts note in mind: `010_full_rls` already fails on counts (known, pre-existing), do not try to fix it here.

- [ ] **Step 3: Create the user in the running local DB** (without wiping dev data): run only the new seed block through `psql` against the local container:

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < <(sed -n '/-- barber teste/,$p' supabase/seed.sql)
```
Wrap the block in `-- barber teste` marker comments so this works; make it idempotent (`on conflict do nothing`).

- [ ] **Step 4: Verify login and RLS through the real API**

```bash
rtk curl -s -X POST "$(grep -m1 EXPO_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)/auth/v1/token?grant_type=password" -H "apikey: $(grep -m1 EXPO_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2)" -H 'Content-Type: application/json' -d '{"email":"barber@teste.com","password":"barber1234"}' | head -c 300
```
Expected: a JSON with `access_token`. (If the env var names differ, read `.env.local` first. Do not echo the keys.)

- [ ] **Step 5: Real-browser verification (project rule: UI must be seen)**

Start Metro web (`CI=1`, no watch, per the local-dev memory; `running-barberschedule-locally` skill if needed), sign in as `barber@teste.com` in the Browser pane, open the agenda, and verify with screenshots: timeline renders with styled free slots (dashed border cards), tapping one opens the sheet, name-only booking succeeds and the new appointment appears; computed-CSS check (`getComputedStyle`) that the free-slot cards and sheet have the expected border/padding/background, i.e. NativeWind applied. Then log in as a customer created with the same email used for a barber booking and confirm it appears in `/appointments` (the claim path end to end).

- [ ] **Step 6: Full verification**

```bash
rtk npm run typecheck && rtk npm run lint && rtk npx jest --runInBand && rtk npm run test:db
```
Expected: green, except the known pre-existing `010_full_rls` count mismatch (report it, do not hide it).

- [ ] **Step 7: Code review** — use `requesting-code-review` on the branch diff; fix findings with new commits.

- [ ] **Step 8: Commit, push, open the PR** (user delegated pushing and PRs; no force-push, no merge)

```bash
git add supabase/seed.sql tests/integration/seed-contract.test.ts
git commit -m "chore(seed): add local test barber barber@teste.com

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat-barber-booking
gh api repos/{owner}/{repo}/pulls -f title='Barber booking from the agenda' -f head=feat-barber-booking -f base=main -f body='<summary, test plan, 🤖 Generated with [Claude Code](https://claude.com/claude-code)>'
```
(`gh pr create` hits the Projects-classic GraphQL error here; use the REST call per the gh memory.)

---

## Self-Review

**Spec coverage:** barber source + no daily limit + own-barber rule → T1; relaxed contact check, `created_by_barber_id`, unique email → T1; find-or-create (normalisation, existing-email reuse, confirmed-account link, archived → `P0007`) and search (own clients + created-by-me, recents) → T2; claim by confirmed email → T3; error codes → T1/T2/T4; front API, `'barber'` type → T4; shortest-service timeline + fit check → T5/T8; sheet (name required, optional email/phone, recent chips, no-email hint, service fit) → T7; agenda entry from the slot → T8; i18n → T6; seed barber + local-only + browser verification + customer-side claim check → T9; pgTAP/Jest/e2e → each task.

**Placeholder scan:** the only elisions are the "copy the unchanged body of `book_appointment_internal` / `ensure_my_customer` verbatim" instructions in T1/T3, which name the exact source file and lines and list every edit; the e2e spec in T8 leaves the slot-row literal to be completed from `AvailableSlotRow` (field names are given).

**Type consistency:** `BarberCustomer`/`BarberCustomerInput` (T4) match the sheet props (T7) and the agenda wiring (T8); RPC parameter names `target_name/target_email/target_phone`, `term`, `barber_service_id/customer_id/starts_at/source/notes` match T2 SQL and T4 tests; `AvailableSlot.startsAt/localTime` match T5/T8; test IDs `barber-free-slot`, `barber-book-*` are consistent across T7/T8.

**Known limitation (documented, not built):** if a customer signs up unconfirmed and later confirms, their existing row is not merged with an earlier name-only/email row; hosted projects keep email confirmation on, which prevents this state.
