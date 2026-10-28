begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
create function pg_temp.at_local(h integer, m integer) returns timestamptz language sql as $$
  select (pg_temp.today()::timestamp + make_interval(hours => h, mins => m)) at time zone 'America/Sao_Paulo'
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't44-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't44-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'b1000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'b1000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id, timezone)
values ('b1100000-0000-0000-0000-000000000001', 'T44 Shop', 'b1000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

-- A (has an account, earns money) and B (no account, no earnings) are both due today.
insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, payout_schedule, payout_day_1, payout_tracking_start)
values
  ('b1200000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'Barber A', 'commission', 50, 'weekly', extract(dow from pg_temp.today())::smallint, pg_temp.today() - 20),
  ('b1200000-0000-0000-0000-000000000002', 'b1100000-0000-0000-0000-000000000001', null, 'Barber B', 'commission', 40, 'weekly', extract(dow from pg_temp.today())::smallint, pg_temp.today() - 20);

insert into public.customers (id, shop_id, full_name, email)
values ('b1300000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'T44 Customer', 't44-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b1400000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('b1500000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-000000000001', 'b1400000-0000-0000-0000-000000000001');

insert into public.appointments (
  shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
)
select
  'b1100000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-000000000001', 'b1300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
  ((current_date - 2)::timestamp + interval '15 hours') at time zone 'UTC',
  ((current_date - 2)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
  ((current_date - 2)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
  'completed', 'Cut', 30, 10000, 0
from public.barber_services bs where bs.barber_id = 'b1200000-0000-0000-0000-000000000001';

-- The job (runs as the table owner, like pg_cron).
select is(public.enqueue_payout_due_notifications(pg_temp.at_local(7, 0)), 0, 'nothing is sent before 08:00 shop time');
select is(public.enqueue_payout_due_notifications(pg_temp.at_local(8, 30)), 1, 'one notification for the owner after 08:00');
select is(
  (select (params ->> 'count')::int from public.notifications where kind = 'payout_due' and user_id = 'b1000000-0000-0000-0000-000000000001'),
  1, 'it counts only barbers with a balance (B has nothing to receive)'
);
select is(
  (select count(*)::int from public.notification_outbox where event_type = 'payout.due' and recipient_user_id = 'b1000000-0000-0000-0000-000000000001'),
  1, 'and queues the push'
);
select is(public.enqueue_payout_due_notifications(pg_temp.at_local(9, 30)), 0, 'running again the same day creates nothing');

select is((select count(*)::int from public.payout_due_barbers('b1100000-0000-0000-0000-000000000001', pg_temp.today())), 1, 'A is due before being paid');

-- The owner pays A and B.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((select amount_cents from public.record_barber_payout('b1200000-0000-0000-0000-000000000001', 1000, pg_temp.today())), 1000, 'the owner pays A');
reset role;

select is((select count(*)::int from public.payout_due_barbers('b1100000-0000-0000-0000-000000000001', pg_temp.today())), 0, 'a barber already paid today is no longer due');
select is(
  (select (params ->> 'amount_cents')::int from public.notifications where kind = 'payout_paid' and user_id = 'b1000000-0000-0000-0000-000000000002'),
  1000, 'A is told about the payout'
);
select is(
  (select count(*)::int from public.notification_outbox where event_type = 'payout.paid' and recipient_user_id = 'b1000000-0000-0000-0000-000000000002'),
  1, 'with a push'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select public.record_barber_payout('b1200000-0000-0000-0000-000000000002', 500, pg_temp.today());
select public.delete_barber_payout((select id from public.list_barber_payouts(pg_temp.today() - 1, pg_temp.today() + 1) where amount_cents = 1000));
reset role;

select is((select count(*)::int from public.notifications where kind = 'payout_paid'), 1, 'a barber without an account and a deleted payout produce no extra notification');

select * from finish();
rollback;
