begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't11-owner@example.com', 'password-hash', now(), '{"full_name":"T11 Owner"}'),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't11-customer@example.com', 'password-hash', now(), '{"full_name":"T11 Customer","phone":"+55 11 90000-1111","accepted_terms_version":"2026-09-23"}'),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't11-other@example.com', 'password-hash', now(), '{"full_name":"T11 Other"}');

update public.profiles set role = 'owner' where user_id = '70000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('71000000-0000-0000-0000-000000000001', 'T11 Shop', '70000000-0000-0000-0000-000000000001');

select set_config('t11.shop', (select id::text from public.shops order by created_at, id limit 1), false);

insert into public.barbers (id, shop_id, name)
values ('72000000-0000-0000-0000-000000000001', current_setting('t11.shop')::uuid, 'T11 Barber');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('73000000-0000-0000-0000-000000000001', current_setting('t11.shop')::uuid, 'T11 Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('74000000-0000-0000-0000-000000000001', current_setting('t11.shop')::uuid, '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001');

-- customer
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select full_name from public.ensure_my_customer()), 'T11 Customer', 'ensure_my_customer creates the row from the profile name');
select is((select phone from public.ensure_my_customer()), '+55 11 90000-1111', 'phone comes from signup metadata');
select is((select count(*)::int from public.customers where user_id = '70000000-0000-0000-0000-000000000002'), 1, 'ensure_my_customer is idempotent');
select is((select count(*)::int from public.consents where user_id = '70000000-0000-0000-0000-000000000002'), 2, 'terms and privacy consents recorded once each');

-- other customer cannot read consents
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.consents), 0, 'other users cannot read someone else''s consents');

-- anon
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$ select public.ensure_my_customer() $$, '42501', null, 'anonymous callers cannot ensure a customer');

-- owner
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select public.ensure_my_customer() $$, '42501', null, 'owners cannot create a customer self row');

-- profile update
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select full_name from public.update_my_profile('T11 Renamed', '+55 11 91111-2222')), 'T11 Renamed', 'update_my_profile updates the customer row');
select is((select full_name from public.profiles where user_id = '70000000-0000-0000-0000-000000000002'), 'T11 Renamed', 'update_my_profile updates the profile');
select throws_ok($$ select public.update_my_profile('T11 Renamed', 'abc') $$, 'P0017', null, 'invalid phone rejected');
select throws_ok($$ select public.update_my_profile('   ', null) $$, 'P0017', null, 'blank name rejected');

-- appointment fixture (superuser)
reset role;
insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
)
select '75000000-0000-0000-0000-000000000001', shop_id, '72000000-0000-0000-0000-000000000001', id,
  '74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
  now() + interval '3 days', now() + interval '3 days 30 minutes', now() + interval '3 days 30 minutes',
  'T11 Cut', 30, 4000, 0
from public.customers where user_id = '70000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(jsonb_array_length(public.export_my_data() -> 'appointments'), 1, 'export includes the caller''s appointments');
select throws_ok($$ select public.prepare_account_deletion() $$, 'P0018', null, 'deletion blocked while an upcoming appointment exists');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(jsonb_array_length(public.export_my_data() -> 'appointments'), 0, 'export never includes another user''s appointments');

-- deletion after cancelling
reset role;
update public.appointments set status = 'cancelled' where id = '75000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$ select public.prepare_account_deletion() $$, 'deletion allowed once nothing upcoming remains');

reset role;
select is((select full_name from public.customers where id = (select customer_id from public.appointments where id = '75000000-0000-0000-0000-000000000001')), 'Cliente removido', 'customer row anonymized');
select is((select count(*)::int from public.appointments where id = '75000000-0000-0000-0000-000000000001'), 1, 'appointment history retained');

select * from finish();
rollback;
