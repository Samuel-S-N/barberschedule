begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

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
    '40000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'task5-owner@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 5 Owner"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'task5-customer@example.com',
    'password-hash',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Task 5 Customer"}'
  );

update public.profiles
set role = 'owner'
where user_id = '40000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values (
  '41000000-0000-0000-0000-000000000001',
  'Task 5 Shop',
  '40000000-0000-0000-0000-000000000001'
);

insert into public.barbers (id, shop_id, name)
values
  (
    '42000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'Task 5 Main Barber'
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000001',
    'Task 5 Other Barber'
  );

insert into public.customers (id, shop_id, full_name, email)
values (
  '43000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'Task 5 Customer',
  'task5-customer@example.com'
);

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values
  (
    '44000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'Task 5 Standard',
    30,
    5000
  ),
  (
    '44000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000001',
    'Task 5 Too Long',
    241,
    9000
  ),
  (
    '44000000-0000-0000-0000-000000000003',
    '41000000-0000-0000-0000-000000000001',
    'Task 5 Odd Duration',
    31,
    5100
  );

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  (
    '45000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001'
  ),
  (
    '45000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000002'
  ),
  (
    '45000000-0000-0000-0000-000000000003',
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000002',
    '44000000-0000-0000-0000-000000000001'
  ),
  (
    '45000000-0000-0000-0000-000000000004',
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000003'
  );

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    1,
    '09:00',
    '12:00'
  ),
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    1,
    '13:00',
    '17:00'
  ),
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000002',
    1,
    '09:00',
    '10:00'
  ),
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000002',
    1,
    '22:00',
    '23:00'
  );

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  26,
  'multiple working periods produce all 30-minute slots on a 15-minute grid'
);

select is(
  (
    select min(local_time)::text
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  '09:00:00',
  'normal availability begins at the workday start'
);

select is(
  (
    select max(local_time)::text
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  '16:30:00',
  'normal availability fits the service before the workday end'
);

select ok(
  not exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time >= '12:00'::time
      and local_time < '13:00'::time
  ),
  'the lunch gap never produces a slot'
);

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-18',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  0,
  'a date without a workday has no slots'
);

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000002'
    )
  ),
  0,
  'a service longer than every open interval has no slots'
);

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000003'
    )
  ),
  0,
  'a barber cannot request another barber service availability'
);

select is(
  (
    select ends_at::text
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000004'
    )
    where local_time = '09:00'::time
  ),
  '2026-08-17 12:31:00+00',
  'availability preserves arbitrary service durations in the returned end instant'
);

insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time, end_time)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '2026-08-19',
    'opening',
    '09:07',
    '10:07'
  ),
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '2026-08-19',
    'opening',
    '10:07',
    '11:00'
  );

select ok(
  exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-19',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time = '10:15'::time
  ),
  'adjacent openings merge so a service may cross their boundary'
);

select ok(
  not exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-19',
      '45000000-0000-0000-0000-000000000001'
    )
    where extract(minute from local_time) not in (0, 15, 30, 45)
  ),
  'candidate starts use a global 15-minute grid'
);

update public.barbers
set active = false, archived_at = now()
where id = '42000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  0,
  'inactive barbers have no availability'
);

update public.barbers
set active = true, archived_at = null
where id = '42000000-0000-0000-0000-000000000001';

update public.services
set active = false, archived_at = now()
where id = '44000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  0,
  'inactive services have no availability'
);

update public.services
set active = true, archived_at = null
where id = '44000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000002',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000003'
    )
  ),
  6,
  'another barber uses only that barber service and schedule'
);

update public.barbers
set buffer_minutes = 15
where id = '42000000-0000-0000-0000-000000000001';

insert into public.appointments (
  id,
  shop_id,
  barber_id,
  customer_id,
  barber_service_id,
  service_id,
  starts_at,
  ends_at,
  occupied_until,
  service_name_snapshot,
  service_duration_minutes_snapshot,
  service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
values (
  '46000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000001',
  '45000000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  '2026-08-17 13:00:00+00',
  '2026-08-17 13:30:00+00',
  '2026-08-17 13:45:00+00',
  'Task 5 Standard',
  30,
  5000,
  15
);

select ok(
  not exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time between '09:45'::time and '10:30'::time
  ),
  'a scheduled appointment and barber buffer occupy overlapping candidate starts'
);

