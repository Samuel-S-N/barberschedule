create or replace function public.claim_notification_batch(target_limit integer default 50)
returns table (
  id uuid,
  event_type text,
  payload jsonb,
  expo_push_token text,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.status in ('pending', 'failed')
      and outbox.available_at <= clock_timestamp()
      and outbox.attempts < outbox.max_attempts
    order by outbox.created_at
    for update skip locked
    limit greatest(1, least(coalesce(target_limit, 50), 100))
  ), claimed as (
    update public.notification_outbox outbox
    set status = 'sending',
        attempts = outbox.attempts + 1,
        claimed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id,
         claimed.event_type,
         claimed.payload,
         tokens.expo_push_token,
         claimed.attempts,
         claimed.max_attempts
  from claimed
  left join public.notification_tokens tokens
    on tokens.user_id = claimed.recipient_user_id
   and tokens.active;
end;
$$;

create or replace function public.mark_notification_sent(target_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_outbox
  set status = 'sent', sent_at = clock_timestamp(), claimed_at = null, updated_at = clock_timestamp()
  where id = target_id and status = 'sending';
$$;

create or replace function public.mark_notification_failed(target_id uuid, target_error text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_outbox
  set status = 'failed',
      available_at = clock_timestamp() + least(greatest(attempts, 1) * interval '5 minutes', interval '1 hour'),
      last_error = left(coalesce(target_error, 'notification delivery failed'), 500),
      claimed_at = null,
      updated_at = clock_timestamp()
  where id = target_id and status = 'sending';
$$;

create or replace function public.deactivate_notification_token(target_expo_push_token text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_tokens
  set active = false, updated_at = clock_timestamp()
  where expo_push_token = target_expo_push_token;
$$;

create or replace function public.enqueue_notification_reminders()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  inserted_count integer;
begin
  insert into public.notification_outbox (
    event_key, event_type, recipient_user_id, appointment_id, payload
  )
  select
    format('appointment:%s:reminder:24h', appointments.id),
    'appointment.reminder',
    customers.user_id,
    appointments.id,
    jsonb_build_object(
      'appointment_id', appointments.id,
      'shop_id', appointments.shop_id,
      'starts_at', appointments.starts_at,
      'ends_at', appointments.ends_at,
      'service_name', appointments.service_name_snapshot,
      'status', appointments.status
    )
  from public.appointments
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  where appointments.status in ('scheduled', 'confirmed')
    and customers.user_id is not null
    and appointments.starts_at > clock_timestamp() + interval '23 hours'
    and appointments.starts_at <= clock_timestamp() + interval '25 hours'
  on conflict (event_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.materialize_recurrence_job()
returns table (shops_processed integer, appointments_created integer, conflicts_created integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  shop_row record;
  result record;
begin
  shops_processed := 0;
  appointments_created := 0;
  conflicts_created := 0;

  for shop_row in select id, owner_user_id, timezone from public.shops order by id loop
    perform set_config('request.jwt.claim.sub', shop_row.owner_user_id::text, true);
    select * into result
    from public.ensure_recurrence_window(
      shop_row.id,
      (clock_timestamp() at time zone shop_row.timezone)::date + 90
    );
    shops_processed := shops_processed + 1;
    appointments_created := appointments_created + result.appointments_created;
    conflicts_created := conflicts_created + result.conflicts_created;
  end loop;

  return next;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
revoke all on function public.mark_notification_sent(uuid) from public, anon, authenticated;
revoke all on function public.mark_notification_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.deactivate_notification_token(text) from public, anon, authenticated;
revoke all on function public.enqueue_notification_reminders() from public, anon, authenticated;
revoke all on function public.materialize_recurrence_job() from public, anon, authenticated;

grant execute on function public.claim_notification_batch(integer) to service_role;
grant execute on function public.mark_notification_sent(uuid) to service_role;
grant execute on function public.mark_notification_failed(uuid, text) to service_role;
grant execute on function public.deactivate_notification_token(text) to service_role;

do $schedule$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema extensions';
    if to_regnamespace('cron') is not null then
      execute $sql$select cron.schedule('barberschedule-notification-reminders', '*/15 * * * *', 'select public.enqueue_notification_reminders();')$sql$;
      execute $sql$select cron.schedule('barberschedule-materialize-recurrence', '0 * * * *', 'select public.materialize_recurrence_job();')$sql$;
    end if;
  end if;
end
$schedule$;
