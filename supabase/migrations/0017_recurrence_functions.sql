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
  if target_source = 'customer' and target.customer_user_id is distinct from actor_id then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if target_source in ('owner', 'recurrence') and not owner_actor then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  local_day := (target_starts_at at time zone target.timezone)::date;
  if target_source = 'recurrence' and target_recurrence_occurrence_date <> local_day then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  daily_lock_key := hashtextextended(format('%s:%s:%s', target.shop_id, target_customer_id, local_day), 0);
  perform pg_advisory_xact_lock(daily_lock_key);

  if not owner_actor and exists (
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
begin
  if source = 'recurrence' then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  return query
  select * from public.book_appointment_internal(
    barber_service_id, customer_id, starts_at, source, notes, null, null, null
  );
end;
$$;

create or replace function public.create_recurrence_series(
  target_customer_id uuid,
  target_barber_service_id uuid,
  target_local_start_date date,
  target_local_start_time time,
  target_interval_weeks integer,
  target_special_price_cents integer default null
)
returns setof public.recurrence_series
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_shop_id uuid;
begin
  select barber_services.shop_id into target_shop_id
  from public.barber_services
  join public.customers
    on customers.id = target_customer_id
   and customers.shop_id = barber_services.shop_id
  where barber_services.id = target_barber_service_id;

  if target_shop_id is null or not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_interval_weeks <= 0 or target_special_price_cents < 0 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  return query
  insert into public.recurrence_series (
    shop_id, customer_id, barber_service_id, local_start_date, local_start_time,
    interval_weeks, special_price_cents
  ) values (
    target_shop_id, target_customer_id, target_barber_service_id, target_local_start_date,
    target_local_start_time, target_interval_weeks, target_special_price_cents
  ) returning *;
end;
$$;

create or replace function public.edit_recurrence_series(
  target_series_id uuid,
  target_local_start_time time,
  target_interval_weeks integer,
  target_special_price_cents integer,
  target_ends_on date default null
)
returns setof public.recurrence_series
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  series_row public.recurrence_series%rowtype;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found or not public.is_shop_owner(series_row.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_interval_weeks <= 0 or target_special_price_cents < 0
    or (target_ends_on is not null and target_ends_on < series_row.local_start_date)
  then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  return query
  update public.recurrence_series
  set local_start_time = target_local_start_time,
      interval_weeks = target_interval_weeks,
      special_price_cents = target_special_price_cents,
      ends_on = target_ends_on,
      updated_at = clock_timestamp()
  where id = series_row.id
  returning *;
end;
$$;

create or replace function public.set_recurrence_series_active(
  target_series_id uuid,
  target_active boolean
)
returns setof public.recurrence_series
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  series_row public.recurrence_series%rowtype;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found or not public.is_shop_owner(series_row.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  return query
  update public.recurrence_series
  set active = target_active,
      ended_at = case when target_active then null else clock_timestamp() end,
      updated_at = clock_timestamp()
  where id = series_row.id
  returning *;
end;
$$;

create or replace function public.cancel_recurrence_occurrence(
  target_series_id uuid,
  target_occurrence_date date
)
returns setof public.recurrence_exceptions
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  series_row public.recurrence_series%rowtype;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found or not public.is_shop_owner(series_row.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  insert into public.recurrence_exceptions (series_id, occurrence_date)
  values (series_row.id, target_occurrence_date)
  on conflict (series_id, occurrence_date) do nothing;

  update public.appointments
  set status = 'cancelled', updated_at = clock_timestamp()
  where recurrence_series_id = series_row.id
    and recurrence_occurrence_date = target_occurrence_date
    and status in ('scheduled', 'confirmed');

  update public.recurrence_conflicts
  set status = 'resolved', resolved_at = clock_timestamp()
  where series_id = series_row.id
    and occurrence_date = target_occurrence_date
    and status = 'open';

  return query
  select * from public.recurrence_exceptions
  where series_id = series_row.id and occurrence_date = target_occurrence_date;
end;
$$;

create or replace function public.end_recurrence_series(target_series_id uuid)
returns setof public.recurrence_series
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  series_row public.recurrence_series%rowtype;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found or not public.is_shop_owner(series_row.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  update public.appointments
  set status = 'cancelled', updated_at = clock_timestamp()
  where recurrence_series_id = series_row.id
    and starts_at > clock_timestamp()
    and status in ('scheduled', 'confirmed');

  return query
  update public.recurrence_series
  set active = false, ended_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = series_row.id
  returning *;
end;
$$;

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
      and (ends_on is null or ends_on >= local_today)
    order by id
  loop
    for current_occurrence_date in
      select series_row.local_start_date + (occurrence_number * series_row.interval_weeks * 7)
      from generate_series(
        0,
        floor((through_date - series_row.local_start_date)::numeric / (series_row.interval_weeks * 7))::integer
      ) as occurrence_number
      where series_row.local_start_date + (occurrence_number * series_row.interval_weeks * 7) >= local_today
        and (series_row.ends_on is null or series_row.local_start_date + (occurrence_number * series_row.interval_weeks * 7) <= series_row.ends_on)
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

create or replace function public.list_owner_recurrence_series(target_shop_id uuid)
returns table (
  id uuid,
  customer_id uuid,
  customer_name text,
  barber_service_id uuid,
  local_start_date date,
  local_start_time time,
  interval_weeks smallint,
  special_price_cents integer,
  ends_on date,
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
    recurrence_series.special_price_cents, recurrence_series.ends_on,
    recurrence_series.active, recurrence_series.ended_at
  from public.recurrence_series
  join public.customers
    on customers.id = recurrence_series.customer_id
   and customers.shop_id = recurrence_series.shop_id
  where recurrence_series.shop_id = target_shop_id
  order by recurrence_series.active desc, customers.full_name, recurrence_series.local_start_date;
end;
$$;

create or replace function public.list_owner_recurrence_conflicts(target_shop_id uuid)
returns table (
  id uuid,
  series_id uuid,
  occurrence_date date,
  reason text,
  status public.recurrence_conflict_status,
  customer_name text,
  customer_phone text,
  service_name text,
  local_start_time time
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
    recurrence_conflicts.id, recurrence_conflicts.series_id,
    recurrence_conflicts.occurrence_date, recurrence_conflicts.reason,
    recurrence_conflicts.status, customers.full_name, customers.phone,
    services.name, recurrence_series.local_start_time
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

revoke all on function public.book_appointment_internal(uuid, uuid, timestamptz, public.appointment_source, text, integer, uuid, date) from public;
revoke all on function public.create_recurrence_series(uuid, uuid, date, time, integer, integer) from public;
revoke all on function public.edit_recurrence_series(uuid, time, integer, integer, date) from public;
revoke all on function public.set_recurrence_series_active(uuid, boolean) from public;
revoke all on function public.cancel_recurrence_occurrence(uuid, date) from public;
revoke all on function public.end_recurrence_series(uuid) from public;
revoke all on function public.ensure_recurrence_window(uuid, date) from public;
revoke all on function public.list_owner_recurrence_series(uuid) from public;
revoke all on function public.list_owner_recurrence_conflicts(uuid) from public;

grant execute on function public.create_recurrence_series(uuid, uuid, date, time, integer, integer) to authenticated;
grant execute on function public.edit_recurrence_series(uuid, time, integer, integer, date) to authenticated;
grant execute on function public.set_recurrence_series_active(uuid, boolean) to authenticated;
grant execute on function public.cancel_recurrence_occurrence(uuid, date) to authenticated;
grant execute on function public.end_recurrence_series(uuid) to authenticated;
grant execute on function public.ensure_recurrence_window(uuid, date) to authenticated;
grant execute on function public.list_owner_recurrence_series(uuid) to authenticated;
grant execute on function public.list_owner_recurrence_conflicts(uuid) to authenticated;
