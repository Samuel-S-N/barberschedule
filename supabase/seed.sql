begin;

-- Local-only fictional fixtures. These credentials are not valid production secrets.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'seed-owner@example.test', 'password-hash', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Seed Owner"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'seed-customer-a@example.test', 'password-hash', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Seed Customer A"}'),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'seed-customer-b@example.test', 'password-hash', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Seed Customer B"}')
on conflict (id) do nothing;

update public.profiles
set role = 'owner', full_name = 'Seed Owner'
where user_id = 'a0000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, timezone, owner_user_id)
values ('a1000000-0000-0000-0000-000000000001', 'Seed Barber Shop', 'America/Sao_Paulo', 'a0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.barbers (id, shop_id, name, active, archived_at)
values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Seed Barber', true, null),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Archived Barber', false, '2029-01-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.services (id, shop_id, name, duration_minutes, price_cents, active, archived_at)
values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Seed Cut', 30, 4000, true, null),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Archived Service', 45, 5500, false, '2029-01-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.barber_services (id, shop_id, barber_id, service_id, active, archived_at)
values
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', true, null),
  ('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', false, '2029-01-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.customers (id, shop_id, user_id, full_name, email, phone, active, archived_at)
values
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Seed Customer A', 'seed-customer-a@example.test', '+55 11 90000-0001', true, null),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Seed Customer B', 'seed-customer-b@example.test', '+55 11 90000-0002', true, null),
  ('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', null, 'Seed Walk In', 'seed-walkin@example.test', '+55 11 90000-0003', false, '2029-01-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', weekday, '09:00', '18:00'
from generate_series(1, 7) as weekday
on conflict (shop_id, barber_id, weekday, start_time, end_time) do nothing;

insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, status, source, notes,
  service_name_snapshot, service_duration_minutes_snapshot,
  service_price_cents_snapshot, barber_buffer_minutes_snapshot
) values (
  'a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
  '2030-01-07 12:00:00+00', '2030-01-07 12:30:00+00', '2030-01-07 12:30:00+00',
  'scheduled', 'customer', 'Seed appointment', 'Seed Cut', 30, 4000, 0
)
on conflict (id) do nothing;

insert into public.recurrence_series (
  id, shop_id, customer_id, barber_service_id, local_start_date, local_start_time,
  interval_weeks, special_price_cents
) values (
  'a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001',
  '2030-01-08', '10:00', 1, 3500
)
on conflict (id) do nothing;

insert into public.recurrence_conflicts (id, series_id, occurrence_date, reason)
values ('a8000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', '2030-01-08', 'SLOT_UNAVAILABLE')
on conflict (id) do nothing;

commit;
