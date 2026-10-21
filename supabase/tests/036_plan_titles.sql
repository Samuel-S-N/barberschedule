begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'titles-owner@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'fa000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id) values ('fa100000-0000-0000-0000-000000000001', 'Titles Shop', 'fa000000-0000-0000-0000-000000000001');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('fa400000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'Titles Cut', 30, 3500);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', true);

select throws_ok($$ select public.save_recurrence_plan(null, 'fa400000-0000-0000-0000-000000000001', 1, 2500, null, true) $$, 'P0034', null, 'a plan needs a title');
select throws_ok($$ select public.save_recurrence_plan(null, 'fa400000-0000-0000-0000-000000000001', 1, 2500, '   ', true) $$, 'P0034', null, 'a blank title is not a title');
select lives_ok($$ select public.save_recurrence_plan(null, 'fa400000-0000-0000-0000-000000000001', 1, 2500, ' Corte mensal ', true) $$, 'a titled plan is saved');
select is((select name from public.list_recurrence_plans('fa100000-0000-0000-0000-000000000001') limit 1), 'Corte mensal', 'the title is trimmed and listed');

select * from finish();

rollback;
