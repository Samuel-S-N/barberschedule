begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't15-owner@example.com', 'password-hash', now(), '{"full_name":"T15 Owner"}'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't15-customer@example.com', 'password-hash', now(), '{"full_name":"T15 Customer","nickname":"  Bia  "}'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't15-long@example.com', 'password-hash', now(), ('{"full_name":"T15 Long","nickname":"' || repeat('x', 40) || '"}')::jsonb);

update public.profiles set role = 'owner' where user_id = '90000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, owner_user_id)
values ('91000000-0000-0000-0000-000000000001', 'T15 Shop', '90000000-0000-0000-0000-000000000001');

select is((select nickname from public.profiles where user_id = '90000000-0000-0000-0000-000000000002'), 'Bia', 'signup metadata sets a trimmed nickname');
select is((select length(nickname) from public.profiles where user_id = '90000000-0000-0000-0000-000000000003'), 30, 'an over-long signup nickname is cut instead of failing the signup');
select is((select nickname from public.profiles where user_id = '90000000-0000-0000-0000-000000000001'), null, 'no nickname metadata leaves it empty');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.ensure_my_customer();

select is((select full_name from public.update_my_profile('T15 Renamed', '(11)91234-5678', 'Bibi')), 'T15 Renamed', 'update_my_profile still returns the customer row');
select is((select nickname from public.profiles where user_id = '90000000-0000-0000-0000-000000000002'), 'Bibi', 'update_my_profile saves the nickname');
select public.update_my_profile('T15 Renamed', null, '   ');
select is((select nickname from public.profiles where user_id = '90000000-0000-0000-0000-000000000002'), null, 'a blank nickname clears it');
select throws_ok($$ select public.update_my_profile('T15 Renamed', null, repeat('x', 31)) $$, 'P0017', null, 'a nickname over 30 characters is rejected');
select lives_ok($$ select public.update_my_profile('T15 Renamed', null) $$, 'the two-argument form still works');

select * from finish();
rollback;
