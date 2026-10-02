begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 't27-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 't27-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 't27-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 't27-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'a1000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'barber' where user_id in ('a1000000-0000-0000-0000-0000000000a2', 'a1000000-0000-0000-0000-0000000000a3');

insert into public.shops (id, name, owner_user_id) values ('a1100000-0000-0000-0000-000000000001', 'T27 Shop', 'a1000000-0000-0000-0000-0000000000a1');
insert into public.barbers (id, shop_id, user_id, name)
values
  ('a1200000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a2', 'Barber A'),
  ('a1200000-0000-0000-0000-000000000002', 'a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000a3', 'Barber B');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
values
  ('a1100000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000001', 1, '09:00', '12:00'),
  ('a1100000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000001', 1, '14:00', '18:00'),
  ('a1100000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000001', 3, '09:00', '17:00'),
  ('a1100000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000002', 2, '10:00', '16:00');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a2', true);

select is((select count(*)::int from public.list_my_working_periods()), 3, 'a barber sees only their own periods');
select is(
  (select array_agg(weekday::int order by weekday, start_time) from public.list_my_working_periods()),
  array[1, 1, 3], 'ordered by weekday and start time'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a4', true);
select throws_ok($$ select * from public.list_my_working_periods() $$, 'P0019', null, 'a non-barber is rejected');

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-0000000000a3', true);
select is((select count(*)::int from public.list_my_working_periods()), 1, 'the other barber sees only theirs');

select * from finish();
rollback;
