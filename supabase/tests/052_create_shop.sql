begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't52-new1@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't52-new2@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't52-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't52-pro@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fc000000-0000-0000-0000-000000000003';
update public.profiles set role = 'professional' where user_id = 'fc000000-0000-0000-0000-000000000004';
insert into public.shops (id, name, slug, owner_user_id)
values ('fc100000-0000-0000-0000-000000000001', 'T52 Existing', 'existing-t52', 'fc000000-0000-0000-0000-000000000003');

set local role service_role;

select results_eq(
  $$ select slug from public.create_shop('Barbearia Um', 'barbearia-um', 'fc000000-0000-0000-0000-000000000001') $$,
  $$ values ('barbearia-um'::text) $$,
  'create_shop returns the new shop'
);
-- the service role has no table privileges on profiles; read the results as the test owner
reset role;
select is((select role::text from public.profiles where user_id = 'fc000000-0000-0000-0000-000000000001'), 'owner', 'the user became the owner');
select is((select timezone from public.shops where slug = 'barbearia-um'), 'America/Sao_Paulo', 'the timezone defaults to Sao Paulo');
set local role service_role;

select throws_ok($$ select public.create_shop('Outra', 'barbearia-um', 'fc000000-0000-0000-0000-000000000002') $$, 'P0041', 'SHOP_SLUG_INVALID', 'a taken slug is rejected');
select throws_ok($$ select public.create_shop('Outra', 'www', 'fc000000-0000-0000-0000-000000000002') $$, 'P0041', 'SHOP_SLUG_INVALID', 'a reserved slug is rejected');
select throws_ok($$ select public.create_shop('Outra', 'AB', 'fc000000-0000-0000-0000-000000000002') $$, 'P0041', 'SHOP_SLUG_INVALID', 'a badly formatted slug is rejected');
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000003') $$, 'P0042', 'SHOP_OWNER_INVALID', 'an owner who already has a shop is rejected');
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000004') $$, 'P0042', 'SHOP_OWNER_INVALID', 'a professional is rejected');
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-00000000dead') $$, 'P0042', 'SHOP_OWNER_INVALID', 'an unknown user is rejected');
reset role;
select is((select role::text from public.profiles where user_id = 'fc000000-0000-0000-0000-000000000002'), 'customer', 'a failed call leaves the user a customer');
set local role service_role;
select lives_ok($$ select id, slug from public.shops where slug = 'barbearia-um' $$, 'the service role can read shop id and slug (invite-professional needs it)');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000002') $$, '42501', null, 'a signed-in user cannot create shops');
reset role;

set local role anon;
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000002') $$, '42501', null, 'an anonymous visitor cannot create shops');
reset role;

select * from finish();
rollback;
