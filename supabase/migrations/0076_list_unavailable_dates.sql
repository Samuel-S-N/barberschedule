-- The dates (a range of at most 120 days) on which a professional has NO working time left, by the same rules as get_available_slots
-- (0048): openings = weekly periods of that weekday + that date's opening overrides; blocks = that date's blocks (no times = the whole
-- day) + the daily lunch break; a date is unavailable when openings minus blocks is empty. Dates only: no times, no reasons.
-- Fully booked days are not unavailable (appointments are not part of the rule).
create function public.list_unavailable_dates(professional_id uuid, from_date date, to_date date)
returns setof date
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target public.professionals%rowtype;
begin
  if to_date < from_date then
    return;
  end if;

  if to_date - from_date > 120 then
    raise exception using errcode = 'P0043', message = 'UNAVAILABLE_DATES_RANGE_TOO_LARGE';
  end if;

  select * into target from public.professionals where professionals.id = professional_id and professionals.active;

  if not found then
    return;
  end if;

  return query
  select day::date
  from generate_series(from_date::timestamp, to_date::timestamp, interval '1 day') as day
  where isempty(
    coalesce(
      (
        select range_agg(openings.opening_range)
        from (
          select tsrange(day + working_periods.start_time, day + working_periods.end_time, '[)') as opening_range
          from public.working_periods
          where working_periods.shop_id = target.shop_id
            and working_periods.professional_id = target.id
            and working_periods.weekday = extract(isodow from day)::smallint
          union all
          select tsrange(day + schedule_overrides.start_time, day + schedule_overrides.end_time, '[)')
          from public.schedule_overrides
          where schedule_overrides.shop_id = target.shop_id
            and schedule_overrides.professional_id = target.id
            and schedule_overrides.local_date = day::date
            and schedule_overrides.kind = 'opening'
        ) as openings
      ),
      '{}'::tsmultirange
    )
    - coalesce(
      (
        select range_agg(blocks.block_range)
        from (
          select case
            when schedule_overrides.start_time is null then tsrange(day, day + interval '1 day', '[)')
            else tsrange(day + schedule_overrides.start_time, day + schedule_overrides.end_time, '[)')
          end as block_range
          from public.schedule_overrides
          where schedule_overrides.shop_id = target.shop_id
            and schedule_overrides.professional_id = target.id
            and schedule_overrides.local_date = day::date
            and schedule_overrides.kind = 'block'
          union all
          select tsrange(day + target.lunch_start, day + target.lunch_end, '[)')
          where target.lunch_start is not null
        ) as blocks
      ),
      '{}'::tsmultirange
    )
  )
  order by day;
end;
$$;

revoke all on function public.list_unavailable_dates(uuid, date, date) from public, anon;
grant execute on function public.list_unavailable_dates(uuid, date, date) to authenticated;
