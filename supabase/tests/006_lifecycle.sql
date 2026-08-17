begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'task7-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'task7-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'task7-other@example.com', 'password-hash', now());

update public.profiles
set role = 'owner'
where user_id = '60000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('61000000-0000-0000-0000-000000000001', 'Task 7 Shop', '60000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, name, buffer_minutes)
values ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Task 7 Barber', 10);

insert into public.customers (id, shop_id, user_id, full_name, email)
values
  ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Task 7 Customer', 'task7-customer@example.com'),
  ('63000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'Task 7 Other Customer', 'task7-other@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('64000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Task 7 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('65000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001');

create temp table lifecycle_times on commit drop as
select
  date_trunc('hour', clock_timestamp()) + interval '4 hours' as future_start,
  clock_timestamp() + interval '89 minutes' as late_start,
  clock_timestamp() + interval '30 minutes' as owner_start;

select set_config(
  'task7.valid_target',
  (select (future_start + interval '50 hours')::text from lifecycle_times),
  false
);
select set_config(
  'task7.occupied_target',
  (select (future_start + interval '5 hours')::text from lifecycle_times),
  false
);

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select '61000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', weekday, '00:00', '23:59'
from generate_series(1, 7) as weekday;

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  future_start, future_start + interval '30 minutes', future_start + interval '40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.appointments),
  1,
  'Customer A can select their own appointment'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.appointments),
  0,
  'Customer B cannot select Customer A appointments'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.appointments),
  0,
  'owners have no broad appointment read policy before Task 8 agenda work'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select * from public.appointments $$,
  '42501', null,
  'anonymous callers cannot read appointments'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.cancel_appointment('66000000-0000-0000-0000-000000000001') $$,
  'a customer may cancel their own appointment more than 90 minutes before start'
);

reset role;
select is(
  (select status::text from public.appointments where id = '66000000-0000-0000-0000-000000000001'),
  'cancelled',
  'cancellation persists on the existing appointment row'
);

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  late_start, late_start + interval '30 minutes', late_start + interval '40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.cancel_appointment('66000000-0000-0000-0000-000000000002') $$,
  'P0011', null,
  'a customer cannot cancel less than 90 minutes before start'
);

reset role;
insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  owner_start, owner_start + interval '30 minutes', owner_start + interval '40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.cancel_appointment('66000000-0000-0000-0000-000000000003') $$,
  'the owner may override the 90-minute cancellation cutoff'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.cancel_appointment('66000000-0000-0000-0000-000000000002') $$,
  'P0010', null,
  'another customer cannot cancel an appointment they do not own'
);

reset role;
update public.appointments
set status = 'cancelled'
where id = '66000000-0000-0000-0000-000000000002';

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  future_start + interval '1 hour', future_start + interval '1 hour 30 minutes', future_start + interval '1 hour 40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.reschedule_appointment('66000000-0000-0000-0000-000000000004', current_setting('task7.valid_target')::timestamptz) $$,
  'a customer may reschedule their own available appointment'
);

reset role;
select is(
  (select starts_at from public.appointments where id = '66000000-0000-0000-0000-000000000004'),
  current_setting('task7.valid_target')::timestamptz,
  'a valid reschedule updates the existing row start'
);

select is(
  (select count(*)::int from public.appointments where id = '66000000-0000-0000-0000-000000000004'),
  1,
  'rescheduling preserves the appointment identity'
);

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000005', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  future_start + interval '4 hours', future_start + interval '4 hours 30 minutes', future_start + interval '4 hours 40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000006', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  future_start + interval '5 hours', future_start + interval '5 hours 30 minutes', future_start + interval '5 hours 40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.reschedule_appointment('66000000-0000-0000-0000-000000000005', current_setting('task7.occupied_target')::timestamptz) $$,
  'P0001', null,
  'an occupied reschedule target is rejected'
);

reset role;
select is(
  (select starts_at from public.appointments where id = '66000000-0000-0000-0000-000000000005'),
  (select future_start + interval '4 hours' from lifecycle_times),
  'a failed reschedule leaves the original appointment intact'
);

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000007', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  future_start + interval '7 hours', future_start + interval '7 hours 30 minutes', future_start + interval '7 hours 40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
)
select
  '66000000-0000-0000-0000-000000000008', '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002',
  '65000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  future_start + interval '8 hours', future_start + interval '8 hours 30 minutes', future_start + interval '8 hours 40 minutes',
  'Task 7 Cut', 30, 4000, 10
from lifecycle_times;

select set_config(
  'task7.shared_target',
  (select (future_start + interval '9 hours')::text from lifecycle_times),
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.reschedule_appointment('66000000-0000-0000-0000-000000000007', current_setting('task7.shared_target')::timestamptz) $$,
  'the first reschedule may claim the shared target'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.reschedule_appointment('66000000-0000-0000-0000-000000000008', current_setting('task7.shared_target')::timestamptz) $$,
  'P0001', null,
  'a second reschedule cannot claim the same target after exclusion occupancy'
);

reset role;
select is(
  (select starts_at from public.appointments where id = '66000000-0000-0000-0000-000000000008'),
  (select future_start + interval '8 hours' from lifecycle_times),
  'the rejected second reschedule preserves its original appointment'
);

select * from finish();

rollback;
