begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select set_config(
  'task6.local_date',
  (date_trunc('week', (clock_timestamp() at time zone 'America/Sao_Paulo'))::date + 7)::text,
  false
);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'task6-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'task6-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'task6-other@example.com', 'password-hash', now());

update public.profiles
set role = 'owner'
where user_id = '50000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('51000000-0000-0000-0000-000000000001', 'Task 6 Shop', '50000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, name, buffer_minutes)
values ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Task 6 Barber', 10);

insert into public.customers (id, shop_id, user_id, full_name, email)
values
  ('53000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'Task 6 Customer', 'task6-customer@example.com'),
  ('53000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', null, 'Task 6 Walk In', 'task6-walkin@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('54000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Task 6 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('55000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
values ('51000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 1, '09:00', '18:00');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000001',
      (current_setting('task6.local_date') || ' 12:00:00+00')::timestamptz,
      'customer',
      'First visit'
    )
  $$,
  'authenticated customer can book an available slot'
);

reset role;
select is(
  (select count(*)::int from public.appointments where customer_id = '53000000-0000-0000-0000-000000000001'),
  1,
  'valid booking creates one appointment'
);

select is(
  (select source::text from public.appointments where customer_id = '53000000-0000-0000-0000-000000000001' limit 1),
  'customer',
  'customer booking records its source'
);

select is(
  (select occupied_until - ends_at from public.appointments where customer_id = '53000000-0000-0000-0000-000000000001' limit 1),
  interval '10 minutes',
  'booking snapshots the barber buffer in occupied_until'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000001',
      (current_setting('task6.local_date') || ' 13:00:00+00')::timestamptz,
      'customer',
      null
    )
  $$,
  'P0002', null,
  'customer cannot create a second appointment on the shop-local day'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000001',
      (current_setting('task6.local_date') || ' 12:15:00+00')::timestamptz,
      'owner',
      null
    )
  $$,
  'P0001', null,
  'occupied service and buffer reject a competing slot'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000002',
      (current_setting('task6.local_date') || ' 13:00:00+00')::timestamptz,
      'customer',
      null
    )
  $$,
  'P0008', null,
  'a customer cannot book for another customer'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000001',
      (current_setting('task6.local_date') || ' 13:00:00+00')::timestamptz,
      'owner',
      'Owner override'
    )
  $$,
  'owner may create a second appointment on the same local day'
);

reset role;
select is(
  (select count(*)::int from public.appointments where customer_id = '53000000-0000-0000-0000-000000000001'),
  2,
  'owner override persists the second appointment'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000002',
      (current_setting('task6.local_date') || ' 13:15:00+00')::timestamptz,
      'owner',
      null
    )
  $$,
  'P0001', null,
  'owner cannot bypass a barber occupancy conflict'
);

select throws_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000002',
      (current_setting('task6.local_date') || ' 20:45:00+00')::timestamptz,
      'owner',
      null
    )
  $$,
  'P0001', null,
  'a service crossing the workday end is rejected'
);

insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time, end_time)
values ('51000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', current_setting('task6.local_date')::date, 'block', '15:00', '16:00');

select throws_ok(
  $$
    select * from public.book_appointment(
      '55000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000002',
      (current_setting('task6.local_date') || ' 18:15:00+00')::timestamptz,
      'owner',
      null
    )
  $$,
  'P0001', null,
  'a service crossing a block is rejected'
);

update public.services set active = false, archived_at = now()
where id = '54000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select * from public.book_appointment('55000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002', '2026-08-18 12:00:00+00', 'owner', null) $$,
  'P0004', null,
  'inactive service is rejected'
);

update public.services set active = true, archived_at = null
where id = '54000000-0000-0000-0000-000000000001';
update public.barbers set active = false, archived_at = now()
where id = '52000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ select * from public.book_appointment('55000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002', '2026-08-18 12:00:00+00', 'owner', null) $$,
  'P0005', null,
  'inactive barber is rejected'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select * from public.book_appointment('55000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002', '2026-08-18 12:00:00+00', 'customer', null) $$,
  '42501', null,
  'anonymous callers cannot execute booking'
);

reset role;
select * from finish();
rollback;
