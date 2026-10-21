begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'acct-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'acct-barber@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'acct-customer@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'fd000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'fd000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id) values ('fd100000-0000-0000-0000-000000000001', 'Acct Shop', 'fd000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email) values ('fd200000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000003', 'Acct Customer', 'acct-customer@shop.example');
insert into public.barbers (id, shop_id, name, user_id) values ('fd300000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'Acct Barber', 'fd000000-0000-0000-0000-000000000002');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('fd400000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'Acct Cut', 30, 3500);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('fd500000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001');
insert into public.appointments (id, shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status, source, service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot)
values ('fd600000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000001', 'fd500000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001',
  now() + interval '3 days', now() + interval '3 days 30 minutes', now() + interval '3 days 30 minutes', 'scheduled', 'owner', 'Acct Cut', 30, 3500, 0);

insert into public.notifications (id, user_id, kind, event_key) values
  ('fd700000-0000-0000-0000-000000000001', 'fd000000-0000-0000-0000-000000000003', 'appointment_booked', 'acct-1'),
  ('fd700000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000003', 'appointment_booked', 'acct-2'),
  ('fd700000-0000-0000-0000-000000000003', 'fd000000-0000-0000-0000-000000000003', 'appointment_booked', 'acct-3'),
  ('fd700000-0000-0000-0000-000000000004', 'fd000000-0000-0000-0000-000000000001', 'appointment_booked', 'acct-other');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- barber: blocked by a future appointment, then allowed
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000002', true);
select throws_ok($$ select public.prepare_account_deletion() $$, 'P0018', null, 'a barber with a future appointment cannot delete the account');
select is((select jsonb_array_length(public.export_my_data()->'barbers')), 1, 'the export includes the barber record');

reset role;
update public.appointments set status = 'cancelled' where id = 'fd600000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select public.prepare_account_deletion() $$, 'a barber without open appointments can delete the account');
reset role;
select ok((select not active and user_id is null and archived_at is not null from public.barbers where id = 'fd300000-0000-0000-0000-000000000001'), 'the barber row is anonymised and archived');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.prepare_account_deletion() $$, '42501', null, 'the owner cannot delete the account');

-- notifications
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000003', true);
select is(public.delete_notifications(array['fd700000-0000-0000-0000-000000000001']::uuid[]), 1, 'deletes one notification');
select ok(public.delete_notifications(null) >= 2, 'deletes the remaining ones');
select is((select count(*)::int from public.notifications where user_id = 'fd000000-0000-0000-0000-000000000003'), 0, 'the customer has none left');
reset role;
select is((select count(*)::int from public.notifications where event_key = 'acct-other'), 1, 'never touches another user''s notifications');

select * from finish();

rollback;
