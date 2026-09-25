begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't12-user@example.com', 'password-hash', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select locale from public.register_notification_token('ExponentPushToken[t12a]', 'ios', 'pt')), 'pt', 'stores the device locale');
select is((select locale from public.register_notification_token('ExponentPushToken[t12a]', 'ios', 'es')), 'es', 're-registering updates the locale');
select is((select locale from public.register_notification_token('ExponentPushToken[t12b]', 'ios', 'fr')), 'en', 'unsupported locales fall back to en');
select is((select locale from public.register_notification_token('ExponentPushToken[t12c]', 'ios', null)), 'en', 'a missing locale is stored as en');
select is((select locale from public.register_notification_token('ExponentPushToken[t12d]', 'ios')), 'en', 'the old two-argument call still works');

reset role;
delete from public.notification_tokens
where user_id = 'b0000000-0000-0000-0000-000000000001'
  and expo_push_token <> 'ExponentPushToken[t12a]';

insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
values ('t12:reminder', 'appointment.reminder', 'b0000000-0000-0000-0000-000000000001', '{"service_name":"Corte"}');

select is(
  (select locale from public.claim_notification_batch(10) where expo_push_token = 'ExponentPushToken[t12a]' limit 1),
  'es',
  'claim_notification_batch returns the token locale'
);

select throws_ok(
  $$ update public.notification_tokens set locale = 'fr' where expo_push_token = 'ExponentPushToken[t12a]' $$,
  '23514',
  null,
  'the check constraint rejects unsupported locales'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ select * from public.claim_notification_batch(10) $$,
  '42501',
  null,
  'authenticated users cannot claim notification batches'
);

select * from finish();
rollback;
