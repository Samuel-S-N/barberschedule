begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b4600000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't46-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b4600000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't46-barber@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b4600000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't46-customer@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'b4600000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'b4600000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id, timezone)
values ('b4610000-0000-0000-0000-000000000001', 'T46 Shop', 'b4600000-0000-0000-0000-000000000001', 'America/Sao_Paulo');
insert into public.barbers (id, shop_id, user_id, name)
values ('b4620000-0000-0000-0000-000000000001', 'b4610000-0000-0000-0000-000000000001', 'b4600000-0000-0000-0000-000000000002', 'T46 Barber');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b4630000-0000-0000-0000-000000000001', 'b4610000-0000-0000-0000-000000000001', 'T46 Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('b4640000-0000-0000-0000-000000000001', 'b4610000-0000-0000-0000-000000000001', 'b4620000-0000-0000-0000-000000000001', 'b4630000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('b4650000-0000-0000-0000-000000000001', 'b4610000-0000-0000-0000-000000000001', 'b4600000-0000-0000-0000-000000000003', 'T46 Customer', 't46-customer@example.com');

-- M1: user text has a size limit in the database, not only in the app.
select throws_ok(
  $$ insert into public.appointments (shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until,
       status, source, notes, service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot)
     values ('b4610000-0000-0000-0000-000000000001', 'b4620000-0000-0000-0000-000000000001', 'b4650000-0000-0000-0000-000000000001',
       'b4640000-0000-0000-0000-000000000001', 'b4630000-0000-0000-0000-000000000001', '2031-03-03 12:00+00', '2031-03-03 12:30+00',
       '2031-03-03 12:30+00', 'scheduled', 'owner', repeat('n', 501), 'T46 Cut', 30, 4000, 0) $$,
  '23514', null, 'appointment notes are capped at 500'
);
select lives_ok(
  $$ insert into public.appointments (shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until,
       status, source, notes, service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot)
     values ('b4610000-0000-0000-0000-000000000001', 'b4620000-0000-0000-0000-000000000001', 'b4650000-0000-0000-0000-000000000001',
       'b4640000-0000-0000-0000-000000000001', 'b4630000-0000-0000-0000-000000000001', '2031-03-03 12:00+00', '2031-03-03 12:30+00',
       '2031-03-03 12:30+00', 'scheduled', 'owner', repeat('n', 500), 'T46 Cut', 30, 4000, 0) $$,
  'a 500-character note is accepted'
);
select throws_ok(
  $$ update public.customers set full_name = repeat('c', 101) where id = 'b4650000-0000-0000-0000-000000000001' $$,
  '23514', null, 'customer names are capped at 100'
);
select lives_ok(
  $$ update public.customers set full_name = repeat('c', 100) where id = 'b4650000-0000-0000-0000-000000000001' $$,
  'a 100-character customer name is accepted'
);
select throws_ok(
  $$ update public.customers set email = repeat('e', 245) || '@example.com' where id = 'b4650000-0000-0000-0000-000000000001' $$,
  '23514', null, 'customer emails are capped at 254'
);
select throws_ok(
  $$ update public.customers set phone = repeat('1', 31) where id = 'b4650000-0000-0000-0000-000000000001' $$,
  '23514', null, 'customer phones are capped at 30'
);
select throws_ok(
  $$ update public.profiles set full_name = repeat('p', 101) where user_id = 'b4600000-0000-0000-0000-000000000003' $$,
  '23514', null, 'profile names are capped at 100'
);
select throws_ok(
  $$ update public.barbers set name = repeat('b', 81) where id = 'b4620000-0000-0000-0000-000000000001' $$,
  '23514', null, 'barber names are capped at 80'
);
select lives_ok(
  $$ update public.barbers set name = repeat('b', 80) where id = 'b4620000-0000-0000-0000-000000000001' $$,
  'an 80-character barber name is accepted'
);
select throws_ok(
  $$ update public.barbers set avatar_url = 'https://x/' || repeat('a', 491) where id = 'b4620000-0000-0000-0000-000000000001' $$,
  '23514', null, 'barber avatar URLs are capped at 500'
);
select throws_ok(
  $$ update public.services set name = repeat('s', 81) where id = 'b4630000-0000-0000-0000-000000000001' $$,
  '23514', null, 'service names are capped at 80'
);
select throws_ok(
  $$ update public.services set description = repeat('d', 501) where id = 'b4630000-0000-0000-0000-000000000001' $$,
  '23514', null, 'service descriptions are capped at 500'
);
select lives_ok(
  $$ update public.services set description = repeat('d', 500) where id = 'b4630000-0000-0000-0000-000000000001' $$,
  'a 500-character service description is accepted'
);

-- The customer-facing RPCs hit the same limits.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4600000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.update_my_profile(repeat('n', 101), null) $$,
  '23514', null, 'update_my_profile refuses a 101-character name'
);
select lives_ok(
  $$ select * from public.update_my_profile('T46 Customer', '11 99999-0000') $$,
  'update_my_profile still accepts a normal profile'
);

