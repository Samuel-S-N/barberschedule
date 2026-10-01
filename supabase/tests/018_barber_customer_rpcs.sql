begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't18-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't18-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't18-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't18-account@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 't18-unconfirmed@example.com', 'x', null);

update public.profiles set role = 'owner' where user_id = 'e0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('e1000000-0000-0000-0000-000000000001', 'T18 Shop', 'e0000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'Barber A'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('e4000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'T18 Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-000000000001');

-- Barber B already served "Zed Client"; barber A has not.
insert into public.customers (id, shop_id, full_name, email)
values ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Zed Client', 'zed@example.com');
insert into public.appointments (
  shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values (
  'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001',
  now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', now() - interval '2 days' + interval '30 minutes',
  'completed', 'T18 Cut', 30, 4000, 0
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select full_name from public.barber_find_or_create_customer('  Ana Souza ')), 'Ana Souza', 'name-only customer is created with a trimmed name');
select is(
  (select created_by_barber_id from public.barber_find_or_create_customer('Caio Lima')),
  'e2000000-0000-0000-0000-000000000001'::uuid, 'name-only rows record the creating barber'
);
select is(
  (select id from public.barber_find_or_create_customer('Bia', 'Bia@Example.com', '(11) 99999-0000')),
  (select id from public.barber_find_or_create_customer('Someone else', 'bia@example.com')),
  'the same email (any case) returns the same customer instead of a duplicate'
);
select is((select phone from public.barber_find_or_create_customer('Bia', 'bia@example.com')), '11999990000', 'phone is stored as digits only');
select is(
  (select user_id from public.barber_find_or_create_customer('Acc', 't18-account@example.com')),
  'e0000000-0000-0000-0000-000000000004'::uuid, 'a confirmed existing account is linked immediately'
);
select is(
  (select user_id from public.barber_find_or_create_customer('Unc', 't18-unconfirmed@example.com')),
  null::uuid, 'an unconfirmed account is not linked'
);
select throws_ok($$ select * from public.barber_find_or_create_customer('   ') $$, 'P0024', null, 'blank name is rejected');
select throws_ok($$ select * from public.barber_find_or_create_customer('X', 'not-an-email') $$, 'P0025', null, 'malformed email is rejected');

select is((select count(*)::int from public.barber_search_customers('zed')), 0, 'barber A does not see barber B''s clients');
select is((select count(*)::int from public.barber_search_customers('ana')), 1, 'barber A finds the customer they created, by name');

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select * from public.barber_find_or_create_customer('Hack') $$, 'P0008', null, 'a non-barber cannot create customers');
select throws_ok($$ select * from public.barber_search_customers('a') $$, 'P0008', null, 'a non-barber cannot search customers');

select * from finish();
rollback;
