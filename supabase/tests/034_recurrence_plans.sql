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
