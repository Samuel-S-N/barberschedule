begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't45-owner@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'b2000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id, timezone)
values ('b2100000-0000-0000-0000-000000000001', 'T45 Shop', 'b2000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

-- A: weekly, last due date 3 days ago (L = today - 3).   C: 40%, no schedule.
-- D: weekly, due today.   E: weekly, tracking started yesterday, first due date still ahead.
-- F: monthly on the day of the month of 3 days ago.
insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, payout_schedule, payout_day_1, payout_tracking_start)
values
  ('b2200000-0000-0000-0000-00000000000a', 'b2100000-0000-0000-0000-000000000001', null, 'Barber A', 'commission', 50, 'weekly', extract(dow from pg_temp.today() - 3)::smallint, pg_temp.today() - 20),
  ('b2200000-0000-0000-0000-00000000000c', 'b2100000-0000-0000-0000-000000000001', null, 'Barber C', 'commission', 40, 'none', null, pg_temp.today() - 20),
  ('b2200000-0000-0000-0000-00000000000d', 'b2100000-0000-0000-0000-000000000001', null, 'Barber D', 'commission', 50, 'weekly', extract(dow from pg_temp.today())::smallint, pg_temp.today() - 20),
  ('b2200000-0000-0000-0000-00000000000e', 'b2100000-0000-0000-0000-000000000001', null, 'Barber E', 'commission', 50, 'weekly', extract(dow from pg_temp.today() - 3)::smallint, pg_temp.today() - 1),
  ('b2200000-0000-0000-0000-00000000000f', 'b2100000-0000-0000-0000-000000000001', null, 'Barber F', 'commission', 50, 'monthly', extract(day from pg_temp.today() - 3)::smallint, pg_temp.today() - 20);

insert into public.customers (id, shop_id, full_name, email)
values ('b2300000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'T45 Customer', 't45-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b2400000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
select gen_random_uuid(), 'b2100000-0000-0000-0000-000000000001', b.id, 'b2400000-0000-0000-0000-000000000001'
from public.barbers b where b.shop_id = 'b2100000-0000-0000-0000-000000000001';

-- One completed 100,00 cut `back` days ago at 12:00 shop time.
create function pg_temp.appt(who uuid, back integer) returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'b2100000-0000-0000-0000-000000000001', who, 'b2300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
    ((pg_temp.today() - back)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo',
    ((pg_temp.today() - back)::timestamp + interval '12 hours 30 minutes') at time zone 'America/Sao_Paulo',
    ((pg_temp.today() - back)::timestamp + interval '12 hours 30 minutes') at time zone 'America/Sao_Paulo',
    'completed', 'Cut', 30, 10000, 0
  from public.barber_services bs where bs.barber_id = who
$$;

-- A: two cuts before L (2 x 5000 = 10000) and two after (10000). C: 4000. D: one before today, one today.
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 10);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 5);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 2);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 0);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000c', 2);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000d', 10);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000d', 0);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000e', 1);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000f', 5);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000f', 2);

create function pg_temp.split(who uuid) returns text language sql as $$
  select (prior_open_cents, current_open_cents)::text from public.get_payout_overview() where barber_id = who
$$;
create function pg_temp.status_of(who uuid) returns text language sql as $$
  select status from public.get_payout_overview() where barber_id = who
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);

-- A: what was earned before the last due date is "previous period", the rest is the current one.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(10000,10000)', 'A: previous period and current period are split at the last due date');
select is((select period_start from public.get_payout_overview() where barber_id = 'b2200000-0000-0000-0000-00000000000a'), pg_temp.today() - 3, 'A: the current period started on the due date');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000a'), 'pending', 'A: an unpaid previous period past its due date is pending');

select is((select amount_cents from public.record_barber_payout('b2200000-0000-0000-0000-00000000000a', 4000, pg_temp.today(), null)), 4000, 'the owner records a partial payment');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(6000,10000)', 'A: a partial payment reduces the oldest (previous) period first');

select lives_ok($$ select * from public.record_barber_payout('b2200000-0000-0000-0000-00000000000a', 6000, pg_temp.today(), null) $$, 'the owner pays the rest of the previous period');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(0,10000)', 'A: once the previous period is paid only the current one remains');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000a'), 'ok', 'A: nothing left from the previous period is ok');

select lives_ok($$ select * from public.record_barber_payout('b2200000-0000-0000-0000-00000000000a', 12000, pg_temp.today(), null) $$, 'paying beyond what was earned is allowed');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(0,-2000)', 'A: the surplus makes the current period negative (overpaid)');

-- C: no schedule has no periods.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000c'), '(0,4000)', 'C: without a schedule everything is the current balance');
select is((select period_start from public.get_payout_overview() where barber_id = 'b2200000-0000-0000-0000-00000000000c'), null::date, 'C: and there is no period start');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000c'), 'no_schedule', 'C: status stays no_schedule');

-- D: due today, the period that closes today is the previous one (today opens a new period).
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000d'), '(5000,5000)', 'D: on the due date the closed period is owed and today already counts in the new one');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000d'), 'due_today', 'D: due today while the previous period is open');

reset role;
select is(
  array(select barber_name from public.payout_due_barbers('b2100000-0000-0000-0000-000000000001', pg_temp.today()) order by 1),
  array['Barber D'], 'only D is a reminder candidate today: it owes a closed period'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);

select lives_ok($$ select * from public.record_barber_payout('b2200000-0000-0000-0000-00000000000d', 5000, pg_temp.today(), null) $$, 'the owner pays D''s closed period in full');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000d'), '(0,5000)', 'D: the new period starts counting after the full payment');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000d'), 'ok', 'D: and the due flag clears');

-- E: before the first due date everything is the current period.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000e'), '(0,5000)', 'E: before the first due date there is no previous period');

-- F: monthly follows the same rule.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000f'), '(5000,5000)', 'F: a monthly schedule splits at its last due date');

select * from finish();
rollback;
