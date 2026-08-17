begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'task8-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'task8-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'task8-other-owner@example.com', 'password-hash', now());

update public.profiles set role = 'owner'
where user_id in ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values
  ('71000000-0000-0000-0000-000000000001', 'Task 8 Shop', '70000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-000000000002', 'Other Shop', '70000000-0000-0000-0000-000000000003');

insert into public.barbers (id, shop_id, name)
values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Task 8 Barber'),
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', 'Other Barber');

insert into public.customers (id, shop_id, user_id, full_name, email)
values
  ('73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'Task 8 Customer', 'task8-customer@example.com'),
  ('73000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', null, 'Other Customer', 'other@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values
  ('74000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Task 8 Cut', 30, 4000),
  ('74000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', 'Other Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('75000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001'),
  ('75000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000002');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select '71000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', weekday, '00:00', '23:59'
from generate_series(1, 7) as weekday;

select set_config(
  'task8.first_start',
  (date_trunc('hour', clock_timestamp()) + interval '4 hours')::text,
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.book_appointment('75000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', current_setting('task8.first_start')::timestamptz, 'owner', 'First') $$,
  'owner can create a first manual appointment'
);

select lives_ok(
  $$ select * from public.book_appointment('75000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', current_setting('task8.first_start')::timestamptz + interval '1 hour', 'owner', 'Second') $$,
  'owner can create a second appointment on the same shop-local day'
);

insert into public.schedule_overrides (shop_id, barber_id, local_date, kind)
values (
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date,
  'block'
);

reset role;
select set_config('task8.first_appointment', (select id::text from public.appointments where notes = 'First'), false);
select set_config('task8.second_appointment', (select id::text from public.appointments where notes = 'Second'), false);
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.book_appointment('75000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', current_setting('task8.first_start')::timestamptz + interval '2 hours', 'owner', null) $$,
  'P0008', null,
  'a customer cannot claim owner booking mode'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.list_owner_agenda('71000000-0000-0000-0000-000000000001', (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, 1, 0)),
  1,
  'owner agenda paginates the requested local date range'
);

select is(
  (select count(*)::int from public.list_owner_agenda('71000000-0000-0000-0000-000000000001', (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, 1, 1)),
  1,
  'owner agenda offset returns the second appointment'
);

select throws_ok(
  $$ select * from public.list_owner_agenda('71000000-0000-0000-0000-000000000002', current_date, current_date, 25, 0) $$,
  'P0010', null,
  'owner agenda does not expose another shop'
);

select is(
  (select count(*)::int from public.list_owner_agenda_overrides('71000000-0000-0000-0000-000000000001', (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date)),
  1,
  'owner agenda includes date-range schedule blocks'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.list_owner_agenda('71000000-0000-0000-0000-000000000001', current_date, current_date, 25, 0) $$,
  'P0010', null,
  'customer cannot read the owner agenda'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.set_owner_appointment_status(current_setting('task8.first_appointment')::uuid, 'completed') $$,
  'owner can complete a scheduled appointment'
);

select is(
  (select status::text from public.list_owner_agenda('71000000-0000-0000-0000-000000000001', (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, 25, 0) where id = current_setting('task8.first_appointment')::uuid),
  'completed',
  'completed status persists'
);

select lives_ok(
  $$ select * from public.set_owner_appointment_status(current_setting('task8.second_appointment')::uuid, 'no_show') $$,
  'owner can mark a scheduled appointment as no-show'
);

select is(
  (select status::text from public.list_owner_agenda('71000000-0000-0000-0000-000000000001', (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, (current_setting('task8.first_start')::timestamptz at time zone 'America/Sao_Paulo')::date, 25, 0) where id = current_setting('task8.second_appointment')::uuid),
  'no_show',
  'no-show status persists'
);

select throws_ok(
  $$ select * from public.set_owner_appointment_status(current_setting('task8.first_appointment')::uuid, 'no_show') $$,
  'P0013', null,
  'terminal administrative statuses cannot be changed again'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.set_owner_appointment_status(current_setting('task8.second_appointment')::uuid, 'completed') $$,
  'P0010', null,
  'customer cannot change an administrative appointment status'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select * from public.list_owner_agenda('71000000-0000-0000-0000-000000000001', current_date, current_date, 25, 0) $$,
  '42501', null,
  'anonymous callers cannot execute the owner agenda'
);

reset role;
select * from finish();
rollback;
