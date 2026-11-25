begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- Two shops, each with its own owner (one owner per shop). A user can be a professional in ONE shop only (professionals_user_id_key),
-- so the professional works in shop A; one person IS a customer in BOTH shops (that is the case that is broken today).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't59-owner-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't59-owner-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't59-professional@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't59-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id in ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000002');
update public.profiles set role = 'professional' where user_id = 'f9000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id) values
  ('f9100000-0000-0000-0000-000000000001', 'T59 Shop A', 'f9000000-0000-0000-0000-000000000001'),
  ('f9100000-0000-0000-0000-000000000002', 'T59 Shop B', 'f9000000-0000-0000-0000-000000000002');
insert into public.professionals (id, shop_id, name, user_id) values
  ('f9300000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'T59 Professional', 'f9000000-0000-0000-0000-000000000003');
insert into public.customers (id, shop_id, user_id, full_name, email) values
  ('f9200000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000004', 'T59 Customer', 't59-customer@a.example'),
  ('f9200000-0000-0000-0000-000000000002', 'f9100000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000004', 'T59 Customer', 't59-customer@b.example');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('f9400000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'T59 Cut', 30, 3500);
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('f9500000-0000-0000-0000-000000000001', 'f9100000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000001', 'f9400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'f9100000-0000-0000-0000-000000000001', 'f9300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

create temporary table t59_dates as select date_trunc('week', current_date + 14)::date as monday;
create temporary table t59_ids (name text primary key, id uuid);
grant select on t59_dates, t59_ids to authenticated;

-- owner A publishes the plans
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'f9400000-0000-0000-0000-000000000001', 1, 2500, 'T59 weekly', true);
select public.save_recurrence_plan(null, 'f9400000-0000-0000-0000-000000000001', 2, 3000, 'T59 biweekly', true);

-- the customer asks for a recurrence in shop A
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000004', true);
select count(*) from public.request_recurrence('f9500000-0000-0000-0000-000000000001', 1, (select monday from t59_dates), '10:00');
reset role;

select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000003' and kind = 'recurrence_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the professional gets the request notice in the shop of the request (a guard: the guess is right today because a professional has one shop)');
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000001' and kind = 'recurrence_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the owner gets the request notice in the shop of the request');

select is((select payload ->> 'shop_id' from public.notification_outbox where recipient_user_id = 'f9000000-0000-0000-0000-000000000003' and event_type = 'recurrence.requested'), 'f9100000-0000-0000-0000-000000000001',
  'the push of a recurrence event carries the shop (so it goes to that shop''s own address)');

-- the professional accepts
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('f9100000-0000-0000-0000-000000000001') limit 1), true);
reset role;
insert into t59_ids select 'series', id from public.recurrence_series where customer_id = 'f9200000-0000-0000-0000-000000000001';

select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and kind = 'recurrence_accepted'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the customer''s "accepted" notice carries the shop of the request');

-- as the customer: shop A's inbox shows it, shop B's does not (the app lists shop_id = X or null)
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000004', true);
select is(public.count_unread_notifications('f9100000-0000-0000-0000-000000000001'), 1, 'shop A counts the notice');
select is(public.count_unread_notifications('f9100000-0000-0000-0000-000000000002'), 0, 'shop B does not');
select is((select array_agg(kind order by kind) from public.notifications where shop_id = 'f9100000-0000-0000-0000-000000000001' or shop_id is null), array['recurrence_accepted'], 'shop A lists it');
select is((select count(*)::int from public.notifications where shop_id = 'f9100000-0000-0000-0000-000000000002' or shop_id is null), 0, 'shop B lists nothing');

-- the customer asks to cancel the series; the professional declines
select public.request_series_cancellation((select id from t59_ids where name = 'series'));
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000003' and kind = 'recurrence_cancel_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the professional gets the cancellation request in the right shop');
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000001' and kind = 'recurrence_cancel_requested'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the owner gets the cancellation request in the right shop');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select public.decide_series_cancellation((select id from t59_ids where name = 'series'), false);
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and kind = 'recurrence_cancel_declined'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the customer''s "declined" notice carries the shop');

-- cancel again and accept (the series ends), then the owner creates a new series by hand for the customer
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000004', true);
select public.request_series_cancellation((select id from t59_ids where name = 'series'));
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000003', true);
select public.decide_series_cancellation((select id from t59_ids where name = 'series'), true);
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and kind = 'recurrence_cancel_accepted'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'the customer''s "cancellation accepted" notice carries the shop');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select count(*) from public.create_recurrence_for_customer('f9200000-0000-0000-0000-000000000001', 'f9500000-0000-0000-0000-000000000001', 2, (select monday from t59_dates) + 1, '11:00');
reset role;
select is((select shop_id from public.notifications where user_id = 'f9000000-0000-0000-0000-000000000004' and event_key like 'recman:%'), 'f9100000-0000-0000-0000-000000000001'::uuid,
  'a series created by hand notifies the customer in the right shop');

-- nothing recurrence-related is left without a shop, anywhere
select is((select count(*)::int from public.notifications where kind like 'recurrence\_%' and shop_id is null), 0, 'no recurrence notification is unscoped');

-- the function itself: only the new signature, and not callable by clients
select has_function('public', 'add_inbox_event', array['uuid', 'uuid', 'text', 'jsonb', 'text', 'text'], 'add_inbox_event has the shop parameter');
select hasnt_function('public', 'add_inbox_event', array['uuid', 'text', 'jsonb', 'text', 'text'], 'the old add_inbox_event signature is gone');
select is(has_function_privilege('authenticated', 'public.add_inbox_event(uuid, uuid, text, jsonb, text, text)', 'execute'), false, 'clients cannot call add_inbox_event');

select * from finish();
rollback;
