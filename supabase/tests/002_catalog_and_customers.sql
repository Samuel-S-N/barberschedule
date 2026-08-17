begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

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
    '20000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'task3-owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 3 Owner"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'task3-customer@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 3 Customer"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'task3-other-owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 3 Other Owner"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'task3-barber-linked@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 3 Linked Barber"}'
  );

update public.profiles
set role = 'owner'
where user_id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.shops (id, name, owner_user_id)
values
  (
    '21000000-0000-0000-0000-000000000001',
    'Task 3 Main Shop',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    'Task 3 Other Shop',
    '20000000-0000-0000-0000-000000000003'
  );

select throws_ok(
  $$
    insert into public.services (
      id,
      shop_id,
      name,
      duration_minutes,
      price_cents
    )
    values (
      '22000000-0000-0000-0000-000000000099',
      '21000000-0000-0000-0000-000000000001',
      'Broken Duration',
      0,
      2500
    )
  $$,
  '23514',
  null,
  'service duration must be positive'
);

select throws_ok(
  $$
    insert into public.services (
      id,
      shop_id,
      name,
      duration_minutes,
      price_cents
    )
    values (
      '22000000-0000-0000-0000-000000000100',
      '21000000-0000-0000-0000-000000000001',
      'Broken Price',
      30,
      -1
    )
  $$,
  '23514',
  null,
  'service price cannot be negative'
);

insert into public.barbers (
  id,
  shop_id,
  user_id,
  name,
  active,
  archived_at
)
values
  (
    '22000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    'Alice Barber',
    true,
    null
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    null,
    'Bob Barber',
    false,
    now()
  );

insert into public.services (
  id,
  shop_id,
  name,
  duration_minutes,
  price_cents,
  active,
  archived_at
)
values
  (
    '22000000-0000-0000-0000-000000000011',
    '21000000-0000-0000-0000-000000000001',
    'Cut',
    30,
    2500,
    true,
    null
  ),
  (
    '22000000-0000-0000-0000-000000000012',
    '21000000-0000-0000-0000-000000000001',
    'Shave',
    60,
    5000,
    true,
    null
  ),
  (
    '22000000-0000-0000-0000-000000000013',
    '21000000-0000-0000-0000-000000000001',
    'Color',
    45,
    7000,
    false,
    now()
  );

select throws_ok(
  $$
    insert into public.barber_services (
      id,
      shop_id,
      barber_id,
      service_id,
      duration_override_minutes
    )
    values (
      '22000000-0000-0000-0000-000000000101',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000011',
      0
    )
  $$,
  '23514',
  null,
  'barber service duration override must be positive'
);

select throws_ok(
  $$
    insert into public.barber_services (
      id,
      shop_id,
      barber_id,
      service_id,
      price_override_cents
    )
    values (
      '22000000-0000-0000-0000-000000000102',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000011',
      -1
    )
  $$,
  '23514',
  null,
  'barber service price override cannot be negative'
);

insert into public.barber_services (
  id,
  shop_id,
  barber_id,
  service_id,
  active
)
values (
  '22000000-0000-0000-0000-000000000021',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000011',
  true
);

select is(
  (
    select proargnames[1]
    from pg_catalog.pg_proc
    inner join pg_catalog.pg_namespace
      on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'resolve_effective_service'
  ),
  'target_barber_service_id',
  'resolve_effective_service exposes the expected PostgREST argument name'
);

insert into public.barber_services (
  id,
  shop_id,
  barber_id,
  service_id,
  duration_override_minutes,
  price_override_cents,
  active
)
values (
  '22000000-0000-0000-0000-000000000022',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000012',
  75,
  6500,
  true
);

insert into public.barber_services (
  id,
  shop_id,
  barber_id,
  service_id,
  active
)
values (
  '22000000-0000-0000-0000-000000000023',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000013',
  true
);

select throws_ok(
  $$
    insert into public.barber_services (
      id,
      shop_id,
      barber_id,
      service_id
    )
    values (
      '22000000-0000-0000-0000-000000000103',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000011'
    )
  $$,
  '23505',
  null,
  'duplicate barber-service combinations are rejected'
);

insert into public.customers (
  id,
  shop_id,
  user_id,
  full_name,
  email,
  phone
)
values
  (
    '22000000-0000-0000-0000-000000000031',
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'Linked Customer',
    'task3-customer@example.com',
    '+5511999990001'
  ),
  (
    '22000000-0000-0000-0000-000000000032',
    '21000000-0000-0000-0000-000000000001',
    null,
    'Offline Customer',
    'offline@example.com',
    '+5511999990002'
  ),
  (
    '22000000-0000-0000-0000-000000000033',
    '21000000-0000-0000-0000-000000000002',
    null,
    'Other Shop Customer',
    'other-shop@example.com',
    '+5511999990003'
  );

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (
    select count(*)::int
    from public.barbers
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  1,
  'anonymous users read only active barbers'
);

select throws_ok(
  $$ select user_id from public.barbers $$,
  '42501',
  null,
  'anonymous users cannot read barber user associations'
);

