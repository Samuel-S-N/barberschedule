begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't56c-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't56c-customer@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't56c-other-owner@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id in ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values
  ('a6100000-0000-0000-0000-000000000001', 'T56 Shop', 'a6000000-0000-0000-0000-000000000001'),
  ('a6100000-0000-0000-0000-000000000002', 'T56 Other Shop', 'a6000000-0000-0000-0000-000000000003');

insert into public.professionals (id, shop_id, name)
values ('a6200000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'T56 Professional');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('a6300000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'T56 Customer', 't56c-customer@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('a6400000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'T56 Cut', 30, 4000);

insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('a6500000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001', 'a6400000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'a6100000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001', weekday, '00:00', '23:59' from generate_series(1, 7) as weekday;

select set_config('t56.start', ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day 10 hours') at time zone 'America/Sao_Paulo')::text, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.book_appointment('a6500000-0000-0000-0000-000000000001', 'a6300000-0000-0000-0000-000000000001', current_setting('t56.start')::timestamptz, 'owner', 'T56');
reset role;
select set_config('t56.appointment', (select id::text from public.appointments where notes = 'T56'), false);

reset role;
select is((select status::text from public.appointments where id = current_setting('t56.appointment')::uuid), 'scheduled', 'an owner-booked appointment starts scheduled');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'confirmed') $$, 'the owner confirms a scheduled appointment');
reset role;
select is((select status::text from public.appointments where id = current_setting('t56.appointment')::uuid), 'confirmed', 'and it is confirmed');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'confirmed') $$, 'P0013', null, 'a confirmed appointment cannot be confirmed again');
select lives_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'completed') $$, 'a confirmed appointment can still be completed');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'confirmed') $$, 'P0010', null, 'another shop''s owner cannot confirm it');

select * from finish();
rollback;