reset role;

select throws_ok(
  $$ insert into public.customers (shop_id, full_name, email) values ('b4610000-0000-0000-0000-000000000001', 'x', 'y@example.com'),
       ('b4610000-0000-0000-0000-000000000001', repeat('z', 101), 'z@example.com') $$,
  '23514', null, 'barber-created and owner-created customers share the cap'
);

-- B2: direct table writes cannot link someone else's account to a barber or customer row.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'b4600000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't46-walkin@example.com', 'x', now());
insert into public.barbers (id, shop_id, name) values ('b4620000-0000-0000-0000-000000000002', 'b4610000-0000-0000-0000-000000000001', 'T46 Unlinked');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4600000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.barbers (shop_id, user_id, name) values ('b4610000-0000-0000-0000-000000000001', 'b4600000-0000-0000-0000-000000000001', 'Owner as barber') $$,
  'the owner may link their own account (serve as a barber)'
);
select throws_ok(
  $$ insert into public.barbers (shop_id, user_id, name) values ('b4610000-0000-0000-0000-000000000001', 'b4600000-0000-0000-0000-000000000004', 'Hijack') $$,
  '42501', 'ACCOUNT_LINK_FORBIDDEN', 'the owner cannot insert a barber linked to another account'
);
select throws_ok(
  $$ update public.barbers set user_id = 'b4600000-0000-0000-0000-000000000004' where id = 'b4620000-0000-0000-0000-000000000002' $$,
  '42501', 'ACCOUNT_LINK_FORBIDDEN', 'the owner cannot link another account to an existing barber'
);
select lives_ok(
  $$ update public.barbers set name = 'Renamed' where id = 'b4620000-0000-0000-0000-000000000001' $$,
  'the owner still renames a barber linked to another account'
);
select lives_ok(
  $$ update public.barbers set user_id = null where id = 'b4620000-0000-0000-0000-000000000001' $$,
  'the owner may unlink a barber account'
);
select throws_ok(
  $$ insert into public.customers (shop_id, user_id, full_name) values ('b4610000-0000-0000-0000-000000000001', 'b4600000-0000-0000-0000-000000000004', 'Hijack') $$,
  '42501', 'ACCOUNT_LINK_FORBIDDEN', 'the owner cannot insert a customer linked to an account'
);
select throws_ok(
  $$ update public.customers set user_id = 'b4600000-0000-0000-0000-000000000004' where id = 'b4650000-0000-0000-0000-000000000001' $$,
  '42501', 'ACCOUNT_LINK_FORBIDDEN', 'the owner cannot relink a customer row to another account'
);
select lives_ok(
  $$ insert into public.customers (shop_id, full_name, phone) values ('b4610000-0000-0000-0000-000000000001', 'Walk-in', '11 98888-0000') $$,
  'the owner still creates customers without an account'
);

-- The RPCs that link accounts on purpose keep working.
select set_config('request.jwt.claims', '{"sub":"b4600000-0000-0000-0000-000000000002","role":"authenticated"}', true);
reset role;
update public.barbers set user_id = 'b4600000-0000-0000-0000-000000000002' where id = 'b4620000-0000-0000-0000-000000000001';
set local role authenticated;
select is(
  (select has_account from public.barber_find_or_create_customer('Walk In', 't46-walkin@example.com')),
  true,
  'barber_find_or_create_customer still links a confirmed account'
);

reset role;
select lives_ok(
  $$ update public.barbers set user_id = 'b4600000-0000-0000-0000-000000000004' where id = 'b4620000-0000-0000-0000-000000000002' $$,
  'roles other than authenticated (invite-barber, migrations) still link accounts'
);
reset role;

select * from finish();
rollback;
