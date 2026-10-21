begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f5000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rec-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f5000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rec-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f5000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rec-barber@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'f5000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'f5000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id)
values ('f6000000-0000-0000-0000-000000000001', 'Rec Shop', 'f5000000-0000-0000-0000-000000000001');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('f6100000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002', 'Rec Customer', 'rec-customer@shop.example');
insert into public.customers (id, shop_id, user_id, full_name, phone)
values ('f6100000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000001', null, 'Walk In', '11999990000');

insert into public.barbers (id, shop_id, name, user_id)
values ('f7000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'Rec Barber', 'f5000000-0000-0000-0000-000000000003');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('f8000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'Rec Cut', 30, 3500);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('f9000000-0000-0000-0000-000000000001', 'f6000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
values
  ('f6000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 1, '09:00', '18:00'),
  ('f6000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 2, '09:00', '18:00');

-- A Monday and a Tuesday two weeks ahead (inside the 90-day window).
create temporary table rec_dates as
select date_trunc('week', current_date + 14)::date as monday, (date_trunc('week', current_date + 14) + interval '1 day')::date as tuesday;
grant select on rec_dates to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- the owner defines the weekly price
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000001', true);
select lives_ok($$ select public.save_recurrence_plan(null, 'f8000000-0000-0000-0000-000000000001', 1, 2500, 'Test plan', true) $$, 'the owner sets the weekly price');
select lives_ok($$ select public.save_recurrence_plan(null, 'f8000000-0000-0000-0000-000000000001', 2, 3000, 'Test plan', true) $$, 'the owner adds a biweekly plan');
select throws_ok($$ select public.save_recurrence_plan(null, 'f8000000-0000-0000-0000-000000000001', 13, 2500, 'Test plan', true) $$, 'P0032', null, 'periodicity is 1 to 12 weeks');

-- the customer sees the quote and requests
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000002', true);
select is((select recurrence_cents from public.get_recurrence_quote('f9000000-0000-0000-0000-000000000001') where interval_weeks = 1), 2500, 'the weekly quote carries the recurrence price');
select is((select normal_cents from public.get_recurrence_quote('f9000000-0000-0000-0000-000000000001') where interval_weeks = 2), 3500, 'the normal price is shown too');
select is((select count(*)::int from public.request_recurrence('f9000000-0000-0000-0000-000000000001', 1, (select monday from rec_dates), '10:00')), 1, 'the request is created');
select throws_ok($$ select * from public.request_recurrence('f9000000-0000-0000-0000-000000000001', 1, (select monday from rec_dates), '11:00') $$, '23505', null, 'one pending request per customer and service');
select throws_ok($$ select * from public.request_recurrence('f9000000-0000-0000-0000-000000000001', 2, (select tuesday from rec_dates), '10:07') $$, 'P0001', null, 'the first time must be bookable');

-- the barber sees it; the customer cannot decide
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.list_recurrence_requests('f6000000-0000-0000-0000-000000000001')), 1, 'the barber sees the pending request');
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select * from public.decide_recurrence_request((select id from public.list_my_recurrence_requests() limit 1), true) $$,
  'P0010', null, 'the customer cannot decide'
);

-- the barber accepts
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$ select * from public.decide_recurrence_request((select id from public.list_recurrence_requests('f6000000-0000-0000-0000-000000000001') limit 1), true) $$,
  'the barber accepts'
);
reset role;
select is((select special_price_cents from public.recurrence_series where customer_id = 'f6100000-0000-0000-0000-000000000001'), 2500, 'the series carries the recurrence price');
select ok((select count(*) from public.appointments where source = 'recurrence' and customer_id = 'f6100000-0000-0000-0000-000000000001') >= 1, 'occurrences were materialised');
select is((select count(*)::int from public.notification_outbox where event_type = 'recurrence.accepted' and recipient_user_id = 'f5000000-0000-0000-0000-000000000002'), 1, 'the customer gets a push when accepted');
select is((select count(*)::int from public.notification_outbox where event_type = 'recurrence.requested'), 2, 'barber and owner got a push for the request');

create temporary table rec_req as select id from public.recurrence_requests limit 1;
grant select on rec_req to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select * from public.decide_recurrence_request((select id from rec_req), true) $$,
  'P0031', null, 'a request cannot be decided twice'
);

-- staff-created series for a customer without an account
select is(
  (select count(*)::int from public.create_recurrence_for_customer('f6100000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000001', 2, (select tuesday from rec_dates), '11:00')),
  1, 'the barber creates a series for a walk-in customer'
);
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select * from public.create_recurrence_for_customer('f6100000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000001', 1, (select tuesday from rec_dates), '12:00') $$,
  'P0010', null, 'customers cannot create series for others'
);

select * from finish();

rollback;
