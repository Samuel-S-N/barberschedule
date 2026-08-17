begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'task9-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'task9-customer@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'task9-other-owner@example.com', 'password-hash', now());

update public.profiles set role = 'owner'
where user_id in ('80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values
  ('81000000-0000-0000-0000-000000000001', 'Task 9 Shop', '80000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-000000000002', 'Task 9 Other Shop', '80000000-0000-0000-0000-000000000003');

insert into public.barbers (id, shop_id, name)
values ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Task 9 Barber');

insert into public.customers (id, shop_id, user_id, full_name, email, phone)
values
  ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'Weekly Customer', 'weekly@example.com', '+55 11 99999-0001'),
  ('83000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', null, 'Biweekly Customer', 'biweekly@example.com', '+55 11 99999-0002'),
  ('83000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000001', null, 'Every Three Weeks', 'three@example.com', '+55 11 99999-0003'),
  ('83000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', null, 'Conflict Customer', 'conflict@example.com', '+55 11 99999-0004');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('84000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Task 9 Cut', 30, 4000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('85000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, barber_id, weekday, start_time, end_time)
select '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', weekday, '08:00', '18:00'
from generate_series(1, 7) as weekday;

select set_config('task9.start_date', ((clock_timestamp() at time zone 'America/Sao_Paulo')::date + 1)::text, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('task9.weekly_series', (select id::text from public.create_recurrence_series(
  '83000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date, '09:00', 1, 3500
)), false);

select set_config('task9.biweekly_series', (select id::text from public.create_recurrence_series(
  '83000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date, '10:00', 2, null
)), false);

select set_config('task9.three_week_series', (select id::text from public.create_recurrence_series(
  '83000000-0000-0000-0000-000000000003', '85000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date, '11:00', 3, null
)), false);

select is(
  (select count(*)::int from public.list_owner_recurrence_series('81000000-0000-0000-0000-000000000001')),
  3,
  'owner may list only this shop recurrence series'
);

select lives_ok(
  $$ select * from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_setting('task9.start_date')::date + 89) $$,
  'owner materializes the rolling 90-day recurrence window'
);

reset role;

select is(
  (select count(*)::int from public.appointments where recurrence_series_id = current_setting('task9.weekly_series')::uuid),
  13,
  'weekly series creates every local weekly occurrence through 90 days'
);

select is(
  (select count(*)::int from public.appointments where recurrence_series_id = current_setting('task9.biweekly_series')::uuid),
  7,
  'biweekly series creates every second local week through 90 days'
);

select is(
  (select count(*)::int from public.appointments where recurrence_series_id = current_setting('task9.three_week_series')::uuid),
  5,
  'every-N-weeks series uses its configured interval'
);

select is(
  (select service_price_cents_snapshot from public.appointments where recurrence_series_id = current_setting('task9.weekly_series')::uuid order by recurrence_occurrence_date limit 1),
  3500,
  'recurrence appointments snapshot the owner special price'
);

select is(
  (select recurrence_occurrence_date from public.appointments where recurrence_series_id = current_setting('task9.weekly_series')::uuid order by recurrence_occurrence_date limit 1),
  current_setting('task9.start_date')::date,
  'occurrence identity remains a shop-local date'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select appointments_created from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_setting('task9.start_date')::date + 89)),
  0,
  'repeating the same window is idempotent'
);

reset role;
select throws_ok(
  $$
    insert into public.appointments (
      shop_id, barber_id, customer_id, barber_service_id, service_id,
      starts_at, ends_at, occupied_until, status, source, notes,
      service_name_snapshot, service_duration_minutes_snapshot,
      service_price_cents_snapshot, barber_buffer_minutes_snapshot,
      recurrence_series_id, recurrence_occurrence_date
    )
    select
      shop_id, barber_id, customer_id, barber_service_id, service_id,
      starts_at + interval '1 day', ends_at + interval '1 day', occupied_until + interval '1 day',
      'cancelled', source, notes, service_name_snapshot,
      service_duration_minutes_snapshot, service_price_cents_snapshot,
      barber_buffer_minutes_snapshot, recurrence_series_id, recurrence_occurrence_date
    from public.appointments
    where recurrence_series_id = current_setting('task9.weekly_series')::uuid
    order by recurrence_occurrence_date
    limit 1
  $$,
  '23505', null,
  'the series/local-date key rejects a duplicate occurrence independently of occupancy'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.cancel_recurrence_occurrence(current_setting('task9.weekly_series')::uuid, current_setting('task9.start_date')::date) $$,
  'owner may cancel one recurrence occurrence'
);

