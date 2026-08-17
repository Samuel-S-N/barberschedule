create type public.notification_delivery_status as enum ('pending', 'sending', 'sent', 'failed');

create table public.notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  active boolean not null default true,
  last_seen_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint notification_tokens_token_not_blank check (btrim(expo_push_token) <> '')
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  recurrence_conflict_id uuid references public.recurrence_conflicts (id) on delete set null,
  payload jsonb not null,
  status public.notification_delivery_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint notification_outbox_event_type_check check (
    event_type in ('appointment.booked', 'appointment.cancelled', 'appointment.rescheduled', 'appointment.reminder', 'recurrence.conflict')
  ),
  constraint notification_outbox_attempts_valid check (attempts >= 0 and max_attempts > 0)
);

create index notification_outbox_pending_idx
on public.notification_outbox (available_at, created_at)
where status in ('pending', 'failed');

create index notification_outbox_recipient_idx
on public.notification_outbox (recipient_user_id, status, created_at);

alter table public.notification_tokens enable row level security;
alter table public.notification_outbox enable row level security;
revoke all on table public.notification_tokens from anon, authenticated;
revoke all on table public.notification_outbox from anon, authenticated;

create or replace function public.register_notification_token(
  target_expo_push_token text,
  target_platform text default null
)
returns setof public.notification_tokens
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_FORBIDDEN';
  end if;
  if target_expo_push_token is null or btrim(target_expo_push_token) = '' then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_INVALID';
  end if;

  return query
  insert into public.notification_tokens (user_id, expo_push_token, platform)
  values (actor_id, btrim(target_expo_push_token), nullif(btrim(target_platform), ''))
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      active = true,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning *;
end;
$$;

revoke all on function public.register_notification_token(text, text) from public;
grant execute on function public.register_notification_token(text, text) to authenticated;

create or replace function public.enqueue_appointment_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  final_row public.appointments%rowtype;
  recipient_id uuid;
  v_event_key text;
  v_event_type text;
begin
  select * into final_row
  from public.appointments
  where id = coalesce(new.id, old.id);

  if not found then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' and final_row.status in ('scheduled', 'confirmed') then
    v_event_key := format('appointment:%s:booked', final_row.id);
    v_event_type := 'appointment.booked';
  elsif tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at
    and final_row.status in ('scheduled', 'confirmed') then
    v_event_key := format('appointment:%s:rescheduled:%s', final_row.id, final_row.updated_at);
    v_event_type := 'appointment.rescheduled';
  elsif tg_op = 'UPDATE' and old.status in ('scheduled', 'confirmed')
    and new.status = 'cancelled' and final_row.status = 'cancelled' then
    v_event_key := format('appointment:%s:cancelled', final_row.id);
    v_event_type := 'appointment.cancelled';
  else
    return coalesce(new, old);
  end if;

  select user_id into recipient_id
  from public.customers
  where id = final_row.customer_id
    and shop_id = final_row.shop_id;

  if recipient_id is not null then
    insert into public.notification_outbox (
      event_key, event_type, recipient_user_id, appointment_id, payload
    ) values (
      v_event_key,
      v_event_type,
      recipient_id,
      final_row.id,
      jsonb_build_object(
        'appointment_id', final_row.id,
        'shop_id', final_row.shop_id,
        'starts_at', final_row.starts_at,
        'ends_at', final_row.ends_at,
        'service_name', final_row.service_name_snapshot,
        'status', final_row.status
      )
    ) on conflict (event_key) do nothing;
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger appointments_notification_events
after insert or update on public.appointments
deferrable initially deferred
for each row execute function public.enqueue_appointment_notification();

create or replace function public.enqueue_recurrence_conflict_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  conflict_row public.recurrence_conflicts%rowtype;
  series_shop_id uuid;
  owner_id uuid;
begin
  select * into conflict_row
  from public.recurrence_conflicts
  where id = coalesce(new.id, old.id);

  if not found or conflict_row.status <> 'open' then
    return coalesce(new, old);
  end if;

  select rs.shop_id, sh.owner_user_id
  into series_shop_id, owner_id
  from public.recurrence_series rs
  join public.shops sh on sh.id = rs.shop_id
  where rs.id = conflict_row.series_id;

  if owner_id is not null then
    insert into public.notification_outbox (
      event_key, event_type, recipient_user_id, recurrence_conflict_id, payload
    ) values (
      format('recurrence-conflict:%s', conflict_row.id),
      'recurrence.conflict',
      owner_id,
      conflict_row.id,
      jsonb_build_object(
        'conflict_id', conflict_row.id,
        'series_id', conflict_row.series_id,
        'shop_id', series_shop_id,
        'occurrence_date', conflict_row.occurrence_date,
        'reason', conflict_row.reason
      )
    ) on conflict (event_key) do nothing;
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger recurrence_conflict_notification_events
after insert or update on public.recurrence_conflicts
deferrable initially deferred
for each row execute function public.enqueue_recurrence_conflict_notification();

revoke all on function public.enqueue_appointment_notification() from public;
revoke all on function public.enqueue_recurrence_conflict_notification() from public;
