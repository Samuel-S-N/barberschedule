begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'staff-owner@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'fa000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$ select public.update_my_staff_profile('Olivia Owner', 'Liv') $$, 'an owner updates the own name and nickname');
select is((select full_name || '/' || nickname from public.profiles where user_id = 'fa000000-0000-0000-0000-000000000001'), 'Olivia Owner/Liv', 'the profile row changed');
select throws_ok($$ select public.update_my_staff_profile('   ', null) $$, 'P0017', null, 'a blank name is rejected');
select throws_ok($$ select public.update_my_staff_profile('Olivia', repeat('x', 31)) $$, 'P0017', null, 'a long nickname is rejected');

select * from finish();

rollback;
