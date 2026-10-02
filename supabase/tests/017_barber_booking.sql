begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't17-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't17-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't17-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't17-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'd0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('d1000000-0000-0000-0000-000000000001', 'T17 Shop', 'd0000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Barber A'),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'T17 Customer', 't17-customer@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'T17 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'd1000000-0000-0000-0000-000000000001', b, weekday, '00:00', '23:59'
from generate_series(1, 7) as weekday, unnest(array['d2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002']::uuid[]) as b;

select set_config('t17.start', (date_trunc('hour', clock_timestamp()) + interval '4 hours')::text, false);

select throws_ok(
  $$ insert into public.customers (shop_id, full_name) values ('d1000000-0000-0000-0000-000000000001', 'Name only') $$,
  '23514', null, 'a customer with only a name is rejected unless a barber created it'
);
select lives_ok(
  $$ insert into public.customers (shop_id, full_name, created_by_barber_id)
     values ('d1000000-0000-0000-0000-000000000001', 'Walk-in', 'd2000000-0000-0000-0000-000000000001') $$,
  'a barber-created customer may have only a name'
);
select throws_ok(
  $$ insert into public.customers (shop_id, full_name, email) values ('d1000000-0000-0000-0000-000000000001', 'Dup', 'T17-Customer@Example.com') $$,
  '23505', null, 'email is unique per shop, case-insensitively'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.book_appointment('d5000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz, 'barber', 'First') $$,
  'barber books on their own service'
);
select lives_ok(
  $$ select * from public.book_appointment('d5000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz + interval '1 hour', 'barber', 'Second') $$,
  'barber may book the same customer twice on one day (no daily limit)'
);
select throws_ok(
  $$ select * from public.book_appointment('d5000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz + interval '2 hours', 'barber', null) $$,
  'P0008', null, 'barber A cannot book on barber B''s service'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select * from public.book_appointment('d5000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', current_setting('t17.start')::timestamptz + interval '3 hours', 'barber', null) $$,
  'P0008', null, 'a customer cannot use the barber source'
);

reset role;
select is(
  (select count(*)::int from public.appointments where source = 'barber' and barber_id = 'd2000000-0000-0000-0000-000000000001'),
  2, 'both barber bookings are stored with source barber'
);

select * from finish();
rollback;
