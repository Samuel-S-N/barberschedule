begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't24-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't24-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't24-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't24-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'c0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('c1000000-0000-0000-0000-000000000001', 'T24 Shop', 'c0000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Barber A'),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('c4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'T24 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('c5000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001'),
  ('c5000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'c1000000-0000-0000-0000-000000000001', b, weekday, '00:00', '23:59'
from generate_series(1, 7) as weekday, unnest(array['c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002']::uuid[]) as b;

select set_config('t24.start', (date_trunc('hour', clock_timestamp()) + interval '4 hours')::text, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.barber_book_new_customer('c5000000-0000-0000-0000-000000000001', current_setting('t24.start')::timestamptz, 'Walk In')),
  1, 'booking for a new customer returns one appointment'
);

reset role;
select is((select count(*)::int from public.customers where shop_id = 'c1000000-0000-0000-0000-000000000001' and full_name = 'Walk In'), 1, 'it created exactly one customer');
select is(
  (select count(*)::int from public.appointments a join public.customers c on c.id = a.customer_id where c.full_name = 'Walk In' and a.source = 'barber'),
  1, 'and one barber-sourced appointment for that customer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select * from public.barber_book_new_customer('c5000000-0000-0000-0000-000000000001', current_setting('t24.start')::timestamptz, 'Ghost Taken') $$,
  'P0001', null, 'a taken slot is rejected'
);
select throws_ok(
  $$ select * from public.barber_book_new_customer('c5000000-0000-0000-0000-000000000002', current_setting('t24.start')::timestamptz + interval '2 hours', 'Ghost Other') $$,
  'P0008', null, 'another barber''s service is rejected'
);

reset role;
select is((select count(*)::int from public.customers where full_name like 'Ghost%'), 0, 'failed bookings leave no customer behind');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select * from public.barber_book_new_customer('c5000000-0000-0000-0000-000000000001', current_setting('t24.start')::timestamptz + interval '1 hour', 'Bia', 'bia24@example.com') $$,
  'a new customer with an email books'
);
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select * from public.barber_book_new_customer('c5000000-0000-0000-0000-000000000001', current_setting('t24.start')::timestamptz + interval '3 hours', 'Nope') $$,
  'P0008', null, 'a non-barber cannot use it'
);

select * from finish();
rollback;
