begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't14-owner@example.com', 'password-hash', now(), '{"full_name":"T14 Owner"}'),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't14-customer@example.com', 'password-hash', now(), '{"full_name":"T14 Customer"}'),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't14-other@example.com', 'password-hash', now(), '{"full_name":"T14 Other"}');

update public.profiles set role = 'owner' where user_id = '80000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, owner_user_id)
values ('81000000-0000-0000-0000-000000000001', 'T14 Shop', '80000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.ensure_my_customer();

select is(
  (select avatar_path from public.set_my_avatar('80000000-0000-0000-0000-000000000002/avatar-1.jpg')),
  '80000000-0000-0000-0000-000000000002/avatar-1.jpg',
  'set_my_avatar stores a path inside the caller''s own folder');
select is(
  (select avatar_path from public.get_current_profile()),
  '80000000-0000-0000-0000-000000000002/avatar-1.jpg',
  'get_current_profile returns avatar_path');
select throws_ok(
  $$ select public.set_my_avatar('80000000-0000-0000-0000-000000000003/avatar-1.jpg') $$,
  'P0017', null, 'a path in another user''s folder is rejected');
select throws_ok(
  $$ select public.set_my_avatar('http://evil.example/storage/v1/object/public/avatars/80000000-0000-0000-0000-000000000002/avatar-1.jpg') $$,
  'P0017', null, 'a url (any host) is rejected');
select throws_ok($$ select public.set_my_avatar('80000000-0000-0000-0000-000000000002/../80000000-0000-0000-0000-000000000003/avatar-1.jpg') $$, 'P0017', null, 'a traversal path is rejected');
select is((select avatar_path from public.set_my_avatar(null)), null, 'null clears the avatar');

-- storage policies
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '80000000-0000-0000-0000-000000000002/avatar-2.jpg') $$,
  'a user can upload into their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '80000000-0000-0000-0000-000000000003/avatar-2.jpg') $$,
  '42501', null, 'a user cannot upload into another user''s folder');

-- anon
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$ select public.set_my_avatar(null) $$, '42501', null, 'anonymous callers cannot set an avatar');

-- e-mail sync
reset role;
update auth.users set email = 't14-renamed@example.com' where id = '80000000-0000-0000-0000-000000000002';
select is((select email from public.customers where user_id = '80000000-0000-0000-0000-000000000002'), 't14-renamed@example.com', 'changing the login e-mail syncs customers.email');
update auth.users set raw_user_meta_data = '{"full_name":"T14 Customer"}' where id = '80000000-0000-0000-0000-000000000002';
select is((select email from public.customers where user_id = '80000000-0000-0000-0000-000000000002'), 't14-renamed@example.com', 'unrelated auth updates leave customers.email alone');

select * from finish();
rollback;
