begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't25-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't25-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't25-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't25-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'b0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('b1000000-0000-0000-0000-000000000001', 'T25 Shop', 'b0000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Barber A'),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'T25 Customer', 't25-customer@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'T25 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('b5000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', weekday, '00:00', '23:59'
from generate_series(1, 7) as weekday;

-- Two appointments for Barber A's customer: one in 30 minutes (inside the customer lock), one in 5 hours.
insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values
  ('b6000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001',
   'b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', now() + interval '30 minutes', now() + interval '60 minutes', now() + interval '60 minutes', 'scheduled', 'T25 Cut', 30, 4000, 0),
  ('b6000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001',
   'b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', now() + interval '5 hours', now() + interval '5 hours 30 minutes', now() + interval '5 hours 30 minutes', 'scheduled', 'T25 Cut', 30, 4000, 0);

select set_config('t25.move_to', (date_trunc('hour', clock_timestamp()) + interval '8 hours')::text, false);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select * from public.cancel_appointment('b6000000-0000-0000-0000-000000000001') $$, 'P0010', null, 'another barber cannot cancel it');
select throws_ok($$ select * from public.reschedule_appointment('b6000000-0000-0000-0000-000000000002', current_setting('t25.move_to')::timestamptz) $$, 'P0010', null, 'another barber cannot move it');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select * from public.cancel_appointment('b6000000-0000-0000-0000-000000000001') $$, 'P0011', null, 'the customer is still locked inside 90 minutes');

select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);
select is(
  (select status::text from public.cancel_appointment('b6000000-0000-0000-0000-000000000001')),
  'cancelled', 'the own barber cancels inside the 90-minute window'
);
select is(
  (select starts_at from public.reschedule_appointment('b6000000-0000-0000-0000-000000000002', current_setting('t25.move_to')::timestamptz)),
  current_setting('t25.move_to')::timestamptz, 'the own barber moves an appointment'
);
select throws_ok($$ select * from public.cancel_appointment('b6000000-0000-0000-0000-000000000001') $$, 'P0012', null, 'a cancelled appointment cannot be cancelled again');

reset role;
select is((select status::text from public.appointments where id = 'b6000000-0000-0000-0000-000000000002'), 'scheduled', 'the moved appointment stays scheduled');

select * from finish();
rollback;
