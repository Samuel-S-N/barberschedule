-- Plans have no planned end: they stay active until the barber of the plan or the owner ends them.
-- The barber can now end (and list) the plans of their own customers; the optional end date is gone from the database.

create or replace function public.end_recurrence_series(target_series_id uuid)
returns setof public.recurrence_series
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_shop_id uuid;
  series_barber_id uuid;
  series_row public.recurrence_series%rowtype;
  target_timezone text;
begin
  -- The ID is the only function input, so this lookup establishes the shop
  -- key and authorization before taking the same per-shop lock as generation.
  select recurrence_series.shop_id, barber_services.barber_id into target_shop_id, series_barber_id
  from public.recurrence_series
  join public.barber_services on barber_services.id = recurrence_series.barber_service_id
  where recurrence_series.id = target_series_id;

  if not found or not (public.is_shop_owner(target_shop_id) or public.is_own_barber(series_barber_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(format('recurrence:%s', target_shop_id), 0));

  select * into series_row
  from public.recurrence_series
  where id = target_series_id
  for update;

  if not found or series_row.shop_id <> target_shop_id then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select timezone into target_timezone
  from public.shops
  where id = series_row.shop_id;

  update public.appointments
  set status = 'cancelled', updated_at = clock_timestamp()
  where recurrence_series_id = series_row.id
    and starts_at > clock_timestamp()
    and status in ('scheduled', 'confirmed');

  update public.recurrence_conflicts
  set status = 'resolved', resolved_at = clock_timestamp()
  where series_id = series_row.id
    and status = 'open'
    and (occurrence_date + series_row.local_start_time) at time zone target_timezone > clock_timestamp();

  return query
  update public.recurrence_series
  set active = false, ended_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = series_row.id
  returning *;
end;
$$;

revoke all on function public.end_recurrence_series(uuid) from public;
grant execute on function public.end_recurrence_series(uuid) to authenticated;

create function public.list_my_recurrence_series()
returns table (
  id uuid, customer_id uuid, customer_name text, customer_phone text, barber_service_id uuid, service_name text,
  local_start_date date, local_start_time time, interval_weeks integer, special_price_cents integer,
  active boolean, ended_at timestamptz, cancel_requested_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select rs.id, rs.customer_id, c.full_name, c.phone, rs.barber_service_id, s.name,
         rs.local_start_date, rs.local_start_time, rs.interval_weeks, rs.special_price_cents,
         rs.active, rs.ended_at, rs.cancel_requested_at
  from public.recurrence_series rs
  join public.customers c on c.id = rs.customer_id and c.shop_id = rs.shop_id
  join public.barber_services bs on bs.id = rs.barber_service_id
  join public.services s on s.id = bs.service_id
  where auth.uid() is not null and public.is_own_barber(bs.barber_id)
  order by rs.active desc, c.full_name, rs.local_start_date;
$$;

revoke all on function public.list_my_recurrence_series() from public, anon;
grant execute on function public.list_my_recurrence_series() to authenticated;

drop function public.edit_recurrence_series(uuid, time, integer, integer, date);

create function public.edit_recurrence_series(
  target_series_id uuid,
  target_local_start_time time,
  target_interval_weeks integer,
  target_special_price_cents integer
)
returns setof public.recurrence_series
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_shop_id uuid;
  series_row public.recurrence_series%rowtype;
begin
  select shop_id into target_shop_id
  from public.recurrence_series
  where id = target_series_id;

  if not found or not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(format('recurrence:%s', target_shop_id), 0));

  select * into series_row
  from public.recurrence_series
  where id = target_series_id
  for update;

  if not found or series_row.shop_id <> target_shop_id then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_interval_weeks <= 0 or target_special_price_cents < 0 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  return query
  update public.recurrence_series
  set local_start_time = target_local_start_time,
      interval_weeks = target_interval_weeks,
      special_price_cents = target_special_price_cents,
      updated_at = clock_timestamp()
  where id = series_row.id
  returning *;
end;
$$;

revoke all on function public.edit_recurrence_series(uuid, time, integer, integer) from public;
grant execute on function public.edit_recurrence_series(uuid, time, integer, integer) to authenticated;

create or replace function public.ensure_recurrence_window(
  target_shop_id uuid,
  through_date date
)
returns table (appointments_created integer, conflicts_created integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_timezone text;
  local_today date;
  series_row public.recurrence_series%rowtype;
  current_occurrence_date date;
  occurrence_starts_at timestamptz;
begin
  if auth.uid() is null or not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select timezone into target_timezone from public.shops where id = target_shop_id;
  local_today := (clock_timestamp() at time zone target_timezone)::date;
  if through_date < local_today or through_date > local_today + 90 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(format('recurrence:%s', target_shop_id), 0));
  appointments_created := 0;
  conflicts_created := 0;

  for series_row in
    select * from public.recurrence_series
    where shop_id = target_shop_id
      and active
      and local_start_date <= through_date
    order by id
  loop
    for current_occurrence_date in
      select series_row.local_start_date + (occurrence_number * series_row.interval_weeks * 7)
      from generate_series(
        0,
        floor((through_date - series_row.local_start_date)::numeric / (series_row.interval_weeks * 7))::integer
      ) as occurrence_number
      where series_row.local_start_date + (occurrence_number * series_row.interval_weeks * 7) >= local_today
    loop
      occurrence_starts_at := (current_occurrence_date + series_row.local_start_time) at time zone target_timezone;
      if occurrence_starts_at <= clock_timestamp()
        or exists (select 1 from public.recurrence_exceptions where series_id = series_row.id and occurrence_date = current_occurrence_date)
        or exists (select 1 from public.appointments where recurrence_series_id = series_row.id and recurrence_occurrence_date = current_occurrence_date)
        or exists (select 1 from public.recurrence_conflicts where series_id = series_row.id and occurrence_date = current_occurrence_date)
      then
        continue;
      end if;

      begin
        perform public.book_appointment_internal(
          series_row.barber_service_id,
          series_row.customer_id,
          occurrence_starts_at,
          'recurrence',
          null,
          series_row.special_price_cents,
          series_row.id,
          current_occurrence_date
        );
        appointments_created := appointments_created + 1;
      exception when sqlstate 'P0001' then
        insert into public.recurrence_conflicts (series_id, occurrence_date, reason)
        values (series_row.id, current_occurrence_date, 'SLOT_UNAVAILABLE')
        on conflict (series_id, occurrence_date) do nothing;
        if found then
          conflicts_created := conflicts_created + 1;
        end if;
      end;
    end loop;
  end loop;

  return next;
end;
$$;

drop function public.list_owner_recurrence_series(uuid);

create function public.list_owner_recurrence_series(target_shop_id uuid)
returns table (
  id uuid,
  customer_id uuid,
  customer_name text,
  barber_service_id uuid,
  local_start_date date,
  local_start_time time,
  interval_weeks smallint,
  special_price_cents integer,
  active boolean,
  ended_at timestamptz
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
    recurrence_series.id, recurrence_series.customer_id, customers.full_name,
    recurrence_series.barber_service_id, recurrence_series.local_start_date,
    recurrence_series.local_start_time, recurrence_series.interval_weeks,
    recurrence_series.special_price_cents,
    recurrence_series.active, recurrence_series.ended_at
  from public.recurrence_series
  join public.customers
    on customers.id = recurrence_series.customer_id
   and customers.shop_id = recurrence_series.shop_id
  where recurrence_series.shop_id = target_shop_id
  order by recurrence_series.active desc, customers.full_name, recurrence_series.local_start_date;
end;
$$;

revoke all on function public.list_owner_recurrence_series(uuid) from public;
grant execute on function public.list_owner_recurrence_series(uuid) to authenticated;

alter table public.recurrence_series drop constraint if exists recurrence_series_end_not_before_start;
alter table public.recurrence_series drop column ends_on;
