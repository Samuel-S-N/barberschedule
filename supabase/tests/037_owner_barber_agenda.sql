begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ownbar-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ownbar-owner2@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ownbar-customer@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id in ('fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002');

insert into public.shops (id, name, owner_user_id) values ('fc100000-0000-0000-0000-000000000001', 'Own Agenda Shop', 'fc000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email) values ('fc200000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'Own Customer', 'ownbar-customer@shop.example');
-- the owner serves as a barber: a barber row linked to the owner's own account
insert into public.barbers (id, shop_id, name, user_id) values ('fc300000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001', 'Owner Cuts', 'fc000000-0000-0000-0000-000000000001');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('fc400000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001', 'Own Cut', 30, 3500);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('fc500000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001', 'fc300000-0000-0000-0000-000000000001', 'fc400000-0000-0000-0000-000000000001');
insert into public.appointments (id, shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status, source, service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot)
values ('fc600000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001', 'fc300000-0000-0000-0000-000000000001', 'fc200000-0000-0000-0000-000000000001', 'fc500000-0000-0000-0000-000000000001', 'fc400000-0000-0000-0000-000000000001',
  now() + interval '2 days', now() + interval '2 days 30 minutes', now() + interval '2 days 30 minutes', 'scheduled', 'owner', 'Own Cut', 30, 3500, 0);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.list_my_barber_agenda(current_date, current_date + 30)), 1, 'an owner with a barber row lists their own barber agenda');
select lives_ok($$ select * from public.set_my_appointment_status('fc600000-0000-0000-0000-000000000001', 'confirmed') $$, 'the owner confirms their own appointment');
reset role;
select is((select status::text from public.appointments where id = 'fc600000-0000-0000-0000-000000000001'), 'confirmed', 'the appointment is confirmed');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000002', true);
select throws_ok($$ select * from public.list_my_barber_agenda(current_date, current_date + 30) $$, 'P0019', null, 'an owner without a barber row gets BARBER_NOT_LINKED');

select * from finish();

rollback;
