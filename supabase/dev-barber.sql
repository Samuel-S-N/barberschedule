-- Local-only dev user (not part of seed.sql: the pgTAP RLS tests assume the seed has exactly one barber).
-- Recreate after `supabase db reset` with:
--   docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < supabase/dev-barber.sql
-- Login: barber@teste.com / barber1234, with its own barber row "Barber Teste". Idempotent; needs the seed shop.
begin;
-- barber teste: local login for the barber screens (barber@teste.com / barber1234), with its own new barber row.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
  'barber@teste.com', extensions.crypt('barber1234', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Barber Teste"}', now(), now(),
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'email',
  '{"sub":"a0000000-0000-0000-0000-000000000004","email":"barber@teste.com","email_verified":true}', now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

update public.profiles
set role = 'barber', full_name = 'Barber Teste'
where user_id = 'a0000000-0000-0000-0000-000000000004';

insert into public.barbers (id, shop_id, user_id, name, active)
values ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Barber Teste', true)
on conflict (id) do nothing;

insert into public.barber_services (id, shop_id, barber_id, service_id, active, archived_at)
values ('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001', true, null)
on conflict (id) do nothing;

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', weekday, '09:00', '18:00'
from generate_series(1, 6) as weekday
on conflict (shop_id, barber_id, weekday, start_time, end_time) do nothing;

commit;