reset role;
select is(
  (select status::text from public.appointments where recurrence_series_id = current_setting('task9.weekly_series')::uuid and recurrence_occurrence_date = current_setting('task9.start_date')::date),
  'cancelled',
  'occurrence cancellation preserves its materialized appointment history'
);

select ok(
  (select active from public.recurrence_series where id = current_setting('task9.weekly_series')::uuid),
  'one occurrence cancellation does not end the series'
);

select ok(
  exists (
    select 1 from public.recurrence_exceptions
    where series_id = current_setting('task9.weekly_series')::uuid
      and occurrence_date = current_setting('task9.start_date')::date
  ),
  'occurrence cancellation retains its explicit exception'
);

select ok(
  position(
    'perform pg_advisory_xact_lock(hashtextextended(format(''recurrence:%s'', target_shop_id), 0));'
    in pg_get_functiondef('public.end_recurrence_series(uuid)'::regprocedure)
  ) > 0,
  'ending a series uses the same shop advisory lock as materialization'
);

select ok(
  position(
    'perform pg_advisory_xact_lock(hashtextextended(format(''recurrence:%s'', target_shop_id), 0));'
    in pg_get_functiondef('public.edit_recurrence_series(uuid, time, integer, integer, date)'::regprocedure)
  ) > 0,
  'editing a series uses the same shop advisory lock as materialization'
);

select ok(
  position(
    'perform pg_advisory_xact_lock(hashtextextended(format(''recurrence:%s'', target_shop_id), 0));'
    in pg_get_functiondef('public.set_recurrence_series_active(uuid, boolean)'::regprocedure)
  ) > 0,
  'series activation changes use the same shop advisory lock as materialization'
);

select ok(
  position(
    'perform pg_advisory_xact_lock(hashtextextended(format(''recurrence:%s'', target_shop_id), 0));'
    in pg_get_functiondef('public.cancel_recurrence_occurrence(uuid, date)'::regprocedure)
  ) > 0,
  'occurrence cancellation uses the same shop advisory lock as materialization'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.end_recurrence_series(current_setting('task9.biweekly_series')::uuid) $$,
  'owner may end a recurrence series'
);

reset role;
select is(
  (select count(*)::int from public.appointments where recurrence_series_id = current_setting('task9.biweekly_series')::uuid and status = 'cancelled'),
  7,
  'ending a series cancels future materialized appointments while preserving rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.book_appointment('85000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000004', ((current_setting('task9.start_date')::date + 1) + time '12:00') at time zone 'America/Sao_Paulo', 'owner', null) $$,
  'owner may create the manual appointment that conflicts with recurrence'
);

select set_config('task9.conflict_series', (select id::text from public.create_recurrence_series(
  '83000000-0000-0000-0000-000000000004', '85000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date + 1, '12:00', 1, null
)), false);

select lives_ok(
  $$ select * from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_setting('task9.start_date')::date + 1) $$,
  'materialization records a manual-appointment conflict instead of moving it'
);

reset role;
select is(
  (select count(*)::int from public.recurrence_conflicts where series_id = current_setting('task9.conflict_series')::uuid),
  1,
  'one unresolved conflict is recorded per local occurrence'
);

select is(
  (select count(*)::int from public.appointments where recurrence_series_id = current_setting('task9.conflict_series')::uuid),
  0,
  'a conflict never creates an automatically moved appointment'
);

