begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 't28-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 't28-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'a2000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'barber' where user_id = 'a2000000-0000-0000-0000-0000000000a2';

insert into public.shops (id, name, owner_user_id) values ('a2100000-0000-0000-0000-000000000001', 'T28 Shop', 'a2000000-0000-0000-0000-0000000000a1');

insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, chair_rental_amount_cents, chair_rental_frequency)
values
  ('a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-0000000000a2', 'Chair Barber', 'chair_rental', 0, 30000, 'monthly'),
  ('a2200000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000001', null, 'Commission Barber', 'commission', 40, null, null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-0000000000a1', true);

select is(
  (select amount_cents from public.record_rent_payment('a2200000-0000-0000-0000-000000000001', 5000, current_date, 'first half')),
  5000, 'the owner records a chair rent payment'
);
select is(
  (select barber_name from public.list_rent_payments(current_date - 1, current_date + 1)),
  'Chair Barber', 'and lists it with the barber name in the period'
);
select is(
  (select count(*)::int from public.list_rent_payments(current_date - 30, current_date - 20)),
  0, 'payments outside the period are not listed'
);
select is(
  (select (b ->> 'rent_paid_cents')::int from jsonb_array_elements(public.get_shop_report(current_date - 1, current_date + 1) -> 'barbers') b where b ->> 'name' = 'Chair Barber'),
  5000, 'the shop report carries the paid rent per barber'
);
select throws_ok($$ select * from public.record_rent_payment('a2200000-0000-0000-0000-000000000002', 1000, current_date) $$, 'P0030', null, 'a commission barber has no rent to pay');
select throws_ok($$ select * from public.record_rent_payment('a2200000-0000-0000-0000-000000000001', 0, current_date) $$, 'P0030', null, 'the amount must be positive');

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-0000000000a2', true);
select throws_ok($$ select * from public.record_rent_payment('a2200000-0000-0000-0000-000000000001', 1000, current_date) $$, 'P0029', null, 'a barber cannot record payments');
select throws_ok($$ select * from public.list_rent_payments(current_date - 1, current_date) $$, 'P0029', null, 'a barber cannot list payments');

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-0000000000a1', true);
select lives_ok(
  $$ select public.delete_rent_payment((select id from public.list_rent_payments(current_date - 1, current_date + 1) limit 1)) $$,
  'the owner removes a mistaken payment'
);
select is((select count(*)::int from public.list_rent_payments(current_date - 1, current_date + 1)), 0, 'and it is gone');

select * from finish();
rollback;
