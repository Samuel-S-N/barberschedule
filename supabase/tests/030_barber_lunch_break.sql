begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lunch-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'lunch-barber@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'f0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'f0000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id)
values ('f1000000-0000-0000-0000-000000000001', 'Lunch Shop', 'f0000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, name, user_id)
values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Lunch Barber', 'f0000000-0000-0000-0000-000000000003');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Lunch Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('f4000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001');

-- Mondays 09:00-18:00. 2030-01-07 is a Monday.
insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
values ('f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 1, '09:00', '18:00');

select is(
  (select count(*)::int from public.get_available_slots('f2000000-0000-0000-0000-000000000001', date '2030-01-07', 'f4000000-0000-0000-0000-000000000001') where local_time = '12:00'),
  1,
  'a 12:00 slot exists before a lunch break is set'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$ select public.set_my_lunch_break('12:00', '13:00') $$, 'the barber sets a lunch break');

select is(
  (select count(*)::int from public.get_available_slots('f2000000-0000-0000-0000-000000000001', date '2030-01-07', 'f4000000-0000-0000-0000-000000000001') where local_time >= '12:00' and local_time < '13:00'),
  0,
  'no slots are offered during lunch'
);

select is(
  (select count(*)::int from public.get_available_slots('f2000000-0000-0000-0000-000000000001', date '2030-01-07', 'f4000000-0000-0000-0000-000000000001') where local_time = '13:00'),
  1,
  'slots resume right after lunch'
);

select is(
  (select count(*)::int from public.get_available_slots('f2000000-0000-0000-0000-000000000001', date '2030-01-07', 'f4000000-0000-0000-0000-000000000001') where local_time = '11:45'),
  0,
  'a slot that would run into lunch is not offered either'
);

select is((select lunch_start::text from public.get_my_lunch_break()), '12:00:00', 'the barber reads the lunch break back');
select throws_ok($$ select public.set_my_lunch_break('13:00', '12:00') $$, 'P0020', null, 'start must be before end');
select throws_ok($$ select public.set_my_lunch_break('12:00', null) $$, 'P0020', null, 'both times or neither');

-- the barber may not list the shop's lunch breaks; the owner may
select throws_ok($$ select * from public.list_shop_lunch_breaks('f1000000-0000-0000-0000-000000000001') $$, 'P0010', null, 'a barber cannot list the shop lunch breaks');
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
select is(
  (select lunch_start::text from public.list_shop_lunch_breaks('f1000000-0000-0000-0000-000000000001') where barber_id = 'f2000000-0000-0000-0000-000000000001'),
  '12:00:00',
  'the owner lists the barber lunch'
);

select * from finish();

rollback;
