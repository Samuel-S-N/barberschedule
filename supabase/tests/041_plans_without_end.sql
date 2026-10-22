begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'noend-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'noend-barber1@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'noend-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f6000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'noend-barber2@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'f6000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('f6000000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000004');

insert into public.shops (id, name, owner_user_id) values ('f6100000-0000-0000-0000-000000000001', 'No End Shop', 'f6000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email) values ('f6200000-0000-0000-0000-000000000001', 'f6100000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000003', 'No End Customer', 'noend-customer@shop.example');
insert into public.barbers (id, shop_id, name, user_id) values
  ('f6300000-0000-0000-0000-000000000001', 'f6100000-0000-0000-0000-000000000001', 'First Barber', 'f6000000-0000-0000-0000-000000000002'),
  ('f6300000-0000-0000-0000-000000000002', 'f6100000-0000-0000-0000-000000000001', 'Second Barber', 'f6000000-0000-0000-0000-000000000004');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('f6400000-0000-0000-0000-000000000001', 'f6100000-0000-0000-0000-000000000001', 'No End Cut', 30, 3500);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('f6500000-0000-0000-0000-000000000001', 'f6100000-0000-0000-0000-000000000001', 'f6300000-0000-0000-0000-000000000001', 'f6400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'f6100000-0000-0000-0000-000000000001', 'f6300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

create temporary table end_dates as select date_trunc('week', current_date + 14)::date as monday;
create temporary table end_ids (name text primary key, id uuid);
grant select on end_dates, end_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'f6400000-0000-0000-0000-000000000001', 1, 2500, 'Corte mensal', true);
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000003', true);
select count(*) from public.request_recurrence('f6500000-0000-0000-0000-000000000001', 1, (select monday from end_dates), '10:00');
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000002', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('f6100000-0000-0000-0000-000000000001') limit 1), true);
reset role;
insert into end_ids select 'series', id from public.recurrence_series where customer_id = 'f6200000-0000-0000-0000-000000000001';

-- a barber sees the active plans of their own customers, and only those
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.list_my_recurrence_series() where active), 1, 'a barber lists the active plans of their customers');
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.list_my_recurrence_series()), 0, 'another barber sees none of them');
select throws_ok($$ select * from public.end_recurrence_series((select id from end_ids where name = 'series')) $$, 'P0010', null, 'another barber cannot end the plan');
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select * from public.end_recurrence_series((select id from end_ids where name = 'series')) $$, 'P0010', null, 'the customer cannot end the plan');

-- the barber of the plan ends it: future appointments are cancelled
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select * from public.end_recurrence_series((select id from end_ids where name = 'series')) $$, 'the barber of the plan ends it');
reset role;
select is(
  (select (not active)::text || '/' || (select count(*)::text from public.appointments where recurrence_series_id = s.id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed'))
   from public.recurrence_series s where s.id = (select id from end_ids where name = 'series')),
  'true/0',
  'the plan is ended and its future appointments are cancelled'
);

-- plans have no planned end: the column and the end-date parameter are gone
select hasnt_column('public', 'recurrence_series', 'ends_on', 'a plan has no end date');
select has_function('public', 'edit_recurrence_series', array['uuid', 'time without time zone', 'integer', 'integer'], 'editing a plan no longer takes an end date');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f6000000-0000-0000-0000-000000000001', true);
select lives_ok($$ select * from public.list_owner_recurrence_series('f6100000-0000-0000-0000-000000000001') $$, 'the owner still lists the plans');

select * from finish();

rollback;
