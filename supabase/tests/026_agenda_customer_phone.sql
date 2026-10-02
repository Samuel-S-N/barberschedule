begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't26-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't26-barber@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't26-account@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = '91000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = '91000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id) values ('92000000-0000-0000-0000-000000000001', 'T26 Shop', '91000000-0000-0000-0000-000000000001');
insert into public.barbers (id, shop_id, user_id, name) values ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'Barber');
insert into public.services (id, shop_id, name, duration_minutes, price_cents) values ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id) values ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001');

insert into public.customers (id, shop_id, user_id, full_name, email, phone, created_by_barber_id)
values
  ('96000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', null, 'No Account', null, '11999990001', '93000000-0000-0000-0000-000000000001'),
  ('96000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003', 'Has Account', 't26-account@example.com', '11999990002', null);

insert into public.appointments (
  shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
) select '92000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', c,
  '95000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001',
  now() + interval '2 hours' + (n * interval '1 hour'), now() + interval '2 hours 30 minutes' + (n * interval '1 hour'), now() + interval '2 hours 30 minutes' + (n * interval '1 hour'),
  'scheduled', 'Cut', 30, 4000, 0
from (values ('96000000-0000-0000-0000-000000000001'::uuid, 0), ('96000000-0000-0000-0000-000000000002'::uuid, 1)) v(c, n);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select customer_phone from public.list_my_barber_agenda(current_date - 1, current_date + 2) where customer_name = 'No Account'),
  '11999990001', 'an account-less customer''s phone is returned for the reminder link'
);
select is(
  (select customer_phone from public.list_my_barber_agenda(current_date - 1, current_date + 2) where customer_name = 'Has Account'),
  null, 'a customer with an account gets push, so no phone is exposed'
);

select * from finish();
rollback;