select is(
  (
    select count(*)::int
    from public.services
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  2,
  'anonymous users read only active services'
);

select is(
  (
    select count(*)::int
    from public.barber_services
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  2,
  'anonymous users read only active barber services with active parents'
);

select is(
  (
    select duration_minutes
    from public.resolve_effective_service(
      '22000000-0000-0000-0000-000000000021'
    )
  ),
  30,
  'public effective-service lookup uses the service default duration'
);

select is(
  (
    select price_cents
    from public.resolve_effective_service(
      '22000000-0000-0000-0000-000000000021'
    )
  ),
  2500,
  'public effective-service lookup uses the service default price'
);

select is(
  (
    select duration_minutes
    from public.resolve_effective_service(
      '22000000-0000-0000-0000-000000000022'
    )
  ),
  75,
  'public effective-service lookup applies the barber duration override'
);

select is(
  (
    select price_cents
    from public.resolve_effective_service(
      '22000000-0000-0000-0000-000000000022'
    )
  ),
  6500,
  'public effective-service lookup applies the barber price override'
);

select is(
  (
    select count(*)::int
    from public.resolve_effective_service(
      '22000000-0000-0000-0000-000000000023'
    )
  ),
  0,
  'public effective-service lookup hides rows tied to inactive services'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int
    from public.customers
    where id = '22000000-0000-0000-0000-000000000031'
  ),
  1,
  'linked customers can read their own customer row'
);

select throws_ok(
  $$ select user_id from public.barbers $$,
  '42501',
  null,
  'customers cannot read barber user associations'
);

select is(
  (
    select count(*)::int
    from public.customers
    where id = '22000000-0000-0000-0000-000000000032'
  ),
  0,
  'linked customers cannot read other customer rows'
);

select throws_ok(
  $$
    insert into public.services (
      id,
      shop_id,
      name,
      duration_minutes,
      price_cents
    )
    values (
      '22000000-0000-0000-0000-000000000104',
      '21000000-0000-0000-0000-000000000001',
      'Unauthorized Service',
      30,
      2500
    )
  $$,
  '42501',
  null,
  'non-owner customers cannot create services'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.barbers (
      id,
      shop_id,
      name
    )
    values (
      '22000000-0000-0000-0000-000000000003',
      '21000000-0000-0000-0000-000000000001',
      'Carla Barber'
    )
  $$,
  'owner can create a barber'
);

select is(
  (
    select count(*)::int
    from public.barbers
    where id = '22000000-0000-0000-0000-000000000003'
  ),
  1,
  'owner-created barber is readable by the owner'
);

select is(
  (
    select user_id::text
    from public.list_owner_barbers('21000000-0000-0000-0000-000000000001')
    where id = '22000000-0000-0000-0000-000000000001'
  ),
  '20000000-0000-0000-0000-000000000004',
  'owners can still read internal barber user associations'
);

select lives_ok(
  $$
    insert into public.customers (
      id,
      shop_id,
      user_id,
      full_name,
      email,
      phone
    )
    values (
      '22000000-0000-0000-0000-000000000034',
      '21000000-0000-0000-0000-000000000001',
      null,
      'Walk In',
      'task3-customer@example.com',
      '+5511999990001'
    )
  $$,
  'owner can create an unlinked customer record'
);

select is(
  (
    select user_id::text
    from public.customers
    where id = '22000000-0000-0000-0000-000000000034'
  ),
  null,
  'matching email and phone do not auto-link a customer account'
);

select lives_ok(
  $$
    update public.services
    set active = false,
        archived_at = now()
    where id = '22000000-0000-0000-0000-000000000011'
  $$,
  'owner can archive a service instead of deleting it'
);

select is(
  (
    select count(*)::int
    from public.services
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  3,
  'owner can still read archived services for history'
);

select is(
  (
    select duration_minutes
    from public.resolve_effective_service(
      '22000000-0000-0000-0000-000000000021'
    )
  ),
  30,
  'owner can still resolve effective service values after deactivation'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (
    select count(*)::int
    from public.services
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  1,
  'anonymous users stop seeing archived services'
);

select is(
  (
    select count(*)::int
    from public.resolve_effective_service(
      '22000000-0000-0000-0000-000000000021'
    )
  ),
  0,
  'anonymous users cannot resolve archived services after deactivation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int
    from public.customers
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  0,
  'other owners cannot read another shop customer list'
);

select lives_ok(
  $$
    update public.barbers
    set name = 'Hijacked Barber'
    where id = '22000000-0000-0000-0000-000000000001'
  $$,
  'other owner update attempt is filtered by RLS'
);

select is(
  (
    select name
    from public.barbers
    where id = '22000000-0000-0000-0000-000000000001'
  ),
  'Alice Barber',
  'other owners cannot change another shop barber'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::int
    from public.barbers
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  3,
  'owners can read active and inactive barbers'
);

select is(
  (
    select count(user_id)::int
    from public.list_owner_barbers('21000000-0000-0000-0000-000000000001')
  ),
  1,
  'owner reads keep barber user associations available only through the owner projection'
);

select is(
  (
    select count(*)::int
    from public.barber_services
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  3,
  'owners can read active and inactive-public barber services'
);

select is(
  (
    select count(*)::int
    from public.customers
    where shop_id = '21000000-0000-0000-0000-000000000001'
  ),
  3,
  'owners can read linked and unlinked customer records'
);

select * from finish();
rollback;
