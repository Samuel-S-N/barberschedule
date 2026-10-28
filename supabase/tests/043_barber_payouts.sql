begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- Dates follow the shop's local calendar (America/Sao_Paulo), not the UTC session date, so the test does not depend on the hour it runs.
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Pure date rules (run as the table owner, before switching roles).
select is(
  array(select d from public.payout_due_dates('weekly', 1::smallint, null, '2026-10-26', '2026-11-08') d),
  array['2026-10-26'::date, '2026-11-02'],
  'weekly on Mondays'
);
select is(
  array(select d from public.payout_due_dates('monthly', 31::smallint, null, '2027-02-01', '2027-02-28') d),
  array['2027-02-28'::date],
  'monthly day 31 falls on the last day of a short month'
);
select is(
  array(select d from public.payout_due_dates('monthly', 31::smallint, null, '2028-02-01', '2028-02-29') d),
  array['2028-02-29'::date],
  'and on the 29th in a leap February'
);
select is(
  array(select d from public.payout_due_dates('biweekly', 15::smallint, 31::smallint, '2026-04-01', '2026-04-30') d),
  array['2026-04-15'::date, '2026-04-30'],
  'biweekly 15 and 31 in a 30-day month'
);
select is(
  (select count(*)::int from public.payout_due_dates('biweekly', 29::smallint, 31::smallint, '2027-02-01', '2027-02-28')),
  1, 'two days that both clamp to the same date collapse into one'
);
select is(
  (select count(*)::int from public.payout_due_dates('none', null, null, '2026-01-01', '2026-12-31')),
  0, 'no schedule means no due dates'
);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't43-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't43-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'b0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'b0000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id, timezone)
values ('b0100000-0000-0000-0000-000000000001', 'T43 Shop', 'b0000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

-- A: commission 50, tracking since 20 days ago. C: commission 40 without a schedule. R: chair rental.
insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, chair_rental_amount_cents, chair_rental_frequency, payout_tracking_start)
values
  ('b0200000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Barber A', 'commission', 50, null, null, pg_temp.today() - 20),
  ('b0200000-0000-0000-0000-000000000002', 'b0100000-0000-0000-0000-000000000001', null, 'Barber C', 'commission', 40, null, null, pg_temp.today() - 20),
  ('b0200000-0000-0000-0000-000000000003', 'b0100000-0000-0000-0000-000000000001', null, 'Barber R', 'chair_rental', 0, 30000, 'monthly', null);

insert into public.customers (id, shop_id, full_name, email)
values ('b0300000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'T43 Customer', 't43-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b0400000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('b0500000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'b0200000-0000-0000-0000-000000000001', 'b0400000-0000-0000-0000-000000000001');

create function pg_temp.appt(back integer, appt_status public.appointment_status)
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'b0100000-0000-0000-0000-000000000001', 'b0200000-0000-0000-0000-000000000001', 'b0300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
    ((current_date - back)::timestamp + interval '15 hours') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    appt_status, 'Cut', 30, 10000, 0
  from public.barber_services bs where bs.barber_id = 'b0200000-0000-0000-0000-000000000001'
$$;

-- A earned 2 x 100,00 x 50% = 10000 from completed work; a past appointment nobody closed does not count.
select pg_temp.appt(10, 'completed');
select pg_temp.appt(2, 'completed');
select pg_temp.appt(5, 'confirmed');
select pg_temp.appt(-3, 'scheduled');

-- Weekly schedule whose last due date was exactly 3 days ago.
update public.barbers set payout_schedule = 'weekly', payout_day_1 = extract(dow from pg_temp.today() - 3)::smallint
where id = 'b0200000-0000-0000-0000-000000000001';

create function pg_temp.row_a() returns public.barbers language sql as $$
  select * from public.barbers where id = 'b0200000-0000-0000-0000-000000000001'
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

select is((select balance_cents from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 10000, 'balance counts only completed appointments');
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 'pending', 'a passed due date with no payout since is pending');
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000002'), 'no_schedule', 'a barber without a schedule has no status pressure');
select is((select count(*)::int from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000003'), 0, 'chair-rental barbers are not part of payouts');

select is(
  (select amount_cents from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 3000, pg_temp.today() - 1, 'first part')),
  3000, 'the owner records a partial payout'
);
select is((select balance_cents from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 7000, 'the balance drops by what was paid');
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 'ok', 'a payout after the last due date clears the pending flag');

select is(
  (select amount_cents from public.record_barber_payout('b0200000-0000-0000-0000-000000000002', 1500, pg_temp.today(), null)),
  1500, 'a one-off payout works for a barber without a schedule'
);
select throws_ok($$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000003', 1000, pg_temp.today()) $$, 'P0040', null, 'a chair-rental barber has no payout');
select throws_ok($$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 0, pg_temp.today()) $$, 'P0040', null, 'the amount must be positive');
select is(
  (select count(*)::int from public.list_barber_payouts(pg_temp.today() - 30, pg_temp.today() + 1)),
  2, 'both payouts are listed with the barber names'
);

-- Today becomes the due date: nothing paid since today yet.
reset role;
update public.barbers set payout_day_1 = extract(dow from pg_temp.today())::smallint where id = 'b0200000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 'due_today', 'due today while there is a balance and no payout dated today');

select lives_ok(
  $$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 9000, pg_temp.today()) $$,
  'paying more than the balance is allowed'
);
select is((select balance_cents from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), -2000, 'the surplus shows as a negative balance');

select throws_ok(
  $$ select public.set_barber_payout_schedule('b0200000-0000-0000-0000-000000000001', 'biweekly', 20::smallint, 5::smallint, null) $$,
  'P0039', null, 'biweekly days must be ascending'
);
select throws_ok(
  $$ select public.set_barber_payout_schedule('b0200000-0000-0000-0000-000000000001', 'weekly', 7::smallint, null, null) $$,
  'P0039', null, 'the weekday is 0 to 6'
);
select throws_ok(
  $$ select public.set_barber_payout_schedule('b0200000-0000-0000-0000-000000000003', 'monthly', 5::smallint, null, null) $$,
  'P0039', null, 'a chair-rental barber cannot get a payout schedule'
);

select lives_ok(
  $$ select public.delete_barber_payout((select id from public.list_barber_payouts(pg_temp.today() - 30, pg_temp.today() + 1) where amount_cents = 9000)) $$,
  'the owner removes a mistaken payout'
);

-- The barber's own view: balance and payouts, no gross revenue.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);
select is(
  (select (public.get_my_payout_summary() ->> 'balance_cents')::int),
  7000, 'the barber sees what is left to receive'
);
select is(
  (select (public.get_my_payout_summary() ->> 'past_unmarked_count')::int),
  1, 'and how many past appointments still lack a close-out'
);
select throws_ok($$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 1000, pg_temp.today()) $$, 'P0029', null, 'a barber cannot record payouts');

select * from finish();
rollback;
