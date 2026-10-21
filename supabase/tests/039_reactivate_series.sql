begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'react-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'react-barber@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'react-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'react-other@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'f9000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'f9000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id) values ('f9100000-0000-0000-0000-000000000001', 'React Shop', 'f9000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email) values
  ('f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000003', 'React Customer', 'react-customer@shop.example'),
  ('f9200000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000004', 'Other Customer', 'react-other@shop.example');
insert into public.barbers (id, shop_id, name, user_id) values ('f9300000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'React Barber', 'f9000000-0000-0000-0000-000000000002');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('f9400000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'React Cut', 30, 3500);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('f9500000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000001', 'f9400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'f9100000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

create temporary table react_dates as select date_trunc('week', current_date + 14)::date as monday;
grant select on react_dates to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'f9400000-0000-0000-0000-000000000001', 1, 2500, 'Corte mensal', true);

select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select count(*) from public.request_recurrence('f9500000-0000-0000-0000-000000000001', 1, (select monday from react_dates), '10:00');
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000002', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('f9100000-0000-0000-0000-000000000001') limit 1), true);

-- 1. while it runs, the customer sees an active series and the plan title
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select is((select series_active::text || '/' || plan_name from public.list_my_recurrence_requests() limit 1), 'true/Corte mensal', 'an active series is reported active with its plan title');

-- 2. one occurrence is cancelled on its own, then the owner ends the series
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select public.cancel_recurrence_occurrence((select id from public.list_owner_recurrence_series('f9100000-0000-0000-0000-000000000001') where customer_name = 'React Customer'), (select monday from react_dates) + 14);
select public.end_recurrence_series((select id from public.list_owner_recurrence_series('f9100000-0000-0000-0000-000000000001') where customer_name = 'React Customer'));

-- 3. the customer sees the end
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select is((select (not series_active)::text || '/' || (series_ended_at is not null)::text from public.list_my_recurrence_requests() limit 1), 'true/true', 'the customer sees the series as ended');

-- 4. only the owner reactivates
select throws_ok($$ select public.reactivate_recurrence_series((select series_id from public.list_my_recurrence_requests() limit 1)) $$, 'P0010', null, 'a customer cannot reactivate a series');

-- 5. the slot of the second occurrence is taken meanwhile
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$ select * from public.book_appointment('f9500000-0000-0000-0000-000000000001', 'f9200000-0000-0000-0000-000000000002', ((select monday from react_dates) + 7 + time '10:00') at time zone 'America/Sao_Paulo', 'customer') $$,
  'the freed slot of the second occurrence is booked by someone else'
);

-- 6-8. reactivate
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select lives_ok($$ select public.reactivate_recurrence_series((select id from public.list_owner_recurrence_series('f9100000-0000-0000-0000-000000000001') where customer_name = 'React Customer')) $$, 'the owner reactivates the series');
reset role;
select is(
  (select active::text || '/' || (ended_at is null)::text || '/' || (select status::text from public.appointments where recurrence_series_id = s.id and recurrence_occurrence_date = (select monday from react_dates))
   from public.recurrence_series s where s.customer_id = 'f9200000-0000-0000-0000-000000000001'),
  'true/true/scheduled',
  'the series is active again and its first occurrence is restored'
);
select is(
  (select (select status::text from public.appointments where recurrence_series_id = s.id and recurrence_occurrence_date = (select monday from react_dates) + 14) || '/' ||
          (select count(*)::text from public.recurrence_conflicts where series_id = s.id and occurrence_date = (select monday from react_dates) + 7 and status = 'open') || '/' ||
          (select count(*)::text from public.appointments where recurrence_series_id is null and source = 'owner' and status = 'cancelled' and customer_id = s.customer_id)
   from public.recurrence_series s where s.customer_id = 'f9200000-0000-0000-0000-000000000001'),
  'cancelled/1/1',
  'an individually cancelled occurrence stays cancelled; a taken slot becomes an open conflict and frees the occurrence key'
);

-- 9. reactivating a running series is refused
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.reactivate_recurrence_series((select id from public.list_owner_recurrence_series('f9100000-0000-0000-0000-000000000001') where customer_name = 'React Customer')) $$, 'P0036', null, 'an active series cannot be reactivated');

select * from finish();

rollback;
