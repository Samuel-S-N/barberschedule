begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't60-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't60-professional@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't60-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'fa000000-0000-0000-0000-000000000001';
update public.profiles set role = 'professional' where user_id = 'fa000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, slug, owner_user_id)
values ('fa100000-0000-0000-0000-000000000001', 'T60 Studio Bella', 't60-studio-bella', 'fa000000-0000-0000-0000-000000000001');
insert into public.professionals (id, shop_id, name, user_id)
values ('fa300000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'T60 Professional', 'fa000000-0000-0000-0000-000000000003');
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('fa200000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000004', 'T60 Customer', 't60-customer@example.com');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('fa400000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'T60 Cut', 30, 3500);
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('fa500000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'fa300000-0000-0000-0000-000000000001', 'fa400000-0000-0000-0000-000000000001');
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'fa100000-0000-0000-0000-000000000001', 'fa300000-0000-0000-0000-000000000001', day, '09:00', '18:00' from generate_series(1, 7) as day;

create temporary table t60_dates as select date_trunc('week', current_date + 14)::date as monday;
grant select on t60_dates to authenticated;

-- a recurrence request (staff push) and its acceptance (customer push)
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', true);
select public.save_recurrence_plan(null, 'fa400000-0000-0000-0000-000000000001', 1, 2500, 'T60 weekly', true);
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000004', true);
select count(*) from public.request_recurrence('fa500000-0000-0000-0000-000000000001', 1, (select monday from t60_dates), '10:00');
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000003', true);
select count(*) from public.decide_recurrence_request((select id from public.list_recurrence_requests('fa100000-0000-0000-0000-000000000001') limit 1), true);
reset role;

-- an event with no shop in its payload (like a payout)
insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
values ('t60-noshop', 'payout.paid', 'fa000000-0000-0000-0000-000000000004', '{"amount_cents": 100}'::jsonb);

create temporary table t60_claimed as select * from public.claim_notification_batch(100);

select is((select array_agg(distinct shop_name) from t60_claimed where event_type = 'recurrence.requested' and payload ->> 'shop_id' = 'fa100000-0000-0000-0000-000000000001'), array['T60 Studio Bella'],
  'the claim returns the shop name for a recurrence request (staff recipients)');
select is((select array_agg(distinct shop_slug) from t60_claimed where event_type = 'recurrence.requested' and payload ->> 'shop_id' = 'fa100000-0000-0000-0000-000000000001'), array['t60-studio-bella'],
  'and its slug (recurrence pushes now reach the shop''s own address)');
select is((select array_agg(distinct shop_name) from t60_claimed where event_type = 'recurrence.accepted' and payload ->> 'shop_id' = 'fa100000-0000-0000-0000-000000000001'), array['T60 Studio Bella'],
  'the claim returns the shop name for the customer''s "accepted" push');
select is((select count(*)::int from t60_claimed where event_type = 'payout.paid' and payload ->> 'amount_cents' = '100' and shop_name is null and shop_slug is null), 1,
  'an event with no shop has a null name and a null slug');

select is(has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'execute'), true, 'the dispatcher (service role) can claim');
select is(has_function_privilege('authenticated', 'public.claim_notification_batch(integer)', 'execute'), false, 'signed-in users cannot claim');
select is(has_function_privilege('anon', 'public.claim_notification_batch(integer)', 'execute'), false, 'anonymous users cannot claim');

select * from finish();
rollback;
