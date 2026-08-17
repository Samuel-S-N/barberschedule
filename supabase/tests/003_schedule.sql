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
    '30000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'task4-owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 4 Owner"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'task4-customer@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 4 Customer"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'task4-other-owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 4 Other Owner"}'
  );

update public.profiles
set role = 'owner'
where user_id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003'
);

insert into public.shops (id, name, owner_user_id)
values
  (
    '31000000-0000-0000-0000-000000000001',
    'Task 4 Main Shop',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    'Task 4 Other Shop',
    '30000000-0000-0000-0000-000000000003'
  );

insert into public.barbers (id, shop_id, name)
values
  (
    '32000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    'Task 4 Barber'
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000002',
    'Task 4 Other Barber'
  );

select throws_ok(
  $$
    insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 1, '09:00', '09:00')
  $$,
  '23514',
  null,
  'zero-length working periods are rejected'
);

select throws_ok(
  $$
    insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 1, '12:00', '09:00')
  $$,
  '23514',
  null,
  'reversed working periods are rejected'
);

insert into public.working_periods (id, shop_id, barber_id, weekday, start_time, end_time)
values
  ('33000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 1, '09:00', '12:00'),
  ('33000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 1, '13:00', '18:00');

select is(
  (select count(*)::int from public.working_periods where barber_id = '32000000-0000-0000-0000-000000000001'),
  2,
  'two working periods are allowed for the same weekday'
);

select throws_ok(
  $$
    insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 1, '11:00', '14:00')
  $$,
  '23P01',
  null,
  'overlapping working periods are rejected'
);

select throws_ok(
  $$
    insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 1, '09:00', '12:00')
  $$,
  '23505',
  null,
  'duplicate identical working periods are rejected'
);

insert into public.schedule_overrides (id, shop_id, barber_id, local_date, kind)
values ('34000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '2026-08-20', 'block');

select is(
  (select start_time from public.schedule_overrides where id = '34000000-0000-0000-0000-000000000001'),
  null,
  'all-day blocks have no start time'
);

select throws_ok(
  $$
    insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '2026-08-21', 'block', '12:00')
  $$,
  '23514',
  null,
  'partial blocks require both times'
);

select throws_ok(
  $$
    insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time, end_time)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '2026-08-21', 'block', '12:00', '12:00')
  $$,
  '23514',
  null,
  'zero-length partial blocks are rejected'
);

select throws_ok(
  $$
    insert into public.schedule_overrides (shop_id, barber_id, local_date, kind)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '2026-08-22', 'opening')
  $$,
  '23514',
  null,
  'extra openings require both times'
);

insert into public.schedule_overrides (id, shop_id, barber_id, local_date, kind, start_time, end_time)
values
  ('34000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '2026-08-21', 'block', '12:00', '13:00'),
  ('34000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '2026-08-22', 'opening', '16:00', '18:00');

select is(
  (select count(*)::int from public.schedule_overrides where barber_id = '32000000-0000-0000-0000-000000000001'),
  3,
  'all-day blocks, partial blocks, and extra openings are records'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select * from public.working_periods $$,
  '42501',
  null,
  'anonymous users cannot directly read working periods'
);

select throws_ok(
  $$ select * from public.schedule_overrides $$,
  '42501',
  null,
  'anonymous users cannot directly read schedule overrides'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.working_periods),
  0,
  'customers cannot directly read working periods'
);

select is(
  (select count(*)::int from public.schedule_overrides),
  0,
  'customers cannot directly read schedule overrides'
);

select throws_ok(
  $$
    insert into public.schedule_overrides (shop_id, barber_id, local_date, kind)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '2026-08-23', 'block')
  $$,
  '42501',
  null,
  'customers cannot create schedule overrides'
);

select throws_ok(
  $$
    insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
    values ('31000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 2, '09:00', '18:00')
  $$,
  '42501',
  null,
  'customers cannot create working periods'
);

select lives_ok(
  $$ delete from public.working_periods where id = '33000000-0000-0000-0000-000000000001' $$,
  'customer working-period delete attempts are filtered by RLS'
);

select is(
  (select count(*)::int from public.working_periods),
  0,
  'customers cannot delete working periods'
);

select lives_ok(
  $$ delete from public.schedule_overrides where id = '34000000-0000-0000-0000-000000000001' $$,
  'customer schedule-override delete attempts are filtered by RLS'
);

select is(
  (select count(*)::int from public.schedule_overrides),
  0,
  'customers cannot delete schedule overrides'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.working_periods),
  0,
  'other owners cannot read another shop working periods'
);

select lives_ok(
  $$ delete from public.schedule_overrides where id = '34000000-0000-0000-0000-000000000001' $$,
  'other owners delete attempts are filtered by RLS'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.working_periods),
  2,
  'owner can read working periods'
);

select is(
  (select count(*)::int from public.schedule_overrides),
  3,
  'owner can read schedule overrides after another owner delete attempt'
);

select * from finish();

rollback;
