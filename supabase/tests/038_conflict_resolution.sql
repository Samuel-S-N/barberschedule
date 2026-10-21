begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'conf-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'conf-barber@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'conf-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'conf-other@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'fb000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'fb000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id) values ('fb100000-0000-0000-0000-000000000001', 'Conflict Shop', 'fb000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email) values
  ('fb200000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000003', 'Plan Customer', 'conf-customer@shop.example'),
  ('fb200000-0000-0000-0000-000000000002', 'fb100000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000004', 'Other Customer', 'conf-other@shop.example');
insert into public.barbers (id, shop_id, name, user_id) values ('fb300000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'Conflict Barber', 'fb000000-0000-0000-0000-000000000002');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('fb400000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'Conflict Cut', 30, 3500);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('fb500000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001', 'fb400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'fb100000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

-- Mondays two and three weeks ahead, in the shop's timezone.
create temporary table conf_dates as select date_trunc('week', current_date + 14)::date as monday;
grant select on conf_dates to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'fb400000-0000-0000-0000-000000000001', 1, 2500, 'Corte mensal', true);

-- a customer subscribes and the barber accepts
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000003', true);
select count(*) from public.request_recurrence('fb500000-0000-0000-0000-000000000001', 1, (select monday from conf_dates), '10:00');
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000002', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('fb100000-0000-0000-0000-000000000001') limit 1), true);

-- the plan's date is no longer offered, and cannot be booked like any taken slot
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.get_available_slots('fb300000-0000-0000-0000-000000000001', (select monday from conf_dates), 'fb500000-0000-0000-0000-000000000001') where local_time = '10:00'), 0, 'the plan''s slot is not offered');
select is((select count(*)::int from public.get_available_slots('fb300000-0000-0000-0000-000000000001', (select monday from conf_dates), 'fb500000-0000-0000-0000-000000000001') where local_time = '10:30'), 1, 'other times that day stay free');
select throws_ok(
  $$ select * from public.book_appointment('fb500000-0000-0000-0000-000000000001', 'fb200000-0000-0000-0000-000000000002', ((select monday from conf_dates) + time '10:00') at time zone 'America/Sao_Paulo', 'customer') $$,
  'P0001', null, 'a normal booking of the plan''s slot is rejected'
);
select is((select count(*)::int from public.get_available_slots('fb300000-0000-0000-0000-000000000001', (select monday from conf_dates) + 1, 'fb500000-0000-0000-0000-000000000001') where local_time = '10:00'), 1, 'the day after is free');

-- a conflict (as the nightly job would record it: the date has no appointment) is listed with the ids needed to reschedule
reset role;
delete from public.appointments where recurrence_occurrence_date in ((select monday from conf_dates) + 7, (select monday from conf_dates) + 14);
insert into public.recurrence_conflicts (id, series_id, occurrence_date, reason)
select 'fb800000-0000-0000-0000-000000000001', id, (select monday from conf_dates) + 7, 'SLOT_UNAVAILABLE' from public.recurrence_series where customer_id = 'fb200000-0000-0000-0000-000000000001';
insert into public.recurrence_conflicts (id, series_id, occurrence_date, reason)
select 'fb800000-0000-0000-0000-000000000002', id, (select monday from conf_dates) + 14, 'SLOT_UNAVAILABLE' from public.recurrence_series where customer_id = 'fb200000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000001', true);
select is((select barber_service_id::text || '/' || barber_id::text from public.list_owner_recurrence_conflicts('fb100000-0000-0000-0000-000000000001') where id = 'fb800000-0000-0000-0000-000000000001'), 'fb500000-0000-0000-0000-000000000001/fb300000-0000-0000-0000-000000000001', 'the conflict list carries the barber and barber-service ids');

-- reschedule to another day: becomes the series' occurrence for the conflicted date, at the plan's price
select lives_ok(
  $$ select public.resolve_recurrence_conflict('fb800000-0000-0000-0000-000000000001', ((select monday from conf_dates) + 8 + time '11:00') at time zone 'America/Sao_Paulo') $$,
  'the owner reschedules a conflict'
);
reset role;
select is(
  (select source::text || '/' || service_price_cents_snapshot::text || '/' || (recurrence_occurrence_date = (select monday from conf_dates) + 7)::text from public.appointments where id = (select resolution_appointment_id from public.recurrence_conflicts where id = 'fb800000-0000-0000-0000-000000000001')),
  'recurrence/2500/true',
  'the replacement is the occurrence for the conflicted date at the plan price'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.resolve_recurrence_conflict('fb800000-0000-0000-0000-000000000001') $$, 'P0035', null, 'a resolved conflict cannot be resolved again');
select lives_ok($$ select public.resolve_recurrence_conflict('fb800000-0000-0000-0000-000000000002') $$, 'the owner dismisses a conflict');
reset role;
select ok((select status = 'resolved' and resolution_appointment_id is null from public.recurrence_conflicts where id = 'fb800000-0000-0000-0000-000000000002'), 'a dismissed conflict is resolved without an appointment');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.resolve_recurrence_conflict('fb800000-0000-0000-0000-000000000002') $$, 'P0010', null, 'a customer cannot resolve conflicts');

select * from finish();

rollback;
