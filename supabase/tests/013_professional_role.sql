begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't16-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't16-professional-a@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't16-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't16-plain@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 't16-professional-b@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = '80000000-0000-0000-0000-000000000001';
update public.profiles set role = 'professional'
where user_id in ('80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000005');

insert into public.shops (id, name, owner_user_id)
values ('81000000-0000-0000-0000-000000000001', 'T16 Shop', '80000000-0000-0000-0000-000000000001');

insert into public.professionals (id, shop_id, user_id, name)
values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'Professional A'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'Professional B');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', 'T16 Customer', 't16-customer@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values
  ('84000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Cut', 30, 5000),
  ('84000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 'Beard', 30, 3000);

insert into public.professional_services (id, shop_id, professional_id, service_id)
values
  ('85000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001'),
  ('85000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000001'),
  ('85000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000002');

-- a1/a2 scheduled (A), a3/a4 completed (A), b1 completed (B)
insert into public.appointments (
  id, shop_id, professional_id, customer_id, professional_service_id, service_id,
  starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, professional_buffer_minutes_snapshot
)
values
  ('86000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001',
    now() + interval '1 day', now() + interval '1 day 30 minutes', now() + interval '1 day 30 minutes', 'scheduled', 'Cut', 30, 5000, 0),
  ('86000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001',
    now() + interval '2 days', now() + interval '2 days 30 minutes', now() + interval '2 days 30 minutes', 'scheduled', 'Cut', 30, 5000, 0),
  ('86000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001',
    now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', now() - interval '2 days' + interval '30 minutes', 'completed', 'Cut', 30, 5000, 0),
  ('86000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000003', '84000000-0000-0000-0000-000000000002',
    now() - interval '3 days', now() - interval '3 days' + interval '30 minutes', now() - interval '3 days' + interval '30 minutes', 'completed', 'Beard', 30, 3000, 0),
  ('86000000-0000-0000-0000-000000000005', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000001',
    now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', now() - interval '2 days' + interval '30 minutes', 'completed', 'Cut', 30, 9999, 0);

insert into public.schedule_overrides (id, shop_id, professional_id, local_date, kind)
values ('87000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', current_date + 5, 'block');

update auth.users set last_sign_in_at = now() where id = '80000000-0000-0000-0000-000000000002';

select is(
  (select role::text from public.profiles where user_id = '80000000-0000-0000-0000-000000000002'),
  'professional',
  'profile_role accepts the professional value'
);

select throws_ok(
  $$ update public.professionals set user_id = '80000000-0000-0000-0000-000000000002' where id = '82000000-0000-0000-0000-000000000002' $$,
  '23505', null, 'one auth user links to at most one professional'
);
select throws_ok(
  $$ update public.professionals set compensation_type = 'commission', chair_rental_amount_cents = 1000, chair_rental_frequency = 'weekly' where id = '82000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'commission rejects chair-rental fields'
);
select throws_ok(
  $$ update public.professionals set compensation_type = 'chair_rental' where id = '82000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'chair rental requires amount and frequency'
);

-- professional A
set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_own_professional('82000000-0000-0000-0000-000000000001'), true, 'professional A owns professional row A');
select is(public.is_own_professional('82000000-0000-0000-0000-000000000002'), false, 'professional A does not own professional row B');

select is(
  (select count(*)::int from public.list_my_professional_agenda(current_date - 7, current_date + 7)),
  4,
  'own agenda lists only professional A appointments'
);
select is(
  (select count(*)::int from public.list_my_professional_agenda(current_date - 7, current_date + 7) where professional_id <> '82000000-0000-0000-0000-000000000001'),
  0,
  'own agenda never includes another professional'
);
select throws_ok(
  $$ select * from public.list_my_professional_agenda(current_date, current_date + 40) $$,
  'P0014', null, 'agenda range is bounded to 32 dates'
);

select is(
  (select status::text from public.set_my_appointment_status('86000000-0000-0000-0000-000000000001', 'no_show')),
  'no_show',
  'professional marks own scheduled appointment no_show'
);
select is(
  (select status::text from public.set_my_appointment_status('86000000-0000-0000-0000-000000000002', 'confirmed')),
  'confirmed',
  'professional confirms own scheduled appointment'
);
select throws_ok(
  $$ select * from public.set_my_appointment_status('86000000-0000-0000-0000-000000000002', 'confirmed') $$,
  'P0013', null, 'an already confirmed appointment cannot be confirmed again'
);
select throws_ok(
  $$ select * from public.set_my_appointment_status('86000000-0000-0000-0000-000000000003', 'confirmed') $$,
  'P0013', null, 'a completed appointment cannot be confirmed'
);
select throws_ok(
  $$ select * from public.set_my_appointment_status('86000000-0000-0000-0000-000000000005', 'confirmed') $$,
  'P0010', null, 'professional cannot confirm another professional appointment'
);
select throws_ok(
  $$ select * from public.set_my_appointment_status('86000000-0000-0000-0000-000000000005', 'completed') $$,
  'P0010', null, 'professional cannot change another professional appointment'
);
select throws_ok(
  $$ select * from public.set_my_appointment_status('86000000-0000-0000-0000-000000000002', 'cancelled') $$,
  'P0013', null, 'professional cannot cancel through the status RPC'
);
select throws_ok(
  $$ select * from public.set_my_appointment_status('86000000-0000-0000-0000-000000000003', 'no_show') $$,
  'P0013', null, 'terminal appointments cannot change again'
);

select lives_ok(
  $$ insert into public.schedule_overrides (shop_id, professional_id, local_date, kind, start_time, end_time)
     values ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', current_date + 3, 'block', null, null) $$,
  'professional blocks a day for themselves'
);
select is(
  (select count(*)::int from public.schedule_overrides),
  1,
  'professional sees only their own overrides'
);
select throws_ok(
  $$ insert into public.schedule_overrides (shop_id, professional_id, local_date, kind, start_time, end_time)
     values ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', current_date + 4, 'opening', '09:00', '10:00') $$,
  '42501', null, 'professional cannot create openings'
);
select throws_ok(
  $$ insert into public.schedule_overrides (shop_id, professional_id, local_date, kind)
     values ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', current_date + 4, 'block') $$,
  '42501', null, 'professional cannot block another professional'
);
select lives_ok(
  $$ delete from public.schedule_overrides where professional_id = '82000000-0000-0000-0000-000000000001' $$,
  'professional removes their own block'
);
select is(
  (select count(*)::int from public.schedule_overrides where professional_id = '82000000-0000-0000-0000-000000000001'),
  0,
  'own block is gone'
);

select is((select name from public.get_my_professional_profile()), 'Professional A', 'own profile is returned');
select is(
  (select bio from public.update_my_professional_profile('  Fade specialist ', 'https://ref.supabase.co/storage/v1/object/public/avatars/80000000-0000-0000-0000-000000000002/avatar-1.jpg')),
  'Fade specialist',
  'professional updates bio and avatar'
);
select throws_ok(
  $$ select * from public.update_my_professional_profile('ok', 'javascript:alert(1)') $$,
  'P0017', null, 'avatar must be an http(s) URL'
);
select throws_ok(
  $$ select * from public.update_my_professional_profile(repeat('a', 501), null) $$,
  'P0017', null, 'bio length is bounded'
);
select is((select count(*)::int from public.list_my_professional_services()), 2, 'professional lists only their own services');

select hasnt_function('public', 'get_my_professional_earnings', array['date', 'date'], 'the old earnings RPC is gone (reports use get_my_professional_report)');
select throws_ok(
  $$ select * from public.set_professional_compensation('82000000-0000-0000-0000-000000000001', 'commission', 40) $$,
  '42501', null, 'professional cannot edit their own compensation'
);
select throws_ok(
  $$ select public.get_professional_account_status('82000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'professional cannot read account status'
);

-- linked user without a professional row, and the owner
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ select * from public.list_my_professional_agenda(current_date, current_date + 1) $$,
  'P0019', null, 'a user without a professional row cannot read an agenda'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ select * from public.get_my_professional_profile() $$,
  'P0019', null, 'the owner has no professional profile'
);
select is(
  (select compensation_type::text from public.set_professional_compensation('82000000-0000-0000-0000-000000000001', 'chair_rental', null, 30000, 'monthly')),
  'chair_rental',
  'owner sets chair rental compensation'
);
select throws_ok(
  $$ select * from public.set_professional_compensation('82000000-0000-0000-0000-000000000001', 'commission', 150) $$,
  'P0021', null, 'invalid compensation is rejected'
);
select is(
  (select chair_rental_amount_cents from public.list_owner_professionals('81000000-0000-0000-0000-000000000001') where id = '82000000-0000-0000-0000-000000000001'),
  30000,
  'owner listing exposes compensation'
);
select is(
  (public.get_professional_account_status('82000000-0000-0000-0000-000000000001'), public.get_professional_account_status('82000000-0000-0000-0000-000000000002'))::text,
  '(t,f)',
  'owner sees which professional accounts have signed in'
);

-- anonymous
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$ select * from public.list_my_professional_agenda(current_date, current_date + 1) $$,
  '42501', null, 'anonymous callers cannot read professional agendas'
);

-- deactivated professional is locked out
reset role;
update public.professionals set active = false, archived_at = now() where id = '82000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ select * from public.list_my_professional_agenda(current_date, current_date + 1) $$,
  'P0019', null, 'a deactivated professional loses access'
);

select * from finish();
rollback;
