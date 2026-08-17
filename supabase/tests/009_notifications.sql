begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'task10-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'task10-customer@example.com', 'password-hash', now());

update public.profiles set role = 'owner'
where user_id = '90000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('91000000-0000-0000-0000-000000000001', 'Task 10 Shop', '90000000-0000-0000-0000-000000000001');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('91100000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'Task 10 Customer', 'task10-customer@shop.example');

insert into public.notification_tokens (user_id, expo_push_token, platform)
values ('90000000-0000-0000-0000-000000000002', 'ExponentPushToken[old]', 'android');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.register_notification_token('ExponentPushToken[new]', 'ios')),
  1,
  'authenticated users can register a notification token'
);

reset role;

select is(
  (select count(*)::int from public.notification_tokens where user_id = '90000000-0000-0000-0000-000000000002' and active),
  2,
  'token registration preserves active tokens on multiple devices'
);

select ok(
  exists (select 1 from public.notification_tokens where expo_push_token = 'ExponentPushToken[new]' and platform = 'ios'),
  'token registration stores the platform'
);

select throws_ok(
  $$ select * from public.register_notification_token('', 'ios') $$,
  'P0016', null,
  'blank push tokens are rejected'
);

select lives_ok(
  $$ insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload) values ('manual-event', 'appointment.booked', '90000000-0000-0000-0000-000000000002', '{}'::jsonb) $$,
  'the outbox accepts an event'
);

select throws_ok(
  $$ insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload) values ('manual-event', 'appointment.booked', '90000000-0000-0000-0000-000000000002', '{}'::jsonb) $$,
  '23505', null,
  'event keys are idempotent'
);

select ok(
  has_table_privilege('anon', 'public.notification_outbox', 'select') = false,
  'anonymous clients cannot read the outbox'
);

select ok(
  has_function_privilege('authenticated', 'public.register_notification_token(text,text)', 'execute'),
  'authenticated clients can execute token registration'
);

select ok(
  has_function_privilege('authenticated', 'public.claim_notification_batch(integer)', 'execute') = false,
  'authenticated clients cannot claim notifications'
);

select ok(
  has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'execute'),
  'the service role can claim notifications'
);

select * into temporary task10_appointment
from public.appointments
where false;

-- The schema contract also requires appointment/conflict triggers; later assertions
-- use direct inserts once the migration exists.
select ok(to_regclass('public.notification_tokens') is not null, 'notification token table exists');
select ok(to_regclass('public.notification_outbox') is not null, 'notification outbox table exists');
select ok(to_regprocedure('public.enqueue_notification_reminders()') is not null, 'reminder job function exists');
select ok(to_regprocedure('public.materialize_recurrence_job()') is not null, 'recurrence job function exists');
select ok(to_regprocedure('public.mark_notification_failed(uuid,text)') is not null, 'failure transition function exists');
select ok(to_regprocedure('public.mark_notification_sent(uuid)') is not null, 'success transition function exists');

insert into public.barbers (id, shop_id, name)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Task 10 Barber');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Task 10 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('94000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001');

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
) values (
  '95000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001', '91100000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001',
  clock_timestamp() + interval '24 hours', clock_timestamp() + interval '24 hours 30 minutes',
  clock_timestamp() + interval '24 hours 30 minutes', 'Task 10 Cut', 30, 4000, 0
);
set constraints all immediate;

select is(
  (select count(*)::int from public.notification_outbox where event_key = 'appointment:95000000-0000-0000-0000-000000000001:booked'),
  1,
  'booking inserts one transactional notification event'
);

update public.appointments
set starts_at = clock_timestamp() + interval '25 hours',
    ends_at = clock_timestamp() + interval '25 hours 30 minutes',
    occupied_until = clock_timestamp() + interval '25 hours 30 minutes',
    updated_at = clock_timestamp()
where id = '95000000-0000-0000-0000-000000000001';
set constraints all immediate;

select is(
  (select count(*)::int from public.notification_outbox where appointment_id = '95000000-0000-0000-0000-000000000001' and event_type = 'appointment.cancelled'),
  0,
  'rescheduling does not emit a false cancellation event'
);

