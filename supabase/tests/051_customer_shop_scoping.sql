begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't51-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't51-customer@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't51-pro@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't51-owner2@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fb000000-0000-0000-0000-000000000004';
update public.profiles set role = 'owner' where user_id = 'fb000000-0000-0000-0000-000000000001';
update public.profiles set role = 'professional' where user_id = 'fb000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id)
values ('fb100000-0000-0000-0000-000000000001', 'T51 Shop', 'fb000000-0000-0000-0000-000000000001');
insert into public.shops (id, name, owner_user_id)
values ('fb100000-0000-0000-0000-000000000002', 'T51 Shop B', 'fb000000-0000-0000-0000-000000000004');
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('fb110000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000002', 'T51 Customer', 't51-customer@shop.example');
insert into public.professionals (id, shop_id, name, user_id)
values ('fb200000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'T51 Pro', 'fb000000-0000-0000-0000-000000000003');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('fb300000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'T51 Cut', 30, 4000);
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('fb400000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'fb200000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001');

-- A scheduled appointment (no JWT, so nobody is the actor): the booking trigger writes the staff inbox rows.
insert into public.appointments (
  id, shop_id, professional_id, customer_id, professional_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot, professional_buffer_minutes_snapshot
) values (
  'fb500000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001',
  'fb200000-0000-0000-0000-000000000001', 'fb110000-0000-0000-0000-000000000001',
  'fb400000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001',
  clock_timestamp() + interval '24 hours', clock_timestamp() + interval '24 hours 30 minutes',
  clock_timestamp() + interval '24 hours 30 minutes', 'T51 Cut', 30, 4000, 0
);

select is(
  (select count(*)::int from public.notifications where appointment_id = 'fb500000-0000-0000-0000-000000000001' and shop_id = 'fb100000-0000-0000-0000-000000000001'),
  2, 'booking notifications get the appointment''s shop'
);

insert into public.notifications (user_id, kind, params, event_key)
values
  ('fb000000-0000-0000-0000-000000000001', 'payout_due', '{}', 't51-owner'),
  ('fb000000-0000-0000-0000-000000000003', 'payout_paid', '{}', 't51-pro'),
  ('fb000000-0000-0000-0000-000000000002', 'recurrence_accepted', '{}', 't51-customer');

select is((select shop_id from public.notifications where event_key = 't51-owner'), 'fb100000-0000-0000-0000-000000000001'::uuid, 'an owner notification gets their shop');
select is((select shop_id from public.notifications where event_key = 't51-pro'), 'fb100000-0000-0000-0000-000000000001'::uuid, 'a professional notification gets their shop');
select is((select shop_id from public.notifications where event_key = 't51-customer'), null::uuid, 'a customer notification with no appointment stays unscoped');

-- list_my_recurrence_requests filter: one request in shop A is listed for A (and unfiltered), never for B
insert into public.recurrence_requests (shop_id, customer_id, professional_id, professional_service_id, interval_weeks, local_start_date, local_start_time)
values ('fb100000-0000-0000-0000-000000000001', 'fb110000-0000-0000-0000-000000000001', 'fb200000-0000-0000-0000-000000000001', 'fb400000-0000-0000-0000-000000000001', 2, current_date + 7, '10:00');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.list_my_recurrence_requests()), 1, 'no argument lists every shop''s requests');
select is((select count(*)::int from public.list_my_recurrence_requests('fb100000-0000-0000-0000-000000000001')), 1, 'shop A lists its request');
select is((select count(*)::int from public.list_my_recurrence_requests('fb100000-0000-0000-0000-000000000002')), 0, 'shop B does not');
reset role;

-- count / mark read / delete are scoped to one shop (plus the unscoped rows) when a shop is given
insert into public.notifications (user_id, kind, params, event_key, shop_id)
values
  ('fb000000-0000-0000-0000-000000000002', 'appointment_booked', '{}', 't51-a', 'fb100000-0000-0000-0000-000000000001'),
  ('fb000000-0000-0000-0000-000000000002', 'appointment_booked', '{}', 't51-b', 'fb100000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.count_unread_notifications('fb100000-0000-0000-0000-000000000001'), 2, 'the unread count of shop A: its row plus the unscoped one');
select is(public.mark_notifications_read(null, 'fb100000-0000-0000-0000-000000000001'), 2, 'mark all read in shop A leaves shop B alone');
select is(public.count_unread_notifications(), 1, 'without a shop the count still covers everything (shop B is still unread)');
select is(public.delete_notifications(null, 'fb100000-0000-0000-0000-000000000001'), 2, 'clear all in shop A keeps shop B''s notification');
reset role;

select * from finish();
rollback;