select is(
  (select count(*)::int from public.list_owner_recurrence_conflicts('81000000-0000-0000-0000-000000000001')),
  1,
  'owner may inspect the recorded conflict in its shop'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.end_recurrence_series(current_setting('task9.conflict_series')::uuid) $$,
  'P0010', null,
  'customers cannot end a recurrence series'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select * from public.end_recurrence_series(current_setting('task9.conflict_series')::uuid) $$,
  'owner may end a series with a future conflict'
);

reset role;
select is(
  (select status::text from public.recurrence_conflicts where series_id = current_setting('task9.conflict_series')::uuid),
  'resolved',
  'ending a series resolves its future open conflict without deleting history'
);

select ok(
  (select resolved_at is not null from public.recurrence_conflicts where series_id = current_setting('task9.conflict_series')::uuid),
  'resolved future conflicts retain a resolution timestamp'
);

insert into public.schedule_overrides (shop_id, barber_id, local_date, kind, start_time, end_time)
values (
  '81000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date + 2,
  'block', '13:00', '13:30'
);

select set_config('task9.block_series', (select id::text from public.create_recurrence_series(
  '83000000-0000-0000-0000-000000000004', '85000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date + 2, '13:00', 1, null
)), false);

select lives_ok(
  $$ select * from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_setting('task9.start_date')::date + 2) $$,
  'materialization records a schedule-block conflict without moving the occurrence'
);

reset role;
select is(
  (select reason from public.recurrence_conflicts where series_id = current_setting('task9.block_series')::uuid),
  'SLOT_UNAVAILABLE',
  'schedule blocks use the same conflict reason as occupied slots'
);

select is(
  (select count(*)::int from public.appointments where recurrence_series_id = current_setting('task9.block_series')::uuid),
  0,
  'a schedule block does not create a replacement appointment'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('task9.edit_series', (select id::text from public.create_recurrence_series(
  '83000000-0000-0000-0000-000000000003', '85000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date, '15:00', 1, null
)), false);

select lives_ok(
  $$ select * from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_setting('task9.start_date')::date) $$,
  'materialization creates the first occurrence before a series edit'
);

select lives_ok(
  $$ select * from public.edit_recurrence_series(current_setting('task9.edit_series')::uuid, '14:00', 1, 3000, null) $$,
  'owner may edit the prospective recurrence configuration'
);

select lives_ok(
  $$ select * from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_setting('task9.start_date')::date + 89) $$,
  'edited series materializes newly reached occurrences'
);

reset role;
select is(
  (select (starts_at at time zone 'America/Sao_Paulo')::time from public.appointments where recurrence_series_id = current_setting('task9.edit_series')::uuid and recurrence_occurrence_date = current_setting('task9.start_date')::date),
  time '15:00',
  'editing a series preserves an already materialized occurrence'
);

select is(
  (select (starts_at at time zone 'America/Sao_Paulo')::time from public.appointments where recurrence_series_id = current_setting('task9.edit_series')::uuid and recurrence_occurrence_date = current_setting('task9.start_date')::date + 7),
  time '14:00',
  'only newly materialized occurrences use the edited configuration'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('task9.inactive_series', (select id::text from public.create_recurrence_series(
  '83000000-0000-0000-0000-000000000003', '85000000-0000-0000-0000-000000000001',
  current_setting('task9.start_date')::date + 3, '16:00', 1, null
)), false);

select lives_ok(
  $$ select * from public.set_recurrence_series_active(current_setting('task9.inactive_series')::uuid, false) $$,
  'owner may deactivate a series without deleting it'
);

select lives_ok(
  $$ select * from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_setting('task9.start_date')::date + 3) $$,
  'deactivated series is skipped by materialization'
);

reset role;
select is(
  (select count(*)::int from public.appointments where recurrence_series_id = current_setting('task9.inactive_series')::uuid),
  0,
  'deactivation keeps existing history but creates no new occurrences'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.ensure_recurrence_window('81000000-0000-0000-0000-000000000001', current_date + 1) $$,
  'P0010', null,
  'customers cannot materialize another shop recurrence'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.list_owner_recurrence_series('81000000-0000-0000-0000-000000000001') $$,
  'P0010', null,
  'another owner cannot inspect this shop recurrence'
);

reset role;
select * from finish();
rollback;
