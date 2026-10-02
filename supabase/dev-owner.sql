-- Local-only dev owner (not part of seed.sql). Recreate after `supabase db reset` with:
--   docker exec -i supabase_db_barberschedule psql -U postgres -d postgres < supabase/dev-owner.sql
-- Login: owner@teste.com / owner1234. Becomes the owner of the seed shop (shops.owner_user_id is unique,
-- so the seed owner stops owning it). Idempotent; needs the seed shop.
begin;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
  'owner@teste.com', extensions.crypt('owner1234', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Owner Teste"}', now(), now(),
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000010', 'email',
  '{"sub":"a0000000-0000-0000-0000-000000000010","email":"owner@teste.com","email_verified":true}', now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

update public.profiles set role = 'owner', full_name = 'Owner Teste' where user_id = 'a0000000-0000-0000-0000-000000000010';
update public.shops set owner_user_id = 'a0000000-0000-0000-0000-000000000010' where id = 'a1000000-0000-0000-0000-000000000001';
commit;
