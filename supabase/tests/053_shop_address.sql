begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't53-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't53-customer@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fd000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, owner_user_id)
values ('fd100000-0000-0000-0000-000000000001', 'T53 Shop', 'fd000000-0000-0000-0000-000000000001');

select hasnt_column('public', 'shops', 'address', 'the free-text address is gone');
select has_column('public', 'shops', 'address_city_ibge', 'the structured address exists');

select throws_ok($$ update public.shops set address_cep = '1234' where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'a CEP has 8 digits');
select throws_ok($$ update public.shops set address_state = 'sp' where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'a UF is 2 capital letters');
select throws_ok($$ update public.shops set address_city_ibge = '35503' where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'an IBGE code has 7 digits');
select throws_ok($$ update public.shops set address_street = repeat('x', 121) where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'street is length-limited');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ update public.shops set address_cep = '01310100', address_street = 'Avenida Paulista', address_number = '1000', address_complement = 'Sala 2',
       address_district = 'Bela Vista', address_city = 'São Paulo', address_state = 'SP', address_city_ibge = '3550308'
     where id = 'fd100000-0000-0000-0000-000000000001' $$,
  'the owner writes the whole address'
);
reset role;

set local role anon;
select results_eq(
  $$ select address_city, address_state from public.shops where id = 'fd100000-0000-0000-0000-000000000001' $$,
  $$ values ('São Paulo'::text, 'SP'::text) $$,
  'anonymous visitors read the address'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$ with changed as (update public.shops set address_city = 'Hack' where id = 'fd100000-0000-0000-0000-000000000001' returning 1) select count(*)::int from changed $$,
  $$ values (0) $$,
  'a customer changes no row'
);
reset role;
select is((select address_city from public.shops where id = 'fd100000-0000-0000-0000-000000000001'), 'São Paulo', 'and the address is untouched');

select * from finish();
rollback;