select ok(
  not exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time = '09:30'::time
  ),
  'a candidate buffer cannot overlap an existing occupied range'
);

select ok(
  exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time = '10:45'::time
  ),
  'the slot at occupied_until remains available'
);

select ok(
  not exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time = '16:30'::time
  ),
  'a candidate whose buffer extends past the work period is unavailable'
);

select ok(
  exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time = '16:15'::time
  ),
  'a candidate whose buffer ends at the work-period boundary remains available'
);

select throws_ok(
  $$
    insert into public.appointments (
      id,
      shop_id, barber_id, customer_id, barber_service_id, service_id,
      starts_at, ends_at, occupied_until, service_name_snapshot,
      service_duration_minutes_snapshot, service_price_cents_snapshot,
      barber_buffer_minutes_snapshot
    ) values (
      '46000000-0000-0000-0000-000000000002',
      '41000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000001',
      '45000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000001',
      '2026-08-17 13:15:00+00', '2026-08-17 13:45:00+00', '2026-08-17 13:45:00+00',
      'Task 5 Standard', 30, 5000, 0
    )
  $$,
  '23P01',
  null,
  'active barber occupied ranges are protected by an exclusion constraint'
);

select lives_ok(
  $$
    insert into public.appointments (
      id,
      shop_id, barber_id, customer_id, barber_service_id, service_id,
      starts_at, ends_at, occupied_until, status, service_name_snapshot,
      service_duration_minutes_snapshot, service_price_cents_snapshot,
      barber_buffer_minutes_snapshot
    ) values (
      '46000000-0000-0000-0000-000000000003',
      '41000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000001',
      '45000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000001',
      '2026-08-17 13:15:00+00', '2026-08-17 13:45:00+00', '2026-08-17 13:45:00+00',
      'cancelled', 'Task 5 Standard', 30, 5000, 0
    )
  $$,
  'cancelled appointments do not participate in active occupancy'
);

select throws_ok(
  $$
    update public.appointments
    set service_id = '44000000-0000-0000-0000-000000000002'
    where id = '46000000-0000-0000-0000-000000000001'
  $$,
  '23503',
  null,
  'appointment barber-service identity cannot be inconsistent'
);

select throws_ok(
  $$
    update public.appointments
    set service_name_snapshot = 'Changed snapshot'
    where id = '46000000-0000-0000-0000-000000000001'
  $$,
  '22000',
  null,
  'appointment snapshots are immutable'
);

insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time, end_time)
values (
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '2026-08-17',
  'block',
  '14:00',
  '15:00'
);

select ok(
  not exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time > '13:30'::time
      and local_time <= '14:45'::time
  ),
  'a partial block removes every overlapping candidate'
);

select ok(
  exists(
    select 1
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000001'
    )
    where local_time = '15:00'::time
  ),
  'a candidate ending at a partial block boundary remains available'
);

insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time, end_time)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '2026-08-24',
    'block',
    null,
    null
  ),
  (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '2026-08-24',
    'opening',
    '15:00',
    '17:00'
  );

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-24',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  0,
  'an all-day block overrides every opening and removes every candidate'
);

insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time, end_time)
values (
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '2026-08-18',
  'opening',
  '16:00',
  '18:00'
);

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-18',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  6,
  'an extra opening creates candidates without a weekly workday'
);

select is(
  (
    select starts_at::text
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000002',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000003'
    )
    where local_time = '22:00'::time
  ),
  '2026-08-18 01:00:00+00',
  'Sao Paulo local dates convert across the UTC date boundary'
);

select is(
  (
    select ends_at::text
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000002',
      '2026-08-17',
      '45000000-0000-0000-0000-000000000003'
    )
    where local_time = '22:00'::time
  ),
  '2026-08-18 01:30:00+00',
  'availability returns the service end instant, not the occupied-until instant'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (
    select count(*)::int
    from public.get_available_slots(
      '42000000-0000-0000-0000-000000000001',
      '2026-08-18',
      '45000000-0000-0000-0000-000000000001'
    )
  ),
  6,
  'anonymous callers can use the output-only availability RPC'
);

select throws_ok(
  $$ select * from public.appointments $$,
  '42501',
  null,
  'anonymous callers cannot directly read appointments'
);

select throws_ok(
  $$ select * from public.working_periods $$,
  '42501',
  null,
  'anonymous callers cannot directly read schedules'
);

select * from finish();

rollback;
