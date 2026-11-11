begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't48-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't48-customer@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'f8000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('f8100000-0000-0000-0000-000000000001', 'T48 Shop', 'f8000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ update public.shops set theme_primary = 'blue' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a colour must be #RRGGBB'
);

select lives_ok(
  $$ update public.shops set theme_primary = '#2F6FDB' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  'a valid colour is accepted'
);

set local role anon;
select results_eq(
  $$ select theme_primary from public.shops where id = 'f8100000-0000-0000-0000-000000000001' $$,
  $$ values ('#2F6FDB'::text) $$,
  'anonymous visitors can read the theme'
);
select throws_ok(
  $$ update public.shops set theme_base = '#FFFFFF' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'anonymous visitors cannot write the theme'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f8000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ update public.shops set theme_accent = '#7A1F2B' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  'the owner writes the theme'
);
select results_eq(
  $$ select theme_accent from public.shops where id = 'f8100000-0000-0000-0000-000000000001' $$,
  $$ values ('#7A1F2B'::text) $$,
  'the owner reads back what they wrote'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f8000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$ with changed as (update public.shops set theme_accent = '#000000' where id = 'f8100000-0000-0000-0000-000000000001' returning 1) select count(*)::int from changed $$,
  $$ values (0) $$,
  'a customer changes no row'
);
reset role;

select is(
  (select theme_accent from public.shops where id = 'f8100000-0000-0000-0000-000000000001'),
  '#7A1F2B',
  'the accent is untouched by the customer'
);

select * from finish();
rollback;
