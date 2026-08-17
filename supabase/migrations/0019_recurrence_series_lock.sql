create or replace function public.end_recurrence_series(target_series_id uuid)
returns setof public.recurrence_series
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_shop_id uuid;
  series_row public.recurrence_series%rowtype;
  target_timezone text;
begin
  -- The ID is the only function input, so this lookup establishes the shop
  -- key and authorization before taking the same per-shop lock as generation.
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
