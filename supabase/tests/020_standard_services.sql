begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't20-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't20-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't20-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ab000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't20-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'ab000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('ab000000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('ab100000-0000-0000-0000-000000000001', 'T20 Shop', 'ab000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('ab200000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002', 'Barber A'),
  ('ab200000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.services (id, shop_id, name, duration_minutes, price_cents, active, archived_at)
values
  ('ab300000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000001', 'Cut', 30, 4000, true, null),
  ('ab300000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000001', 'Beard', 20, 2500, true, null),
  ('ab300000-0000-0000-0000-000000000003', 'ab100000-0000-0000-0000-000000000001', 'Retired', 15, 1000, false, now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::int from public.list_my_service_options()), 2, 'a barber lists the active services of the shop, not archived ones');
select is((select count(*)::int from public.list_my_service_options() where enabled), 0, 'nothing is enabled before the owner marks a standard service');

-- the owner marks Cut as standard
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000001', true);
update public.services set is_standard = true where id = 'ab300000-0000-0000-0000-000000000001';

reset role;
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  2, 'marking a service standard activates it for every active barber'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', true);
select is(
  (select enabled and is_standard from public.list_my_service_options() where service_name = 'Cut'),
  true, 'the standard service shows as enabled and standard'
);

select is((select enabled from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000002', true)), true, 'a barber turns an optional service on');
select throws_ok(
  $$ select * from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000001', false) $$,
  'P0026', null, 'a barber cannot turn a standard service off'
);
select is((select enabled from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000002', false)), false, 'a barber turns an optional service off');
select throws_ok(
  $$ select * from public.set_my_service_enabled('ab300000-0000-0000-0000-000000000003', true) $$,
  'P0004', null, 'an archived service cannot be enabled'
);

reset role;
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000002' and barber_id = 'ab200000-0000-0000-0000-000000000002'),
  0, 'a barber''s choice never touches another barber''s rows'
);

-- a new barber inherits the standard services
insert into public.barbers (id, shop_id, name)
values ('ab200000-0000-0000-0000-000000000003', 'ab100000-0000-0000-0000-000000000001', 'Barber C');
select is(
  (select count(*)::int from public.barber_services where barber_id = 'ab200000-0000-0000-0000-000000000003' and service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  1, 'a new barber inherits the standard services'
);

-- re-marking reactivates a row the owner had archived
update public.barber_services set active = false, archived_at = now()
where barber_id = 'ab200000-0000-0000-0000-000000000002' and service_id = 'ab300000-0000-0000-0000-000000000001';
update public.services set is_standard = false where id = 'ab300000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  2, 'unmarking standard leaves existing rows as they are'
);
update public.services set is_standard = true where id = 'ab300000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.barber_services where service_id = 'ab300000-0000-0000-0000-000000000001' and active),
  3, 'marking standard again reactivates archived rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select * from public.list_my_service_options() $$, 'P0019', null, 'a customer cannot list barber service options');

select * from finish();
rollback;
