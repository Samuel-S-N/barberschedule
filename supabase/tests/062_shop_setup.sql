begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't62-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't62-other@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't62-customer@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fe000000-0000-0000-0000-000000000002';
-- a directly inserted shop is open (the default), the owner "other" has one
insert into public.shops (id, name, slug, owner_user_id)
values ('fe100000-0000-0000-0000-000000000002', 'T62 Open', 'open-t62', 'fe000000-0000-0000-0000-000000000002');

-- create_shop makes a CLOSED shop
set local role service_role;
select public.create_shop('T62 New', 'new-t62', 'fe000000-0000-0000-0000-000000000001');
reset role;

select is((select setup_completed_at is not null from public.shops where slug = 'open-t62'), true, 'a directly inserted shop is open');
select is((select setup_completed_at is null from public.shops where slug = 'new-t62'), true, 'create_shop makes a closed shop');

-- the shop id of the closed shop, for the rest of the file
select set_config('t62.shop', (select id::text from public.shops where slug = 'new-t62'), false);

set local role anon;
select lives_ok($$ select setup_completed_at from public.shops $$, 'anyone can read whether a shop is open');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select throws_ok($$ update public.shops set setup_completed_at = now() where slug = 'new-t62' $$, '42501', null, 'an owner cannot open the shop by updating the column');

-- status: everything is missing at first
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["agreement","details","hours","services","team"]'::jsonb, 'a new shop lacks all five required steps');
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'completed', 'false'::jsonb, 'and is not completed');

-- who may read the status or complete the setup
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000002', true);
select throws_ok($$ select public.shop_setup_status(current_setting('t62.shop')::uuid) $$, '42501', 'FORBIDDEN', 'another owner cannot read the status');
select throws_ok($$ select public.complete_shop_setup(current_setting('t62.shop')::uuid) $$, '42501', 'FORBIDDEN', 'another owner cannot complete the setup');
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.complete_shop_setup(current_setting('t62.shop')::uuid) $$, '42501', 'FORBIDDEN', 'a customer cannot complete the setup');
reset role;
set local role anon;
select throws_ok($$ select public.complete_shop_setup('fe100000-0000-0000-0000-000000000002') $$, '42501', null, 'anon has no access to the function');
reset role;

-- the owner cannot complete it while steps are missing
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.complete_shop_setup(current_setting('t62.shop')::uuid) $$, 'P0045', 'SHOP_SETUP_INCOMPLETE', 'completing with missing steps is rejected');
reset role;

-- booking a closed shop is rejected (any customer, any slot: the guard runs first)
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('fe300000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'T62 Cut', 30, 4000);
insert into public.professionals (id, shop_id, name)
values ('fe200000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'T62 Pro');
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('fe400000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('fe500000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'fe000000-0000-0000-0000-000000000003', 'T62 Customer', 't62-customer@example.com');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select * from public.book_appointment('fe400000-0000-0000-0000-000000000001', 'fe500000-0000-0000-0000-000000000001', now() + interval '2 days', 'customer', null) $$,
  'P0044', 'SHOP_NOT_READY', 'a closed shop rejects bookings'
);
reset role;

-- satisfy the steps one by one (the data is written as the test owner, the status is read as the shop owner)
insert into public.consents (user_id, kind, version) values ('fe000000-0000-0000-0000-000000000001', 'business', '2026-11-26');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["details","hours","team"]'::jsonb, 'the agreement step is done once the business agreement is accepted (the service inserted for the booking test already satisfies services)');
reset role;

update public.shops set phone = '+55 11 90000-0000', address_cep = '01310100', address_street = 'Avenida Paulista' where id = current_setting('t62.shop')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["hours","team"]'::jsonb, 'details need a phone or WhatsApp, a CEP and a street');
reset role;

insert into public.shop_hours (shop_id, weekday, start_time, end_time) values (current_setting('t62.shop')::uuid, 1, '09:00', '18:00');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["team"]'::jsonb, 'shop hours step done');
reset role;

-- an inactive service does not count; turning it back on does
update public.services set active = false, archived_at = now() where id = 'fe300000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["services","team"]'::jsonb, 'an inactive service does not satisfy the services step');
reset role;
update public.services set active = true, archived_at = null where id = 'fe300000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["team"]'::jsonb, 'an active service satisfies it (the professional has no hours yet, so team is still missing)');
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'professionals', '[{"id":"fe200000-0000-0000-0000-000000000001","name":"T62 Pro","hasHours":false,"hasServices":true}]'::jsonb, 'the status says what each professional lacks');
reset role;

-- an inactive professional with hours and services does not count
insert into public.professionals (id, shop_id, name, active, archived_at) values ('fe200000-0000-0000-0000-000000000002', current_setting('t62.shop')::uuid, 'T62 Inactive', false, now());
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time) values (current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000002', 1, '09:00', '12:00');
insert into public.professional_services (id, shop_id, professional_id, service_id) values ('fe400000-0000-0000-0000-000000000002', current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000002', 'fe300000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["team"]'::jsonb, 'an inactive professional does not satisfy the team step');
reset role;

-- hours for the active professional complete the team step (no invite needed: user_id is null)
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time) values (current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000001', 1, '09:00', '12:00');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '[]'::jsonb, 'an active professional with hours and services, not yet invited, completes the team step');

-- completing
select isnt(public.complete_shop_setup(current_setting('t62.shop')::uuid), null, 'the owner completes the setup');
reset role;
select is((select setup_completed_at is not null from public.shops where slug = 'new-t62'), true, 'the shop is open now');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.complete_shop_setup(current_setting('t62.shop')::uuid), (select setup_completed_at from public.shops where slug = 'new-t62'), 'completing again returns the same timestamp');
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'completed', 'true'::jsonb, 'the status reports completed');
reset role;

select * from finish();
rollback;
