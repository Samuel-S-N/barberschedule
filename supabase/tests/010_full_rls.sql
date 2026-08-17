begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select is((select count(*)::int from public.shops), 1, 'seed creates one shop');
select is((select count(*)::int from public.profiles where role = 'owner'), 1, 'seed creates one owner');
select is((select count(*)::int from public.customers), 3, 'seed creates three customers');
select is((select count(*)::int from public.recurrence_conflicts where status = 'open'), 1, 'seed creates one open recurrence conflict');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select is((select count(*)::int from public.barbers where active), 1, 'anonymous users see active barbers');
select is((select count(*)::int from public.services where active), 1, 'anonymous users see active services');
select is((select count(*)::int from public.barber_services where active), 1, 'anonymous users see active barber services');
select throws_ok($$ select * from public.customers $$, '42501', null, 'anonymous users cannot read customers');
select throws_ok($$ select * from public.working_periods $$, '42501', null, 'anonymous users cannot read schedules');
select throws_ok($$ select * from public.appointments $$, '42501', null, 'anonymous users cannot read appointments');
select throws_ok($$ select * from public.recurrence_conflicts $$, '42501', null, 'anonymous users cannot read recurrence conflicts');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.profiles), 1, 'customer A reads only their profile');
select is((select count(*)::int from public.customers), 1, 'customer A reads only their customer row');
select is((select count(*)::int from public.appointments), 1, 'customer A reads only their appointments');
select is((select count(*)::int from public.working_periods), 0, 'customer A cannot read schedules');
select throws_ok($$ select * from public.recurrence_series $$, '42501', null, 'customer A cannot read recurrence series');
select throws_ok($$ select * from public.list_owner_agenda('a1000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-07', 10, 0) $$, 'P0010', null, 'customer A cannot read owner agenda');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.appointments), 0, 'customer B cannot read customer A appointments');
select is((select count(*)::int from public.customers), 1, 'customer B reads only their customer row');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.profiles where role = 'owner'), 1, 'owner reads the owner profile');
select is((select count(*)::int from public.customers), 3, 'owner reads all shop customers');
select is((select count(*)::int from public.working_periods), 7, 'owner reads all shop working periods');
select throws_ok($$ select * from public.recurrence_conflicts $$, '42501', null, 'owner uses the recurrence conflict RPC instead of direct table reads');
select is((select count(*)::int from public.list_owner_agenda('a1000000-0000-0000-0000-000000000001', '2030-01-07', '2030-01-07', 10, 0)), 1, 'owner can read the bounded agenda');
select is((select count(*)::int from public.list_owner_recurrence_conflicts('a1000000-0000-0000-0000-000000000001')), 1, 'owner can read recurrence conflicts through the RPC');

reset role;
select ok(has_function_privilege('anon', 'public.book_appointment(uuid,uuid,timestamptz,public.appointment_source,text)', 'execute') = false, 'anonymous cannot execute booking');
select ok(has_function_privilege('authenticated', 'public.book_appointment(uuid,uuid,timestamptz,public.appointment_source,text)', 'execute'), 'authenticated can execute booking RPC');
select ok(has_function_privilege('authenticated', 'public.ensure_recurrence_window(uuid,date)', 'execute'), 'authenticated can execute recurrence RPC');
select ok(has_function_privilege('anon', 'public.ensure_recurrence_window(uuid,date)', 'execute') = false, 'anonymous cannot execute recurrence RPC');

select * from finish();
rollback;
