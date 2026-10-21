begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'agp-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'agp-other@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'fd000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id) values ('fd100000-0000-0000-0000-000000000001', 'Agenda Phone Shop', 'fd000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, phone) values ('fd200000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', null, 'Phone Customer', '11999990001');
insert into public.barbers (id, shop_id, name) values ('fd300000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'Agenda Barber');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('fd400000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('fd500000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001');

insert into public.appointments (
  shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values (
  'fd100000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000001',
  'fd500000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001',
  now() + interval '2 hours', now() + interval '2 hours 30 minutes', now() + interval '2 hours 30 minutes', 'scheduled', 'Cut', 30, 4000, 0
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select customer_phone from public.list_owner_agenda('fd100000-0000-0000-0000-000000000001', current_date - 1, current_date + 2)),
  '11999990001',
  'the owner agenda returns the customer phone'
);
select is(
  (select customer_name from public.list_owner_agenda('fd100000-0000-0000-0000-000000000001', current_date - 1, current_date + 2)),
  'Phone Customer',
  'the existing columns are unchanged'
);

select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select * from public.list_owner_agenda('fd100000-0000-0000-0000-000000000001', current_date - 1, current_date + 2) $$,
  'P0010', null, 'only the shop owner can read the owner agenda'
);

select * from finish();

rollback;
