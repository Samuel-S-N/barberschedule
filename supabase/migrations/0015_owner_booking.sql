create or replace function public.list_owner_agenda(
  target_shop_id uuid,
  range_start date,
  range_end date,
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  id uuid,
  shop_id uuid,
  barber_id uuid,
  customer_id uuid,
  barber_service_id uuid,
  service_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  occupied_until timestamptz,
  status public.appointment_status,
  source public.appointment_source,
  notes text,
  service_name_snapshot text,
  service_duration_minutes_snapshot integer,
  service_price_cents_snapshot integer,
  barber_buffer_minutes_snapshot integer,
  created_at timestamptz,
  updated_at timestamptz,
  barber_name text,
  customer_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_timezone text;
begin
  if auth.uid() is null or not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  if range_end < range_start
    or range_end - range_start > 31
    or page_limit not between 1 and 100
    or page_offset < 0
  then
    raise exception using errcode = 'P0014', message = 'AGENDA_INVALID_RANGE';
  end if;

  select shops.timezone
  into target_timezone
  from public.shops
  where shops.id = target_shop_id;

  return query
  select
    appointments.id,
    appointments.shop_id,
    appointments.barber_id,
    appointments.customer_id,
    appointments.barber_service_id,
    appointments.service_id,
    appointments.starts_at,
    appointments.ends_at,
    appointments.occupied_until,
    appointments.status,
    appointments.source,
    appointments.notes,
    appointments.service_name_snapshot,
    appointments.service_duration_minutes_snapshot,
    appointments.service_price_cents_snapshot,
    appointments.barber_buffer_minutes_snapshot,
    appointments.created_at,
    appointments.updated_at,
    barbers.name,
    customers.full_name
  from public.appointments
  join public.barbers
    on barbers.id = appointments.barber_id
   and barbers.shop_id = appointments.shop_id
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  where appointments.shop_id = target_shop_id
    and appointments.starts_at >= range_start::timestamp at time zone target_timezone
    and appointments.starts_at < (range_end + 1)::timestamp at time zone target_timezone
  order by appointments.starts_at, appointments.id
  limit page_limit
  offset page_offset;
end;
$$;

create or replace function public.set_owner_appointment_status(
  appointment_id uuid,
  new_status public.appointment_status
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select *
  into target
  from public.appointments
  where id = appointment_id
  for update;

  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  if not public.is_shop_owner(target.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  if new_status not in ('completed', 'no_show')
    or target.status not in ('scheduled', 'confirmed') then
    raise exception using errcode = 'P0013', message = 'APPOINTMENT_STATUS_INVALID';
  end if;

  return query
  update public.appointments
  set status = new_status, updated_at = clock_timestamp()
  where id = target.id
  returning *;
end;
$$;

create or replace function public.list_owner_agenda_overrides(
  target_shop_id uuid,
  range_start date,
  range_end date
)
returns table (
  id uuid,
  barber_id uuid,
  barber_name text,
  local_date date,
  kind public.schedule_override_kind,
  start_time time,
  end_time time
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

  if range_end < range_start or range_end - range_start > 31 then
    raise exception using errcode = 'P0014', message = 'AGENDA_INVALID_RANGE';
  end if;

  return query
  select
    schedule_overrides.id,
    schedule_overrides.barber_id,
    barbers.name,
    schedule_overrides.local_date,
    schedule_overrides.kind,
    schedule_overrides.start_time,
    schedule_overrides.end_time
  from public.schedule_overrides
  join public.barbers
    on barbers.id = schedule_overrides.barber_id
   and barbers.shop_id = schedule_overrides.shop_id
  where schedule_overrides.shop_id = target_shop_id
    and schedule_overrides.local_date between range_start and range_end
  order by schedule_overrides.local_date, schedule_overrides.start_time nulls first, schedule_overrides.id;
end;
$$;

revoke all on function public.list_owner_agenda(uuid, date, date, integer, integer) from public;
revoke all on function public.list_owner_agenda_overrides(uuid, date, date) from public;
revoke all on function public.set_owner_appointment_status(uuid, public.appointment_status) from public;
grant execute on function public.list_owner_agenda(uuid, date, date, integer, integer) to authenticated;
grant execute on function public.list_owner_agenda_overrides(uuid, date, date) to authenticated;
grant execute on function public.set_owner_appointment_status(uuid, public.appointment_status) to authenticated;
