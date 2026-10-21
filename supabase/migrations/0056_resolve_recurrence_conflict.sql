-- A rescheduled occurrence may fall on another day than the conflicted date, so book_appointment_internal no longer
-- requires the occurrence date to equal the appointment's local day (only trusted definer functions call it).
create or replace function public.book_appointment_internal(
  target_barber_service_id uuid,
  target_customer_id uuid,
  target_starts_at timestamptz,
  target_source public.appointment_source,
  target_notes text,
  target_special_price_cents integer default null,
  target_recurrence_series_id uuid default null,
  target_recurrence_occurrence_date date default null
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
  barber_actor boolean;
  daily_lock_key bigint;
begin
  if actor_id is null then
    raise exception using errcode = 'P0003', message = 'BOOKING_FORBIDDEN';
  end if;

  if (target_source = 'recurrence') <> (
    target_recurrence_series_id is not null and target_recurrence_occurrence_date is not null
  ) then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  if target_source <> 'recurrence' and target_special_price_cents is not null then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  select
    bs.id,
    bs.shop_id,
    bs.barber_id,
    bs.service_id,
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
  join public.barbers b on b.id = bs.barber_id and b.shop_id = bs.shop_id
  join public.services s on s.id = bs.service_id and s.shop_id = bs.shop_id
  join public.shops sh on sh.id = bs.shop_id
  join public.customers c on c.id = target_customer_id and c.shop_id = bs.shop_id
  where bs.id = target_barber_service_id;

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
  barber_actor := public.is_own_barber(target.barber_id);
  if target_source = 'customer' and target.customer_user_id is distinct from actor_id then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if target_source in ('owner', 'recurrence') and not owner_actor then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if target_source = 'barber' and not barber_actor then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  local_day := (target_starts_at at time zone target.timezone)::date;

  daily_lock_key := hashtextextended(format('%s:%s:%s', target.shop_id, target_customer_id, local_day), 0);
  perform pg_advisory_xact_lock(daily_lock_key);

  if not (owner_actor or target_source = 'barber') and exists (
    select 1 from public.appointments a
    where a.shop_id = target.shop_id
      and a.customer_id = target_customer_id
      and a.status <> 'cancelled'
      and (a.starts_at at time zone target.timezone)::date = local_day
  ) then
    raise exception using errcode = 'P0002', message = 'DAILY_BOOKING_LIMIT';
  end if;

  if target_starts_at <= clock_timestamp() then
    raise exception using errcode = 'P0009', message = 'INVALID_BOOKING_START';
  end if;

  if not exists (
    select 1 from public.get_available_slots(target.barber_id, local_day, target_barber_service_id) slot
    where slot.starts_at = target_starts_at
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  begin
    return query
    insert into public.appointments (
      shop_id, barber_id, customer_id, barber_service_id, service_id,
      starts_at, ends_at, occupied_until, status, source, notes,
      service_name_snapshot, service_duration_minutes_snapshot,
      service_price_cents_snapshot, barber_buffer_minutes_snapshot,
      recurrence_series_id, recurrence_occurrence_date
    ) values (
      target.shop_id, target.barber_id, target_customer_id, target_barber_service_id, target.service_id,
      target_starts_at,
      target_starts_at + coalesce(target.duration_override_minutes, target.duration_minutes) * interval '1 minute',
      target_starts_at + (coalesce(target.duration_override_minutes, target.duration_minutes) + target.buffer_minutes) * interval '1 minute',
      'scheduled', target_source, nullif(btrim(target_notes), ''),
      target.service_name, coalesce(target.duration_override_minutes, target.duration_minutes),
      coalesce(target_special_price_cents, target.price_override_cents, target.price_cents), target.buffer_minutes,
      target_recurrence_series_id, target_recurrence_occurrence_date
    ) returning *;
  exception when exclusion_violation then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end;
end;
$$;

-- The owner can reschedule or dismiss a recurrence conflict. The list also carries the barber and barber-service ids
-- the app needs to offer free times for the new date.
drop function public.list_owner_recurrence_conflicts(uuid);

create function public.list_owner_recurrence_conflicts(target_shop_id uuid)
returns table (
  id uuid,
  series_id uuid,
  occurrence_date date,
  reason text,
  status public.recurrence_conflict_status,
  customer_name text,
  customer_phone text,
  service_name text,
  local_start_time time,
  barber_id uuid,
  barber_service_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  return query
  select
    recurrence_conflicts.id, recurrence_conflicts.series_id, recurrence_conflicts.occurrence_date,
    recurrence_conflicts.reason, recurrence_conflicts.status, customers.full_name, customers.phone,
    services.name, recurrence_series.local_start_time, barber_services.barber_id, barber_services.id
  from public.recurrence_conflicts
  join public.recurrence_series on recurrence_series.id = recurrence_conflicts.series_id
  join public.customers
    on customers.id = recurrence_series.customer_id
   and customers.shop_id = recurrence_series.shop_id
  join public.barber_services
    on barber_services.id = recurrence_series.barber_service_id
   and barber_services.shop_id = recurrence_series.shop_id
  join public.services
    on services.id = barber_services.service_id
   and services.shop_id = barber_services.shop_id
  where recurrence_series.shop_id = target_shop_id
  order by recurrence_conflicts.status, recurrence_conflicts.occurrence_date, recurrence_conflicts.id;
end;
$$;

revoke all on function public.list_owner_recurrence_conflicts(uuid) from public;
grant execute on function public.list_owner_recurrence_conflicts(uuid) to authenticated;

create function public.resolve_recurrence_conflict(target_conflict_id uuid, new_starts_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  conflict public.recurrence_conflicts%rowtype;
  series public.recurrence_series%rowtype;
  new_id uuid;
begin
  select * into conflict from public.recurrence_conflicts where id = target_conflict_id for update;
  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  select * into series from public.recurrence_series where id = conflict.series_id;
  if auth.uid() is null or not public.is_shop_owner(series.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if conflict.status = 'resolved' then
    raise exception using errcode = 'P0035', message = 'RECURRENCE_CONFLICT_RESOLVED';
  end if;

  if new_starts_at is not null then
    -- The replacement is the series' occurrence for the conflicted date (any day), at the plan's price.
    select booked.id into new_id
    from public.book_appointment_internal(
      series.barber_service_id, series.customer_id, new_starts_at, 'recurrence', null,
      series.special_price_cents, series.id, conflict.occurrence_date
    ) booked;
  end if;

  update public.recurrence_conflicts
  set status = 'resolved', resolved_at = clock_timestamp(), resolution_appointment_id = new_id
  where id = conflict.id;
end;
$$;

revoke all on function public.resolve_recurrence_conflict(uuid, timestamptz) from public, anon;
grant execute on function public.resolve_recurrence_conflict(uuid, timestamptz) to authenticated;
