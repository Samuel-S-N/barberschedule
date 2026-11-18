begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't54-one@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't54-two@example.com', 'x', now());

-- user one registers a browser
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select active from public.register_web_push_subscription(
    '{"endpoint":"https://push.example/abc","keys":{"p256dh":"pp","auth":"aa"},"expirationTime":null}'::jsonb, 'https://shop-a.localhost:4173', 'pt')),
  true, 'a signed-in user registers a web subscription'
);
reset role;

select is((select expo_push_token from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), null, 'a web row has no Expo token');
select is((select platform || '/' || locale || '/' || web_origin from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), 'web/pt/https://shop-a.localhost:4173', 'platform, locale and origin are stored');
select is((select web_subscription ? 'expirationTime' from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), false, 'only endpoint and keys are kept');

-- the same browser, now used by user two, is re-bound instead of duplicated
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ select * from public.register_web_push_subscription('{"endpoint":"https://push.example/abc","keys":{"p256dh":"pp","auth":"aa"}}'::jsonb, 'https://shop-b.localhost:4173', 'en') $$,
  'registering a known endpoint for another user reuses the row'
);
reset role;
select is((select count(*)::int from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), 1, 'still one row per endpoint');
select is((select user_id from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), 'fe000000-0000-0000-0000-000000000002'::uuid, 'and it now belongs to the new user');

-- validation and ownership, as user one
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.register_web_push_subscription('{"endpoint":"https://push.example/x"}'::jsonb, 'https://shop-a.localhost:4173') $$, 'P0016', 'NOTIFICATION_TOKEN_INVALID', 'a subscription without keys is rejected');
select throws_ok($$ select * from public.register_web_push_subscription('{"endpoint":"http://push.example/x","keys":{"p256dh":"p","auth":"a"}}'::jsonb, 'https://shop-a.localhost:4173') $$, 'P0016', 'NOTIFICATION_TOKEN_INVALID', 'a non-https endpoint is rejected');
select throws_ok($$ select * from public.register_web_push_subscription('{"endpoint":"https://push.example/x","keys":{"p256dh":"p","auth":"a"}}'::jsonb, 'javascript:alert(1)') $$, 'P0016', 'NOTIFICATION_TOKEN_INVALID', 'a bad origin is rejected');
select lives_ok($$ select public.deactivate_my_web_subscription('https://push.example/abc') $$, 'deactivating someone else''s subscription is a harmless no-op');
reset role;
select is((select active from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), true, 'and it stays active');

-- table-level rules
select throws_ok(
  $$ insert into public.notification_tokens (user_id, expo_push_token, web_subscription, web_origin)
     values ('fe000000-0000-0000-0000-000000000001', 'ExponentPushToken[t54]', '{"endpoint":"https://p/1","keys":{"p256dh":"p","auth":"a"}}', 'https://a.example') $$,
  '23514', null, 'a row cannot be both an Expo token and a web subscription'
);
select throws_ok(
  $$ insert into public.notification_tokens (user_id, platform) values ('fe000000-0000-0000-0000-000000000001', 'web') $$,
  '23514', null, 'a row must be one kind or the other'
);

-- the dispatcher's function
set local role service_role;
select lives_ok($$ select public.deactivate_web_subscription('https://push.example/abc') $$, 'the service role deactivates a subscription by endpoint');
reset role;
select is((select active from public.notification_tokens where web_subscription ->> 'endpoint' = 'https://push.example/abc'), false, 'and it is inactive');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select public.deactivate_web_subscription('https://push.example/abc') $$, '42501', null, 'a signed-in user cannot use the service-role function');
reset role;

select * from finish();
rollback;
