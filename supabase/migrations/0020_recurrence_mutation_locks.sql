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

revoke all on function public.edit_recurrence_series(uuid, time, integer, integer, date) from public;
grant execute on function public.edit_recurrence_series(uuid, time, integer, integer, date) to authenticated;

revoke all on function public.set_recurrence_series_active(uuid, boolean) from public;
grant execute on function public.set_recurrence_series_active(uuid, boolean) to authenticated;

revoke all on function public.cancel_recurrence_occurrence(uuid, date) from public;
grant execute on function public.cancel_recurrence_occurrence(uuid, date) to authenticated;
