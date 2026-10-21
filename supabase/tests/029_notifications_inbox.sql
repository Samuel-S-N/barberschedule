begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'inbox-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'inbox-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'inbox-barber@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'e0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'e0000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id)
values ('e1000000-0000-0000-0000-000000000001', 'Inbox Shop', 'e0000000-0000-0000-0000-000000000001');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('e1100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'Inbox Customer', 'inbox-customer@shop.example');

insert into public.barbers (id, shop_id, name, user_id)
values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Inbox Barber', 'e0000000-0000-0000-0000-000000000003');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Inbox Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('e4000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001');

-- A scheduled appointment (inserted without a JWT, so nobody is the actor).
insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values (
  'e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
  clock_timestamp() + interval '24 hours', clock_timestamp() + interval '24 hours 30 minutes',
  clock_timestamp() + interval '24 hours 30 minutes', 'Inbox Cut', 30, 4000, 0
);

select is((select count(*)::int from public.notifications where user_id = 'e0000000-0000-0000-0000-000000000003' and kind = 'appointment_awaiting_confirmation'), 1, 'barber is told about a new scheduled appointment');
select is((select count(*)::int from public.notifications where user_id = 'e0000000-0000-0000-0000-000000000001' and kind = 'appointment_awaiting_confirmation'), 1, 'owner is told too');
select is((select count(*)::int from public.notifications where user_id = 'e0000000-0000-0000-0000-000000000002'), 0, 'customer gets nothing for a booking');
select is((select count(*)::int from public.notification_outbox where appointment_id = 'e5000000-0000-0000-0000-000000000001' and event_type = 'staff.awaiting_confirmation'), 2, 'barber and owner get a push for the new appointment');

update public.appointments set status = 'confirmed' where id = 'e5000000-0000-0000-0000-000000000001';

select is((select count(*)::int from public.notifications where user_id = 'e0000000-0000-0000-0000-000000000002' and kind = 'appointment_confirmed'), 1, 'customer is told about confirmation');
select is((select count(*)::int from public.notification_outbox where event_type = 'appointment.confirmed' and recipient_user_id = 'e0000000-0000-0000-0000-000000000002'), 1, 'customer gets a confirmation push');

update public.appointments set status = 'cancelled' where id = 'e5000000-0000-0000-0000-000000000001';

-- The existing push trigger is a deferred constraint trigger.
set constraints all immediate;

select is((select count(*)::int from public.notifications where kind = 'appointment_cancelled'), 3, 'customer, barber and owner are told about cancellation');
select is((select count(*)::int from public.notification_outbox where appointment_id = 'e5000000-0000-0000-0000-000000000001' and event_type = 'staff.cancelled'), 2, 'barber and owner get a cancellation push');
select is((select count(*)::int from public.notification_outbox where event_type = 'appointment.cancelled' and recipient_user_id = 'e0000000-0000-0000-0000-000000000002'), 1, 'the customer cancellation push comes only from the existing trigger');

-- Recurrence-generated appointments stay silent.
insert into public.recurrence_series (id, shop_id, customer_id, barber_service_id, local_start_date, local_start_time, interval_weeks)
values ('e6000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', current_date + 7, '10:00', 1);

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot,
  source, recurrence_series_id, recurrence_occurrence_date
) values (
  'e5000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001', 'e1100000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
  clock_timestamp() + interval '8 days', clock_timestamp() + interval '8 days 30 minutes',
  clock_timestamp() + interval '8 days 30 minutes', 'Inbox Cut', 30, 4000, 0,
  'recurrence', 'e6000000-0000-0000-0000-000000000001', current_date + 8
);

select is((select count(*)::int from public.notifications where appointment_id = 'e5000000-0000-0000-0000-000000000002'), 0, 'recurrence appointments do not notify');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::int from public.notifications), 2, 'RLS: the customer sees only their own rows');
select is(public.count_unread_notifications(), 2, 'unread count');
select is(public.mark_notifications_read(null), 2, 'mark all as read');

select * from finish();

rollback;
