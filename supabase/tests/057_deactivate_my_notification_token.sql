begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000056', 'authenticated', 'authenticated', 't57-one@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000057', 'authenticated', 'authenticated', 't57-two@example.com', 'x', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000056', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.register_notification_token('ExponentPushToken[t57mine]', 'android', 'en');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000057', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$ select public.deactivate_my_notification_token('ExponentPushToken[t57mine]') $$, 'deactivating someone else''s token is a harmless no-op');
reset role;
select is((select active from public.notification_tokens where expo_push_token = 'ExponentPushToken[t57mine]'), true, 'and it stays active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000056', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.deactivate_my_notification_token('ExponentPushToken[t57mine]');
reset role;
select is((select active from public.notification_tokens where expo_push_token = 'ExponentPushToken[t57mine]'), false, 'the owner of the token switches it off');

set local role anon;
select throws_ok($$ select public.deactivate_my_notification_token('ExponentPushToken[t57mine]') $$, '42501', null, 'anonymous callers are refused');
reset role;

select * from finish();
rollback;
