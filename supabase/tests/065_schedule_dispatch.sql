begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function('public', 'invoke_dispatch_notifications', array[]::text[], 'the dispatch trigger exists');
select is(
  has_function_privilege('anon', 'public.invoke_dispatch_notifications()', 'execute') or has_function_privilege('authenticated', 'public.invoke_dispatch_notifications()', 'execute'),
  false,
  'clients cannot call it'
);

delete from vault.secrets where name in ('dispatch_url', 'dispatch_token');
select is(public.invoke_dispatch_notifications(), null::bigint, 'without the vault secrets it sends nothing');

select vault.create_secret('http://127.0.0.1:9/dispatch', 'dispatch_url');
select vault.create_secret(repeat('a', 32), 'dispatch_token');
select isnt(public.invoke_dispatch_notifications(), null::bigint, 'with both secrets it queues one HTTP request');

select is((select count(*)::int from cron.job where jobname = 'zenc-dispatch-notifications' and schedule = '* * * * *'), 1, 'the job runs every minute');

select * from finish();
rollback;
