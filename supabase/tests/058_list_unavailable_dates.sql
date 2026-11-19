begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't58-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't58-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'a8000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('a8100000-0000-0000-0000-000000000001', 'T58 Shop', 'a8000000-0000-0000-0000-000000000001');

insert into public.professionals (id, shop_id, name, lunch_start, lunch_end)
values
  ('a8200000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'T58 One', null, null),
  ('a8200000-0000-0000-0000-000000000002', 'a8100000-0000-0000-0000-000000000001', 'T58 Two', '12:00', '13:00');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('a8300000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 'T58 Customer', 't58-customer@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('a8400000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'T58 Cut', 30, 4000);

insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('a8500000-0000-0000-0000-000000000001', 'a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'a8400000-0000-0000-0000-000000000001');

-- One works Monday-Friday, Two Monday-Saturday, both 09:00-18:00.
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', weekday, '09:00', '18:00' from generate_series(1, 5) as weekday;
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000002', weekday, '09:00', '18:00' from generate_series(1, 6) as weekday;

-- A Monday two weeks from now (ISO weeks start on Monday), so the dates never rot.
select set_config('t58.monday', (date_trunc('week', current_date) + interval '14 days')::date::text, false);

-- Tue: a block of One's all day. Wed: the shop is closed (all-day block on BOTH). Thu: a timed block that covers One's whole day.
-- Fri: a timed block that covers only an hour. Next Sunday: One has an `opening` override on a day off.
insert into public.schedule_overrides (shop_id, professional_id, local_date, kind, start_time, end_time)
values
  ('a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 1, 'block', null, null),
  ('a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 2, 'block', null, null),
  ('a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000002', current_setting('t58.monday')::date + 2, 'block', null, null),
  ('a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 3, 'block', '09:00', '18:00'),
  ('a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 4, 'block', '10:00', '11:00'),
  ('a8100000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 13, 'opening', '10:00', '14:00');

-- Everything below runs as the customer: the function must work for them although they cannot read schedule_overrides.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select array_agg(d - current_setting('t58.monday')::date order by d) from public.list_unavailable_dates('a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date, current_setting('t58.monday')::date + 6) as d),
  array[1, 2, 3, 5, 6],
  'One: block (Tue), shop closed (Wed), a timed block over the whole day (Thu), Saturday and Sunday off; Monday and the partial-block Friday are fine'
);

select is(
  (select array_agg(d - current_setting('t58.monday')::date order by d) from public.list_unavailable_dates('a8200000-0000-0000-0000-000000000002', current_setting('t58.monday')::date, current_setting('t58.monday')::date + 6) as d),
  array[2, 6],
  'Two: only the shop closure (Wed) and Sunday; Monday with a lunch break is a working day'
);

select is(
  (select array_agg(d - current_setting('t58.monday')::date order by d) from public.list_unavailable_dates('a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 7, current_setting('t58.monday')::date + 13) as d),
  array[12],
  'the following week: only Saturday; the Sunday with an opening override is bookable'
);

select is((select count(*)::int from public.schedule_overrides), 0, 'a customer cannot read schedule_overrides');

select is(
  (select count(*)::int from public.get_available_slots('a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 1, 'a8500000-0000-0000-0000-000000000001')),
  0, 'the time list agrees: no times on a blocked day'
);
select is(
  (select count(*)::int from public.get_available_slots('a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 3, 'a8500000-0000-0000-0000-000000000001')),
  0, 'the time list agrees: no times when a timed block covers the whole day'
);
select ok(
  (select count(*) from public.get_available_slots('a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 4, 'a8500000-0000-0000-0000-000000000001')) > 0,
  'the time list agrees: a partial block leaves times on that day'
);

select is(
  (select count(*)::int from public.list_unavailable_dates('a8200000-0000-0000-0000-0000000000ff', current_setting('t58.monday')::date, current_setting('t58.monday')::date + 6)),
  0, 'an unknown professional gives nothing (nothing leaks about whether they exist)'
);
select is(
  (select count(*)::int from public.list_unavailable_dates('a8200000-0000-0000-0000-000000000001', current_setting('t58.monday')::date + 6, current_setting('t58.monday')::date)),
  0, 'an inverted range gives nothing'
);
select throws_ok(
  format($$ select * from public.list_unavailable_dates('a8200000-0000-0000-0000-000000000001', %L::date, %L::date) $$, current_setting('t58.monday'), (current_setting('t58.monday')::date + 121)::text),
  'P0043', 'UNAVAILABLE_DATES_RANGE_TOO_LARGE', 'a range longer than 120 days is rejected'
);
select lives_ok(
  format($$ select * from public.list_unavailable_dates('a8200000-0000-0000-0000-000000000001', %L::date, %L::date) $$, current_setting('t58.monday'), (current_setting('t58.monday')::date + 120)::text),
  'exactly 120 days is allowed'
);

reset role;
set local role anon;
select throws_ok(
  format($$ select * from public.list_unavailable_dates('a8200000-0000-0000-0000-000000000001', %L::date, %L::date) $$, current_setting('t58.monday'), current_setting('t58.monday')),
  '42501', null, 'anonymous callers are refused'
);
reset role;

select * from finish();
rollback;
