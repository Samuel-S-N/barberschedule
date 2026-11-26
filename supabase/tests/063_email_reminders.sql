begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't63-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't63-optin@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't63-optout@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ff000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', null, 'x', now());
update public.profiles set role = 'owner' where user_id = 'ff000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, slug, owner_user_id, address_street, address_number, address_district, address_city, address_state)
values ('ff100000-0000-0000-0000-000000000001', 'T63 Studio', 'studio-t63', 'ff000000-0000-0000-0000-000000000001', 'Rua das Flores', '120', 'Centro', 'Campinas', 'SP');
insert into public.professionals (id, shop_id, name) values ('ff200000-0000-0000-0000-000000000001', 'ff100000-0000-0000-0000-000000000001', 'Ana');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('ff300000-0000-0000-0000-000000000001', 'ff100000-0000-0000-0000-000000000001', 'Corte', 30, 4000);
insert into public.professional_services (id, shop_id, professional_id, service_id) values ('ff400000-0000-0000-0000-000000000001', 'ff100000-0000-0000-0000-000000000001', 'ff200000-0000-0000-0000-000000000001', 'ff300000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email)
values
  ('ff500000-0000-0000-0000-000000000001', 'ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000002', 'Opt In', 'optin@shop.example'),
  ('ff500000-0000-0000-0000-000000000002', 'ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000003', 'Opt Out', 'optout@shop.example'),
  ('ff500000-0000-0000-0000-000000000003', 'ff100000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000004', 'No Email', 'noemail@shop.example'),
  ('ff500000-0000-0000-0000-000000000004', 'ff100000-0000-0000-0000-000000000001', null, 'Walk In', 'walkin@shop.example');

select is((select email_reminders from public.profiles where user_id = 'ff000000-0000-0000-0000-000000000002'), true, 'e-mail reminders are on by default');

-- the setting
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ff000000-0000-0000-0000-000000000003', true);
select lives_ok($$ select public.set_email_reminders(false) $$, 'a user can turn their own reminders off');
reset role;
select is((select email_reminders from public.profiles where user_id = 'ff000000-0000-0000-0000-000000000003'), false, 'the setting was stored on their own profile');
select is((select email_reminders from public.profiles where user_id = 'ff000000-0000-0000-0000-000000000002'), true, 'and nobody else changed');
set local role anon;
select throws_ok($$ select public.set_email_reminders(true) $$, '42501', null, 'anon cannot call it');
reset role;

-- four back-to-back appointments inside the 23-25 h window: opt-in, opt-out, no account e-mail, walk-in (no account)
insert into public.appointments (id, shop_id, professional_id, customer_id, professional_service_id, service_id, starts_at, ends_at, occupied_until, service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, professional_buffer_minutes_snapshot)
select ('ff600000-0000-0000-0000-00000000000' || n)::uuid, 'ff100000-0000-0000-0000-000000000001', 'ff200000-0000-0000-0000-000000000001', ('ff500000-0000-0000-0000-00000000000' || n)::uuid,
  'ff400000-0000-0000-0000-000000000001', 'ff300000-0000-0000-0000-000000000001',
  clock_timestamp() + interval '23 hours 15 minutes' + (n - 1) * interval '30 minutes',
  clock_timestamp() + interval '23 hours 45 minutes' + (n - 1) * interval '30 minutes',
  clock_timestamp() + interval '23 hours 45 minutes' + (n - 1) * interval '30 minutes',
  'Corte', 30, 4000, 0
from generate_series(1, 4) n;
set constraints all immediate;

select is(public.enqueue_notification_reminders(), 3, 'the function still returns the number of push reminders (three customers with an account)');
select is((select count(*)::int from public.notification_outbox where event_type = 'appointment.reminder_email'), 1, 'only the opted-in customer with an account e-mail gets a reminder e-mail');
select is((select recipient_user_id from public.notification_outbox where event_type = 'appointment.reminder_email'), 'ff000000-0000-0000-0000-000000000002'::uuid, 'and it is the opted-in customer');
select is((select event_key from public.notification_outbox where event_type = 'appointment.reminder_email'), 'appointment:ff600000-0000-0000-0000-000000000001:reminder:24h:email', 'the e-mail has its own event key');
select is(
  (select payload ->> 'shop_address' from public.notification_outbox where event_type = 'appointment.reminder_email'),
  'Rua das Flores 120, Centro, Campinas - SP', 'the payload carries a formatted address'
);
select is(
  (select jsonb_build_object('p', payload ->> 'professional_name', 's', payload ->> 'service_name', 'n', payload ->> 'shop_name', 'u', payload ->> 'shop_slug') from public.notification_outbox where event_type = 'appointment.reminder_email'),
  '{"p":"Ana","s":"Corte","n":"T63 Studio","u":"studio-t63"}'::jsonb, 'the payload carries the professional, service, business name and slug'
);
select is(public.enqueue_notification_reminders(), 0, 'running it again inserts nothing (idempotent for push and e-mail)');
select is((select count(*)::int from public.notification_outbox where event_type = 'appointment.reminder_email'), 1, 'and no second e-mail row');

-- claim: the e-mail row carries the account e-mail and is not multiplied by device tokens
insert into public.notification_tokens (user_id, expo_push_token, platform) values
  ('ff000000-0000-0000-0000-000000000002', 'ExponentPushToken[t63a]', 'android'),
  ('ff000000-0000-0000-0000-000000000002', 'ExponentPushToken[t63b]', 'ios');
create temporary table t63_claim on commit drop as select * from public.claim_notification_batch(100);

select is((select count(*)::int from t63_claim where event_type = 'appointment.reminder_email' and payload ->> 'appointment_id' like 'ff600000%'), 1, 'the e-mail row is claimed once even though its customer has two device tokens');
select is((select recipient_email from t63_claim where event_type = 'appointment.reminder_email' and payload ->> 'appointment_id' like 'ff600000%'), 't63-optin@example.com', 'the claim returns the account e-mail');
select is((select count(*)::int from t63_claim where event_type = 'appointment.reminder' and payload ->> 'appointment_id' like 'ff600000%'), 4, 'push rows still join device tokens (two for the opted-in customer, one empty row each for the others)');

select * from finish();
rollback;
