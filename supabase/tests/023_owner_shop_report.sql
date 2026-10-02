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
  jsonb_array_length(public.get_shop_report(current_date - 200, current_date - 190) -> 'days'),
  0, 'an empty range returns no days'
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
