begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't50-ownera@example.com', 'x', now(), '{}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't50-ownerb@example.com', 'x', now(), '{}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't50-pro@example.com', 'x', now(), '{}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't50-customer@example.com', 'x', now(), '{"full_name":"T50 Customer"}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 't50-claim@example.com', 'x', now(), '{"full_name":"T50 Claim"}');
update public.profiles set role = 'owner' where user_id in ('fa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002');
update public.profiles set role = 'professional' where user_id = 'fa000000-0000-0000-0000-000000000003';

-- Shop A sorts before shop B by name AND by created_at: an "alphabetical first" lookup would wrongly pick it for owner B.
insert into public.shops (id, name, slug, owner_user_id, created_at)
values
  ('fa100000-0000-0000-0000-000000000001', 'AAA T50 Shop', 'shop-aaa', 'fa000000-0000-0000-0000-000000000001', '2000-01-01'),
  ('fa100000-0000-0000-0000-000000000002', 'BBB T50 Shop', 'shop-bbb', 'fa000000-0000-0000-0000-000000000002', '2000-01-02');
insert into public.professionals (id, shop_id, name, user_id)
values ('fa200000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000002', 'T50 Pro', 'fa000000-0000-0000-0000-000000000003');

update public.app_settings set email_claim_enabled = true;
insert into public.customers (id, shop_id, full_name, email)
values
  ('fa300000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'Pre A', 't50-claim@example.com'),
  ('fa300000-0000-0000-0000-000000000002', 'fa100000-0000-0000-0000-000000000002', 'Pre B', 't50-claim@example.com');

-- get_my_shop
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000002', true);
select is((select slug from public.get_my_shop()), 'shop-bbb', 'owner B gets shop B, not the alphabetically first shop');

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000003', true);
select is((select slug from public.get_my_shop()), 'shop-bbb', 'a professional gets the shop they work in');

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.get_my_shop()), 0, 'a customer has no staff shop');

-- ensure_my_customer(p_shop_id)
select ok((select id from public.ensure_my_customer('fa100000-0000-0000-0000-000000000001')) is not null, 'creates the customer row in shop A');
select ok((select id from public.ensure_my_customer('fa100000-0000-0000-0000-000000000002')) is not null, 'creates the customer row in shop B');
select is(
  (select count(*)::int from public.customers where user_id = 'fa000000-0000-0000-0000-000000000004'),
  2, 'one customer row per shop'
);
select is(
  (select count(*)::int from public.customers where user_id = 'fa000000-0000-0000-0000-000000000004' and shop_id = 'fa100000-0000-0000-0000-000000000001'),
  1, 'and it is idempotent within a shop'
);

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000005', true);
select is((select full_name from public.ensure_my_customer('fa100000-0000-0000-0000-000000000001')), 'Pre A', 'the e-mail claim links the pre-created row of that shop');
reset role;
select is(
  (select user_id from public.customers where id = 'fa300000-0000-0000-0000-000000000002'),
  null::uuid, 'and leaves the same e-mail in the other shop unclaimed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.ensure_my_customer('fa1fffff-0000-0000-0000-00000000dead') $$, 'P0007', 'CUSTOMER_UNAVAILABLE', 'an unknown shop raises CUSTOMER_UNAVAILABLE');
select throws_ok($$ select * from public.ensure_my_customer() $$, '42883', null, 'the zero-argument version is gone');
reset role;

select * from finish();
rollback;