select is(
  (select count(*)::int from public.notification_outbox where appointment_id = '95000000-0000-0000-0000-000000000001' and event_type = 'appointment.rescheduled'),
  1,
  'rescheduling emits one event'
);

update public.appointments
set status = 'cancelled', updated_at = clock_timestamp()
where id = '95000000-0000-0000-0000-000000000001';
set constraints all immediate;

select is(
  (select count(*)::int from public.notification_outbox where appointment_id = '95000000-0000-0000-0000-000000000001' and event_type = 'appointment.cancelled'),
  1,
  'cancellation emits one event'
);

select is(public.enqueue_notification_reminders(), 0, 'cancelled appointments do not create reminders');

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot,
  barber_buffer_minutes_snapshot
) values (
  '95000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001', '91100000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001',
  clock_timestamp() + interval '24 hours', clock_timestamp() + interval '24 hours 30 minutes',
  clock_timestamp() + interval '24 hours 30 minutes', 'Task 10 Cut', 30, 4000, 0
);
set constraints all immediate;

select is(public.enqueue_notification_reminders(), 1, 'the reminder job inserts a 24-hour event');
select is(public.enqueue_notification_reminders(), 0, 'the reminder job is idempotent');

insert into public.recurrence_series (
  id, shop_id, customer_id, barber_service_id, local_start_date, local_start_time, interval_weeks
) values (
  '96000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001',
  '91100000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001',
  current_date + 1, '09:00', 1
);

insert into public.recurrence_conflicts (id, series_id, occurrence_date, reason)
values ('97000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', current_date + 1, 'SLOT_UNAVAILABLE');
set constraints all immediate;

select is(
  (select count(*)::int from public.notification_outbox where recurrence_conflict_id = '97000000-0000-0000-0000-000000000001'),
  1,
  'recurrence conflicts notify the shop owner'
);

select is(
  (select status::text from public.notification_outbox where recurrence_conflict_id = '97000000-0000-0000-0000-000000000001'),
  'pending',
  'new notifications start pending'
);

select ok(
  exists (
    select 1
    from public.claim_notification_batch(100)
    where id = (select id from public.notification_outbox where event_key = 'manual-event')
      and expo_push_token in ('ExponentPushToken[old]', 'ExponentPushToken[new]')
  ),
  'claiming joins an active device token'
);

select is(
  (select status::text from public.notification_outbox where event_key = 'manual-event'),
  'sending',
  'claiming marks an event as sending'
);

select lives_ok(
  $$ select public.mark_notification_failed((select id from public.notification_outbox where event_key = 'manual-event'), 'temporary provider failure') $$,
  'failed delivery is recorded for retry'
);

update public.notification_outbox
set available_at = clock_timestamp()
where event_key = 'manual-event';

select is(
  (select attempts from public.claim_notification_batch(100) where id = (select id from public.notification_outbox where event_key = 'manual-event') limit 1),
  2,
  'failed events can be claimed again'
);

select public.mark_notification_sent((select id from public.notification_outbox where event_key = 'manual-event'));

select is(
  (select status::text from public.notification_outbox where event_key = 'manual-event'),
  'sent',
  'successful delivery closes the outbox event'
);

update public.notification_tokens
set active = false
where user_id = '90000000-0000-0000-0000-000000000002';

insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
values ('inactive-event', 'appointment.booked', '90000000-0000-0000-0000-000000000002', '{}'::jsonb);

select is(
  (select expo_push_token from public.claim_notification_batch(100) where id = (select id from public.notification_outbox where event_key = 'inactive-event') limit 1),
  null,
  'inactive tokens are not selected for delivery'
);

select public.mark_notification_sent((select id from public.notification_outbox where event_key = 'inactive-event'));

select is(
  (select shops_processed from public.materialize_recurrence_job()),
  (select count(*)::int from public.shops),
  'the recurrence job processes each shop once'
);

select * from finish();
rollback;
