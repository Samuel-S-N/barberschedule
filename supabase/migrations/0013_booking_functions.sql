create type public.appointment_source as enum ('customer', 'owner', 'recurrence');

alter table public.appointments
add column source public.appointment_source not null default 'customer',
add column notes text;

create or replace function public.book_appointment(
  barber_service_id uuid,
  customer_id uuid,
  starts_at timestamptz,
  source public.appointment_source,
  notes text default null
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target record;
  local_day date;
  owner_actor boolean;
  daily_lock_key bigint;
begin
  if actor_id is null then
    raise exception using errcode = 'P0003', message = 'BOOKING_FORBIDDEN';
  end if;

  select
    bs.id,
    bs.shop_id,
    bs.barber_id,
    bs.service_id,
    b.name as barber_name,
    b.active as barber_active,
    b.buffer_minutes,
    s.name as service_name,
    s.duration_minutes,
    s.price_cents,
    s.active as service_active,
    bs.duration_override_minutes,
    bs.price_override_cents,
    bs.active as barber_service_active,
    sh.timezone,
    c.active as customer_active,
    c.user_id as customer_user_id
  into target
  from public.barber_services bs
  join public.barbers b
    on b.id = bs.barber_id and b.shop_id = bs.shop_id
  join public.services s
    on s.id = bs.service_id and s.shop_id = bs.shop_id
  join public.shops sh on sh.id = bs.shop_id
  join public.customers c
    on c.id = $2 and c.shop_id = bs.shop_id
  where bs.id = $1;

  if not found then
    raise exception using errcode = 'P0004', message = 'SERVICE_UNAVAILABLE';
  end if;

  if not target.barber_active then
    raise exception using errcode = 'P0005', message = 'BARBER_UNAVAILABLE';
  end if;

  if not target.service_active or not target.barber_service_active then
    raise exception using errcode = 'P0004', message = 'SERVICE_UNAVAILABLE';
  end if;

  if not target.customer_active then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  owner_actor := public.is_shop_owner(target.shop_id);

  if $4 = 'customer' and target.customer_user_id is distinct from actor_id then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  if $4 in ('owner', 'recurrence') and not owner_actor then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  local_day := ($3 at time zone target.timezone)::date;
  daily_lock_key := hashtextextended(
    format('%s:%s:%s', target.shop_id, $2, local_day),
    0
  );
  perform pg_advisory_xact_lock(daily_lock_key);

  if not owner_actor and exists (
    select 1
    from public.appointments a
    where a.shop_id = target.shop_id
      and a.customer_id = $2
      and a.status <> 'cancelled'
      and (a.starts_at at time zone target.timezone)::date = local_day
  ) then
    raise exception using errcode = 'P0002', message = 'DAILY_BOOKING_LIMIT';
  end if;

  if $3 <= clock_timestamp() then
    raise exception using errcode = 'P0009', message = 'INVALID_BOOKING_START';
  end if;

  if not exists (
    select 1
    from public.get_available_slots(target.barber_id, local_day, $1) slot
    where slot.starts_at = $3
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  begin
    return query
    insert into public.appointments (
      shop_id,
      barber_id,
      customer_id,
      barber_service_id,
      service_id,
      starts_at,
      ends_at,
      occupied_until,
      status,
      source,
      notes,
      service_name_snapshot,
      service_duration_minutes_snapshot,
      service_price_cents_snapshot,
      barber_buffer_minutes_snapshot
    )
    values (
      target.shop_id,
      target.barber_id,
      $2,
      $1,
      target.service_id,
      $3,
      $3 + coalesce(target.duration_override_minutes, target.duration_minutes) * interval '1 minute',
      $3 + coalesce(target.duration_override_minutes, target.duration_minutes) * interval '1 minute'
        + target.buffer_minutes * interval '1 minute',
      'scheduled',
      $4,
      nullif(btrim($5), ''),
      target.service_name,
      coalesce(target.duration_override_minutes, target.duration_minutes),
      coalesce(target.price_override_cents, target.price_cents),
      target.buffer_minutes
    )
    returning *;
  exception
    when exclusion_violation then
      raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end;
end;
$$;

revoke all on function public.book_appointment(uuid, uuid, timestamptz, public.appointment_source, text) from public;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, public.appointment_source, text) to authenticated;
