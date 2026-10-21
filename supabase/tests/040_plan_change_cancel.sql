begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chg-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'chg-barber@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'chg-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'chg-other@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'f7000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'f7000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id) values ('f7100000-0000-0000-0000-000000000001', 'Change Shop', 'f7000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email) values
  ('f7200000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000003', 'Change Customer', 'chg-customer@shop.example'),
  ('f7200000-0000-0000-0000-000000000002', 'f7100000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000004', 'Other Customer', 'chg-other@shop.example');
insert into public.barbers (id, shop_id, name, user_id) values ('f7300000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 'Change Barber', 'f7000000-0000-0000-0000-000000000002');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('f7400000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 'Change Cut', 30, 3500);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('f7500000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 'f7300000-0000-0000-0000-000000000001', 'f7400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'f7100000-0000-0000-0000-000000000001', 'f7300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

create temporary table chg_dates as select date_trunc('week', current_date + 14)::date as monday;
create temporary table chg_ids (name text primary key, id uuid);
grant select on chg_dates, chg_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'f7400000-0000-0000-0000-000000000001', 1, 2500, 'Corte mensal', true);
select public.save_recurrence_plan(null, 'f7400000-0000-0000-0000-000000000001', 2, 3000, 'Quinzenal', true);

-- customer A subscribes weekly; the barber accepts: series S1
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000003', true);
select count(*) from public.request_recurrence('f7500000-0000-0000-0000-000000000001', 1, (select monday from chg_dates), '10:00');
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000002', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('f7100000-0000-0000-0000-000000000001') limit 1), true);
reset role;
insert into chg_ids select 's1', id from public.recurrence_series where customer_id = 'f7200000-0000-0000-0000-000000000001';

-- 1-2. A asks to change to the biweekly plan on Tuesdays: S1 keeps running until the answer
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$ select * from public.request_recurrence('f7500000-0000-0000-0000-000000000001', 2, (select monday from chg_dates) + 1, '11:00', (select id from chg_ids where name = 's1'), null) $$,
  'a customer can request a change that replaces the running series'
);
reset role;
select ok((select active from public.recurrence_series where id = (select id from chg_ids where name = 's1')), 'the current series keeps running until the change is answered');

-- 3-4. the barber accepts the change: S1 ends, the new series starts
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000002', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('f7100000-0000-0000-0000-000000000001') limit 1), true);
reset role;
select is(
  (select (not active)::text || '/' || (ended_at is not null)::text || '/' ||
          (select count(*)::text from public.appointments where recurrence_series_id = s.id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed'))
   from public.recurrence_series s where s.id = (select id from chg_ids where name = 's1')),
  'true/true/0',
  'accepting the change ends the old series and cancels its future appointments'
);
insert into chg_ids select 's2', id from public.recurrence_series where customer_id = 'f7200000-0000-0000-0000-000000000001' and active;
select is((select interval_weeks::int from public.recurrence_series where id = (select id from chg_ids where name = 's2')), 2, 'the new series is the biweekly one');

-- 5-6. replacing a pending request is atomic; replacing someone else's series is invalid
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000003', true);
select count(*) from public.request_recurrence('f7500000-0000-0000-0000-000000000001', 1, (select monday from chg_dates) + 2, '14:00');
reset role;
insert into chg_ids select 'r3', id from public.recurrence_requests where customer_id = 'f7200000-0000-0000-0000-000000000001' and status = 'pending';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000003', true);
select count(*) from public.request_recurrence('f7500000-0000-0000-0000-000000000001', 1, (select monday from chg_dates) + 2, '15:00', null, (select id from chg_ids where name = 'r3'));
reset role;
select is(
  (select (select status::text from public.recurrence_requests where id = (select id from chg_ids where name = 'r3')) || '/' ||
          (select count(*)::text from public.recurrence_requests where customer_id = 'f7200000-0000-0000-0000-000000000001' and status = 'pending')),
  'cancelled/1',
  'the replaced pending request is cancelled and exactly one stays pending'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select * from public.request_recurrence('f7500000-0000-0000-0000-000000000001', 1, (select monday from chg_dates) + 3, '10:00', (select id from chg_ids where name = 's2'), null) $$,
  'P0015', null, 'a customer cannot replace another customer''s series'
);

-- 7-9. cancellation request
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000003', true);
select lives_ok($$ select public.request_series_cancellation((select id from chg_ids where name = 's2')) $$, 'the customer requests the cancellation of the active plan');
select throws_ok($$ select public.request_series_cancellation((select id from chg_ids where name = 's2')) $$, 'P0037', null, 'it cannot be requested twice');
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select public.request_series_cancellation((select id from chg_ids where name = 's2')) $$, 'P0037', null, 'nor by someone else');

-- 10-11. staff see it; the customer does not
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.list_recurrence_cancellations('f7100000-0000-0000-0000-000000000001')), 1, 'the owner sees the cancellation request');
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.list_recurrence_cancellations('f7100000-0000-0000-0000-000000000001')), 0, 'the customer sees none');

-- 12-13. declining keeps the plan; deciding without a request is refused
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000002', true);
select public.decide_series_cancellation((select id from chg_ids where name = 's2'), false);
reset role;
select ok((select active and cancel_requested_at is null from public.recurrence_series where id = (select id from chg_ids where name = 's2')), 'declining keeps the plan and clears the request');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000002', true);
select throws_ok($$ select public.decide_series_cancellation((select id from chg_ids where name = 's2'), true) $$, 'P0038', null, 'deciding without a request is refused');

-- 14-15. a new request, accepted: the plan ends, the customer is told
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000003', true);
select public.request_series_cancellation((select id from chg_ids where name = 's2'));
select set_config('request.jwt.claim.sub', 'f7000000-0000-0000-0000-000000000001', true);
select public.decide_series_cancellation((select id from chg_ids where name = 's2'), true);
reset role;
select is(
  (select (not active)::text || '/' || (select count(*)::text from public.appointments where recurrence_series_id = s.id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed'))
   from public.recurrence_series s where s.id = (select id from chg_ids where name = 's2')),
  'true/0',
  'accepting the cancellation ends the series and cancels its future appointments'
);
select ok(
  exists (select 1 from public.notifications where user_id = 'f7000000-0000-0000-0000-000000000003' and kind = 'recurrence_cancel_accepted')
  and exists (select 1 from public.notifications where user_id = 'f7000000-0000-0000-0000-000000000002' and kind = 'recurrence_cancel_requested'),
  'the barber is told about the request and the customer about the acceptance'
);

select * from finish();

rollback;
