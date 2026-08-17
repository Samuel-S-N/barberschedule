begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Owner"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'customer@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Customer"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'claimed-owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"],"role":"owner"}',
    '{"full_name":"Claimed Owner","role":"owner"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'second-owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Second Owner"}'
  );

select is(
  (
    select role::text
    from public.profiles
    where user_id = '00000000-0000-0000-0000-000000000001'
  ),
  'customer',
  'auth user creation creates a customer profile'
);

select is(
  (
    select role::text
    from public.profiles
    where user_id = '00000000-0000-0000-0000-000000000003'
  ),
  'customer',
  'metadata role claims do not elevate profile role'
);

update public.profiles
set role = 'owner'
where user_id = '00000000-0000-0000-0000-000000000001';

update public.profiles
set role = 'owner'
where user_id = '00000000-0000-0000-0000-000000000004';

insert into public.shops (id, name, owner_user_id)
values (
  '10000000-0000-0000-0000-000000000001',
  'Barberschedule MVP',
  '00000000-0000-0000-0000-000000000001'
);

select is(
  (
    select timezone
    from public.shops
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'America/Sao_Paulo',
  'shop timezone defaults to America/Sao_Paulo'
);

select throws_ok(
  $$
    insert into public.shops (id, name, timezone, owner_user_id)
    values (
      '10000000-0000-0000-0000-000000000002',
      'Broken Shop',
      'Mars/Olympus',
      '00000000-0000-0000-0000-000000000004'
    )
  $$,
  '23514',
  null,
  'invalid timezone values are rejected'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int
    from public.profiles
    where user_id = '00000000-0000-0000-0000-000000000002'
  ),
  1,
  'customer can read their own profile'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where user_id = '00000000-0000-0000-0000-000000000001'
  ),
  0,
  'customer cannot read another profile'
);

select is(
  (select role::text from public.get_current_profile()),
  'customer',
  'get_current_profile returns the authenticated profile'
);

select ok(
  not public.is_shop_owner('10000000-0000-0000-0000-000000000001'),
  'customer is not the shop owner'
);

select throws_ok(
  $$ select owner_user_id from public.shops $$,
  '42501',
  null,
  'customer cannot read shop owner_user_id'
);

select lives_ok(
  $$
    update public.shops
    set name = 'Customer Attempt'
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  'customer update attempt is filtered by RLS'
);

select is(
  (
    select name
    from public.shops
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'Barberschedule MVP',
  'customer cannot change public shop fields'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.is_shop_owner('10000000-0000-0000-0000-000000000001'),
  'owner is recognized by the ownership helper'
);

select lives_ok(
  $$
    update public.shops
    set name = 'Owner Rename',
        timezone = 'UTC'
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  'owner can update mutable public shop fields'
);

select is(
  (
    select name
    from public.shops
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'Owner Rename',
  'owner update persists mutable public shop fields'
);

select throws_ok(
  $$
    update public.shops
    set owner_user_id = '00000000-0000-0000-0000-000000000002'
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'owner cannot transfer shop ownership'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select public.is_valid_timezone('UTC') $$,
  '42501',
  null,
  'anonymous users cannot execute timezone validation helper'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.is_valid_timezone('UTC'),
  'authenticated users can execute timezone validation helper'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'anonymous users cannot read profiles'
);

select is(
  (
    select name
    from public.shops
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'Owner Rename',
  'anonymous users can read public shop fields'
);

select throws_ok(
  $$ select owner_user_id from public.shops $$,
  '42501',
  null,
  'anonymous users cannot read shop owner_user_id'
);

select throws_ok(
  $$ select public.is_shop_owner('10000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anonymous users cannot execute ownership helper'
);

select throws_ok(
  $$ select * from public.get_current_profile() $$,
  '42501',
  null,
  'anonymous users cannot execute current profile helper'
);

select throws_ok(
  $$
    update public.shops
    set name = 'Anon Attempt'
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'anonymous users cannot update shops'
);

select throws_ok(
  $$ select 'manager'::public.profile_role $$,
  '22P02',
  null,
  'invalid role values are rejected'
);

select * from finish();

rollback;
