-- A plan request now reports the state of its series (ended plans must not look active) and its plan title,
-- and the owner can reactivate an ended series.
drop function public.list_my_recurrence_requests();

create function public.list_my_recurrence_requests()
returns table (
  id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
  barber_name text, service_name text, recurrence_cents integer,
  series_id uuid, series_active boolean, series_ended_at timestamptz, plan_name text
)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.status, r.interval_weeks, r.local_start_date, r.local_start_time, b.name, s.name,
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks),
         r.series_id, rs.active, rs.ended_at,
         (select pl.name from public.recurrence_plans pl where pl.service_id = s.id and pl.interval_weeks = r.interval_weeks order by pl.active desc, pl.created_at desc limit 1)
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id and c.user_id = auth.uid()
  join public.barbers b on b.id = r.barber_id
  join public.barber_services bs on bs.id = r.barber_service_id
  join public.services s on s.id = bs.service_id
  left join public.recurrence_series rs on rs.id = r.series_id
  order by r.created_at desc limit 20;
$$;
revoke all on function public.list_my_recurrence_requests() from public, anon;
grant execute on function public.list_my_recurrence_requests() to authenticated;

create function public.reactivate_recurrence_series(target_series_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  series_row public.recurrence_series%rowtype;
  appt record;
  tz text;
  local_today date;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found or auth.uid() is null or not public.is_shop_owner(series_row.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if series_row.active or series_row.ended_at is null then
    raise exception using errcode = 'P0036', message = 'RECURRENCE_SERIES_NOT_ENDED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(format('recurrence:%s', series_row.shop_id), 0));
  select timezone into tz from public.shops where id = series_row.shop_id;
  local_today := (clock_timestamp() at time zone tz)::date;

  update public.recurrence_series set active = true, ended_at = null, updated_at = clock_timestamp() where id = series_row.id;

  -- Restore what the ending cancelled; individually cancelled occurrences and customer cancellations stay cancelled.
  for appt in
    select a.id, a.recurrence_occurrence_date
    from public.appointments a
    where a.recurrence_series_id = series_row.id and a.status = 'cancelled' and a.starts_at > clock_timestamp()
      and a.updated_at between series_row.ended_at - interval '5 seconds' and series_row.ended_at + interval '1 second'
      and not exists (
        select 1 from public.recurrence_exceptions e
        where e.series_id = series_row.id and e.occurrence_date = a.recurrence_occurrence_date
      )
    order by a.starts_at
  loop
    begin
      update public.appointments set status = 'scheduled', updated_at = clock_timestamp() where id = appt.id;
    exception when exclusion_violation then
      -- The slot was taken meanwhile: free the occurrence key (the cancelled row stays as plain history) and open a conflict.
      update public.appointments
      set source = 'owner', recurrence_series_id = null, recurrence_occurrence_date = null
      where id = appt.id;
      insert into public.recurrence_conflicts (series_id, occurrence_date, reason)
      values (series_row.id, appt.recurrence_occurrence_date, 'SLOT_UNAVAILABLE')
      on conflict (series_id, occurrence_date) do nothing;
    end;
  end loop;

  -- Dates that were never materialised are created as usual.
  perform public.ensure_recurrence_window(series_row.shop_id, local_today + 90);
end;
$$;

revoke all on function public.reactivate_recurrence_series(uuid) from public, anon;
grant execute on function public.reactivate_recurrence_series(uuid) to authenticated;
