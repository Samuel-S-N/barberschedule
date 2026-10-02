begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't19-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't19-confirmed@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't19-unconfirmed@example.com', 'x', null),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't19-flagoff@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'f0000000-0000-0000-0000-000000000001';

-- Oldest shop, so ensure_my_customer (first shop by created_at) picks it.
insert into public.shops (id, name, owner_user_id, created_at)
values ('f1000000-0000-0000-0000-000000000001', 'T19 Shop', 'f0000000-0000-0000-0000-000000000001', '2000-01-01');

insert into public.customers (id, shop_id, full_name, email, phone)
values
  ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Pre Confirmed', 'T19-Confirmed@example.com', '11900000001'),
  ('f3000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'Pre Unconfirmed', 't19-unconfirmed@example.com', null),
  ('f3000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'Pre FlagOff', 't19-flagoff@example.com', null);

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

select * from finish();
rollback;
