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
