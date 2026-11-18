begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't55-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't55-customer@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'ff000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, slug, owner_user_id)
values ('ff100000-0000-0000-0000-000000000001', 'T55 Shop', 'shop-t55', 'ff000000-0000-0000-0000-000000000001');

insert into public.notification_tokens (user_id, expo_push_token, platform)
values ('ff000000-0000-0000-0000-000000000002', 'ExponentPushToken[t55]', 'ios');
insert into public.notification_tokens (user_id, web_subscription, web_origin, platform)
values
  ('ff000000-0000-0000-0000-000000000002', '{"endpoint":"https://push.example/a","keys":{"p256dh":"p","auth":"a"}}', 'https://shop-t55.localhost:4173', 'web'),
  ('ff000000-0000-0000-0000-000000000002', '{"endpoint":"https://push.example/b","keys":{"p256dh":"p","auth":"a"}}', 'https://other.localhost:4173', 'web');

insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
values
  ('t55-with-shop', 'appointment.booked', 'ff000000-0000-0000-0000-000000000002', '{"shop_id":"ff100000-0000-0000-0000-000000000001","service_name":"Cut","starts_at":"2026-12-01T12:00:00Z"}'),
  ('t55-owner-no-token', 'payout.due', 'ff000000-0000-0000-0000-000000000001', '{"count":1,"professional_names":["Ana"]}');

-- claim_notification_batch is security definer; the table is created by the test role, the call is the same one the service role makes.
create temporary table claimed on commit drop as select * from public.claim_notification_batch(10);

select is((select count(*)::int from claimed where id = (select id from public.notification_outbox where event_key = 't55-with-shop')), 3, 'one row per active token: Expo plus two web subscriptions');
select is((select count(*)::int from claimed where id = (select id from public.notification_outbox where event_key = 't55-with-shop') and web_subscription is not null), 2, 'the web rows carry the subscription');
select is((select count(*)::int from claimed where id = (select id from public.notification_outbox where event_key = 't55-with-shop') and expo_push_token = 'ExponentPushToken[t55]'), 1, 'and the Expo row is still there');
select is((select string_agg(distinct web_origin, ',' order by web_origin) from claimed where web_subscription is not null and id = (select id from public.notification_outbox where event_key = 't55-with-shop')), 'https://other.localhost:4173,https://shop-t55.localhost:4173', 'with their origins');
select is((select distinct shop_slug from claimed where id = (select id from public.notification_outbox where event_key = 't55-with-shop')), 'shop-t55', 'the notification''s shop slug comes from the payload');
select is((select distinct recipient_role from claimed where id = (select id from public.notification_outbox where event_key = 't55-with-shop')), 'customer', 'and the recipient role');
select is((select shop_slug from claimed where id = (select id from public.notification_outbox where event_key = 't55-owner-no-token')), null, 'an event without shop_id has no slug');
select ok(has_function_privilege('service_role', 'public.claim_notification_batch(integer)', 'execute'), 'the service role may call the claim');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  (select public.export_my_data() -> 'notification_tokens')::text !~ '(p256dh|"auth"|endpoint)',
  'the export never contains subscription keys or endpoints'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.export_my_data() -> 'notification_tokens') t where t ->> 'web_origin' = 'https://shop-t55.localhost:4173'),
  1, 'but it lists the web origin'
);
reset role;

select * from finish();
rollback;
