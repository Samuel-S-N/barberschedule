begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't19-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't19-confirmed@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't19-unconfirmed@example.com', 'x', null),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't19-flagoff@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 't19-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'f0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'f0000000-0000-0000-0000-000000000005';

-- Oldest shop, so ensure_my_customer (first shop by created_at) picks it.
insert into public.shops (id, name, owner_user_id, created_at)
values ('f1000000-0000-0000-0000-000000000001', 'T19 Shop', 'f0000000-0000-0000-0000-000000000001', '2000-01-01');

insert into public.barbers (id, shop_id, user_id, name)
values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 'T19 Barber');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('f4000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'T19 Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('f5000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001');

insert into public.customers (id, shop_id, full_name, email, phone)
values
  ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Pre Confirmed', 'T19-Confirmed@example.com', '11900000001'),
  ('f3000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'Pre Unconfirmed', 't19-unconfirmed@example.com', null),
  ('f3000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'Pre FlagOff', 't19-flagoff@example.com', null);

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values (
  'f6000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000004',
  'f5000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', now() + interval '1 day', now() + interval '1 day 30 minutes', now() + interval '1 day 30 minutes',
  'scheduled', 'T19 Cut', 30, 4000, 0
);

select is((select email_claim_enabled from public.app_settings), false, 'email claiming is off by default');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Flag off (default): even a confirmed same-email signup must not claim (confirmations may be auto-on locally).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', true);
select isnt((select id from public.ensure_my_customer()), 'f3000000-0000-0000-0000-000000000004'::uuid, 'with the flag off a confirmed signup does not claim');

reset role;
select throws_ok($$set local role authenticated; update public.app_settings set email_claim_enabled = true$$, '42501', null, 'clients cannot flip the flag');
reset role;
update public.app_settings set email_claim_enabled = true;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', true);
select is((select id from public.ensure_my_customer()), 'f3000000-0000-0000-0000-000000000001'::uuid, 'a confirmed signup claims the existing same-email customer');
select is((select full_name from public.ensure_my_customer()), 'Pre Confirmed', 'the claimed row keeps its history and name');

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', true);
select isnt((select id from public.ensure_my_customer()), 'f3000000-0000-0000-0000-000000000002'::uuid, 'an unconfirmed signup never claims');
select is((select email from public.ensure_my_customer()), null, 'the new unconfirmed row does not duplicate the taken email');

reset role;
select is(
  (select user_id from public.customers where id = 'f3000000-0000-0000-0000-000000000002'),
  null::uuid, 'the unclaimed customer stays unlinked'
);

-- Signed up while the flag was off (own row exists); once the flag is on, the barber's row is merged into it.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', true);
select isnt((select id from public.ensure_my_customer()), 'f3000000-0000-0000-0000-000000000004'::uuid, 'the account keeps its own customer row after merging');
select is((select email from public.ensure_my_customer()), 't19-flagoff@example.com', 'the merged row takes the email the barber stored');
reset role;
select is((select count(*)::int from public.customers where id = 'f3000000-0000-0000-0000-000000000004'), 0, 'the barber-created duplicate is gone');
select is(
  (select c.user_id from public.appointments a join public.customers c on c.id = a.customer_id where a.id = 'f6000000-0000-0000-0000-000000000001'),
  'f0000000-0000-0000-0000-000000000004'::uuid, 'its history moved to the account row'
);

select * from finish();
rollback;
