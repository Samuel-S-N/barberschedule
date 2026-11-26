-- Scheduled dispatch of the notification outbox. 0022 and 0062 only enqueue rows with pg_cron; nothing called the Edge Function.
-- The URL and the token live in Vault (set per project: see docs/hosted-deploy.md), never in a migration. Without them (local
-- stack, CI, a project not configured yet) the function returns null and the job is a harmless no-op.
create or replace function public.invoke_dispatch_notifications()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_url text;
  token text;
  request_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return null;
  end if;

  select decrypted_secret into target_url from vault.decrypted_secrets where name = 'dispatch_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'dispatch_token';
  if target_url is null or token is null then
    return null;
  end if;

  select net.http_post(
    url := target_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_dispatch_notifications() from public, anon, authenticated;

do $schedule$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema extensions';
    if to_regnamespace('cron') is not null then
      execute $sql$select cron.schedule('zenc-dispatch-notifications', '* * * * *', 'select public.invoke_dispatch_notifications();')$sql$;
    end if;
  end if;
end
$schedule$;
