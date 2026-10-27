begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't42-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't42-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'af000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'af000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id, timezone)
values ('af100000-0000-0000-0000-000000000001', 'T42 Shop', 'af000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent)
values
  ('af200000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000002', 'Barber A', 'commission', 40),
  ('af200000-0000-0000-0000-000000000002', 'af100000-0000-0000-0000-000000000001', null, 'Barber B', 'commission', 40);

insert into public.customers (id, shop_id, full_name, email)
values ('af300000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'T42 Customer', 't42-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('af400000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('af500000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'af200000-0000-0000-0000-000000000001', 'af400000-0000-0000-0000-000000000001'),
  ('af500000-0000-0000-0000-000000000002', 'af100000-0000-0000-0000-000000000001', 'af200000-0000-0000-0000-000000000002', 'af400000-0000-0000-0000-000000000001');

create function pg_temp.appt(barber uuid, back integer)
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'af100000-0000-0000-0000-000000000001', barber, 'af300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
    ((current_date - back)::timestamp + interval '15 hours') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    'completed', 'Cut', 30, 10000, 0
  from public.barber_services bs where bs.barber_id = barber
$$;

-- Barber A: one completed cut 10 days ago and one yesterday (R$ 100,00 each). Barber B: one 10 days ago.
select pg_temp.appt('af200000-0000-0000-0000-000000000001', 10);
select pg_temp.appt('af200000-0000-0000-0000-000000000001', 1);
select pg_temp.appt('af200000-0000-0000-0000-000000000002', 10);

create function pg_temp.share_a() returns integer language sql as $$
  select (b ->> 'barber_share_cents')::int
  from jsonb_array_elements(public.get_shop_report(current_date - 30, current_date + 2) -> 'barbers') b
  where b ->> 'name' = 'Barber A'
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);

select is(pg_temp.share_a(), 8000, 'constant 40% keeps the report as before: 2 x 100,00 x 40%');

-- "Only from now on": 40% -> 50%.
select lives_ok(
  $$ select * from public.set_barber_compensation('af200000-0000-0000-0000-000000000001', 'commission', 50, null, null, false) $$,
  'the owner raises the commission from now on'
);
select is(pg_temp.share_a(), 8000, 'past appointments keep the old 40%');
select is(
  (select commission_percent from public.list_owner_barbers('af100000-0000-0000-0000-000000000001') where id = 'af200000-0000-0000-0000-000000000001'),
  50::numeric, 'the barber row mirrors the current percent'
);

-- A new appointment after the change uses 50%.
reset role;
select pg_temp.appt('af200000-0000-0000-0000-000000000001', -1);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);
select is(pg_temp.share_a(), 13000, 'a future appointment uses the new 50%: 8000 + 100,00 x 50%');

-- Same percent: history untouched.
select lives_ok(
  $$ select * from public.set_barber_compensation('af200000-0000-0000-0000-000000000001', 'commission', 50, null, null, true) $$,
  'saving the same percent is a no-op even with the retroactive flag'
);
select is(pg_temp.share_a(), 13000, 'and nothing was rewritten');

-- Retroactive: 50% -> 60% over everything.
select lives_ok(
  $$ select * from public.set_barber_compensation('af200000-0000-0000-0000-000000000001', 'commission', 60, null, null, true) $$,
  'the owner applies 60% retroactively'
);
select is(pg_temp.share_a(), 18000, 'every appointment now uses 60%: 3 x 100,00 x 60%');

-- The barber report follows the same rule.
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000002', true);
select is(
  (select sum((d ->> 'earnings_cents')::int)::int from jsonb_array_elements(public.get_my_barber_report(current_date - 30, current_date + 2) -> 'days') d),
  18000, 'the barber report uses the per-appointment percent too'
);

select * from finish();
rollback;
