begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't16-owner@example.com', 'password-hash', now(), '{"full_name":"T16 Owner"}'),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't16-customer@example.com', 'password-hash', now(), '{"full_name":"T16 Customer"}');

update public.profiles set role = 'owner' where user_id = '93000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, owner_user_id)
values ('94000000-0000-0000-0000-000000000001', 'T16 Shop', '93000000-0000-0000-0000-000000000001');

-- owner writes hours with a lunch break
set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$ select public.set_shop_hours('[{"weekday":1,"start":"09:00","end":"12:00"},{"weekday":1,"start":"13:00","end":"18:00"}]'::jsonb) $$, 'owner can set hours with a break');
select is((select count(*)::int from public.shop_hours), 2, 'both periods are stored');
select throws_ok($$ select public.set_shop_hours('[{"weekday":2,"start":"09:00","end":"12:00"},{"weekday":2,"start":"11:00","end":"13:00"}]'::jsonb) $$, 'P0023', null, 'overlapping periods are rejected');
select is((select count(*)::int from public.shop_hours), 2, 'a rejected call leaves the previous hours untouched');
select throws_ok($$ select public.set_shop_hours('[{"weekday":9,"start":"09:00","end":"12:00"}]'::jsonb) $$, 'P0023', null, 'a weekday outside 1..7 is rejected');
select throws_ok($$ select public.set_shop_hours('[{"weekday":1,"start":"18:00","end":"09:00"}]'::jsonb) $$, 'P0023', null, 'an end before the start is rejected');
select lives_ok($$ update public.shops set address = 'Rua A, 10', phone = '(11) 3000-0000', whatsapp = '(11) 99999-0000' where id = '94000000-0000-0000-0000-000000000001' $$, 'owner updates contact info');

-- customer can read, cannot write
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.shop_hours), 2, 'a customer can read the hours');
select is((select address from public.shops where id = '94000000-0000-0000-0000-000000000001'), 'Rua A, 10', 'a customer can read the address');
select throws_ok($$ select public.set_shop_hours('[]'::jsonb) $$, '42501', null, 'a non-owner cannot set hours');

-- anonymous can read too
reset role;
set local role anon;
select is((select count(*)::int from public.shop_hours), 2, 'anon can read the hours');
select is((select phone from public.shops where id = '94000000-0000-0000-0000-000000000001'), '(11) 3000-0000', 'anon can read the phone');

select * from finish();
rollback;
