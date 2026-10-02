drop function public.list_my_barber_agenda(date, date, integer, integer);

create function public.list_my_barber_agenda(
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
  customer_name text,
  customer_phone text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  my_barber_id uuid;
  my_shop_id uuid;
  target_timezone text;
begin
  select barbers.id, barbers.shop_id
  into my_barber_id, my_shop_id
  from public.barbers
  where barbers.user_id = auth.uid() and barbers.active;

  if my_barber_id is null then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  if range_end < range_start
    or range_end - range_start > 31
    or page_limit not between 1 and 100
    or page_offset < 0
  then
    raise exception using errcode = 'P0014', message = 'AGENDA_INVALID_RANGE';
  end if;

  select shops.timezone into target_timezone
  from public.shops
  where shops.id = my_shop_id;

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
    customers.full_name,
    -- Only account-less customers: accounts already get push, so their phone is not exposed here.
    case when customers.user_id is null then customers.phone end
  from public.appointments
  join public.barbers
    on barbers.id = appointments.barber_id
   and barbers.shop_id = appointments.shop_id
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  where appointments.barber_id = my_barber_id
    and appointments.starts_at >= range_start::timestamp at time zone target_timezone
    and appointments.starts_at < (range_end + 1)::timestamp at time zone target_timezone
  order by appointments.starts_at, appointments.id
  limit page_limit
  offset page_offset;
end;
$$;

revoke all on function public.list_my_barber_agenda(date, date, integer, integer) from public;
grant execute on function public.list_my_barber_agenda(date, date, integer, integer) to authenticated;
