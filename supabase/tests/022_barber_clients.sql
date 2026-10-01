begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't22-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't22-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't22-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't22-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'ad000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('ad000000-0000-0000-0000-000000000002', 'ad000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('ad100000-0000-0000-0000-000000000001', 'T22 Shop', 'ad000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('ad200000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000002', 'Barber A'),
  ('ad200000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.customers (id, shop_id, full_name, email, phone, created_by_barber_id)
values
  ('ad300000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'Old Client', 'old@example.com', '11911110001', null),
  ('ad300000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'Recent Client', 'recent@example.com', '11922220002', null),
  ('ad300000-0000-0000-0000-000000000003', 'ad100000-0000-0000-0000-000000000001', 'Other Barber Client', 'other@example.com', '11933330003', null),
  ('ad300000-0000-0000-0000-000000000004', 'ad100000-0000-0000-0000-000000000001', 'Created Only', null, '11944440004', 'ad200000-0000-0000-0000-000000000001'),
  ('ad300000-0000-0000-0000-000000000005', 'ad100000-0000-0000-0000-000000000001', 'Returning Old', 'returning@example.com', null, null);

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values
  ('ad400000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'Cut', 30, 4000),
  ('ad400000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'Beard', 30, 3000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('ad500000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'ad200000-0000-0000-0000-000000000001', 'ad400000-0000-0000-0000-000000000001'),
  ('ad500000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'ad200000-0000-0000-0000-000000000001', 'ad400000-0000-0000-0000-000000000002'),
  ('ad500000-0000-0000-0000-000000000003', 'ad100000-0000-0000-0000-000000000001', 'ad200000-0000-0000-0000-000000000002', 'ad400000-0000-0000-0000-000000000001');

-- one appointment `back` days ago (negative = in the future) at 15:00 UTC, shifted by `hours` to avoid overlaps
create function pg_temp.appt(barber uuid, customer uuid, service_name text, status public.appointment_status, back integer, hours integer default 0)
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'ad100000-0000-0000-0000-000000000001', barber, customer, bs.id, bs.service_id,
    ((current_date - back)::timestamp + interval '15 hours' + hours * interval '1 hour') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes' + hours * interval '1 hour') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes' + hours * interval '1 hour') at time zone 'UTC',
    status, service_name, 30, 4000, 0
  from public.barber_services bs
  join public.services s on s.id = bs.service_id
  where bs.barber_id = barber and s.name = service_name
$$;

select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000001', 'Cut', 'completed', 60);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000001', 'Cut', 'completed', 70);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000002', 'Beard', 'completed', 3);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000002', 'Cut', 'completed', 10);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000002', 'Cut', 'no_show', 20);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000005', 'Cut', 'completed', 90);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000005', 'Cut', 'scheduled', -2);
select pg_temp.appt('ad200000-0000-0000-0000-000000000002', 'ad300000-0000-0000-0000-000000000003', 'Cut', 'completed', 5);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::int from public.list_my_customers()), 4, 'a barber lists the clients they served or created');
select is((select count(*)::int from public.list_my_customers() where full_name = 'Other Barber Client'), 0, 'another barber''s client is never listed');
select is((select full_name from public.list_my_customers() limit 1), 'Recent Client', 'clients are ordered by last visit, newest first');
select is((select full_name from (select * from public.list_my_customers()) l order by last_visit_at desc nulls last offset 3 limit 1), 'Created Only', 'a client with no visit yet comes last');
select is((select visits from public.list_my_customers() where full_name = 'Recent Client'), 2, 'visits count completed appointments with this barber');
select is((select is_lapsed from public.list_my_customers() where full_name = 'Old Client'), true, 'no visit in 45+ days and nothing booked is lapsed');
select is((select is_lapsed from public.list_my_customers() where full_name = 'Returning Old'), false, 'an upcoming appointment means not lapsed');
select is((select count(*)::int from public.list_my_customers(only_lapsed => true)), 1, 'the lapsed filter returns only lapsed clients');
select is((select count(*)::int from public.list_my_customers(search => 'recent')), 1, 'search matches the name');
select is((select count(*)::int from public.list_my_customers(search => '1111')), 1, 'search matches phone digits');

select is(
  (public.get_my_customer('ad300000-0000-0000-0000-000000000002') -> 'stats') ->> 'favorite_service',
  'Beard', 'the favourite service breaks ties by name'
);
select is(
  jsonb_array_length(public.get_my_customer('ad300000-0000-0000-0000-000000000002') -> 'history'),
  3, 'the history lists this barber''s appointments with the client'
);

select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', ' Likes a low fade ');
select is(public.get_my_customer('ad300000-0000-0000-0000-000000000002') ->> 'note', 'Likes a low fade', 'a private note is saved trimmed');
select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', '   ');
select is(public.get_my_customer('ad300000-0000-0000-0000-000000000002') -> 'note', 'null'::jsonb, 'a blank note clears it');
select throws_ok(
  $$ select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', repeat('x', 501)) $$,
  'P0028', null, 'a note over 500 characters is rejected'
);

select set_config('request.jwt.claim.sub', 'ad000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.get_my_customer('ad300000-0000-0000-0000-000000000002') $$,
  'P0007', null, 'a barber cannot open another barber''s client'
);
select throws_ok(
  $$ select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', 'sneaky') $$,
  'P0007', null, 'a barber cannot write a note on another barber''s client'
);

select set_config('request.jwt.claim.sub', 'ad000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select * from public.list_my_customers() $$, 'P0019', null, 'a customer cannot list clients');

select * from finish();
rollback;
