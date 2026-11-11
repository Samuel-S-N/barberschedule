alter table public.professionals
  add column lunch_start time,
  add column lunch_end time,
  add constraint professionals_lunch_valid check (
    (lunch_start is null and lunch_end is null)
    or (lunch_start is not null and lunch_end is not null and lunch_start < lunch_end)
  );

create function public.get_my_lunch_break()
returns table (lunch_start time, lunch_end time)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select b.lunch_start, b.lunch_end from public.professionals b where b.user_id = auth.uid() and b.active;
$$;

create function public.set_my_lunch_break(new_start time, new_end time)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if (new_start is null) <> (new_end is null) or (new_start is not null and new_start >= new_end) then
    raise exception using errcode = 'P0020', message = 'LUNCH_INVALID';
  end if;

  update public.professionals
  set lunch_start = new_start, lunch_end = new_end, updated_at = clock_timestamp()
  where user_id = auth.uid() and active;

  if not found then
    raise exception using errcode = 'P0019', message = 'PROFESSIONAL_NOT_LINKED';
  end if;
end;
$$;

create function public.list_shop_lunch_breaks(target_shop_id uuid)
returns table (professional_id uuid, lunch_start time, lunch_end time)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  return query
  select b.id, b.lunch_start, b.lunch_end
  from public.professionals b
  where b.shop_id = target_shop_id and b.lunch_start is not null;
end;
$$;

revoke all on function public.get_my_lunch_break() from public;
revoke all on function public.set_my_lunch_break(time, time) from public;
revoke all on function public.list_shop_lunch_breaks(uuid) from public;
grant execute on function public.get_my_lunch_break() to authenticated;
grant execute on function public.set_my_lunch_break(time, time) to authenticated;
grant execute on function public.list_shop_lunch_breaks(uuid) to authenticated;

-- get_available_slots, as in 0012, now also removing every professional's daily lunch break.
create or replace function public.get_available_slots(
  professional_id uuid,
  local_date date,
  professional_service_id uuid
)
returns table (
  local_date date,
  local_time time,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with target as (
    select
      professionals.id as professional_id,
      professionals.shop_id,
      shops.timezone,
      coalesce(
        professional_services.duration_override_minutes,
        services.duration_minutes
      ) * interval '1 minute' as service_duration,
      professionals.buffer_minutes * interval '1 minute' as buffer_duration
    from public.professional_services
    inner join public.professionals
      on professionals.id = professional_services.professional_id
     and professionals.shop_id = professional_services.shop_id
    inner join public.services
      on services.id = professional_services.service_id
     and services.shop_id = professional_services.shop_id
    inner join public.shops
      on shops.id = professionals.shop_id
    where professional_services.id = $3
      and professionals.id = $1
      and professional_services.active
      and professionals.active
      and services.active
  ),
  raw_openings as (
    select tsrange(
      $2 + working_periods.start_time,
      $2 + working_periods.end_time,
      '[)'
    ) as opening_range
    from target
    inner join public.working_periods
      on working_periods.shop_id = target.shop_id
     and working_periods.professional_id = target.professional_id
    where working_periods.weekday = extract(isodow from $2)::smallint

    union all

    select tsrange(
      $2 + schedule_overrides.start_time,
      $2 + schedule_overrides.end_time,
      '[)'
    ) as opening_range
    from target
    inner join public.schedule_overrides
      on schedule_overrides.shop_id = target.shop_id
     and schedule_overrides.professional_id = target.professional_id
    where schedule_overrides.local_date = $2
      and schedule_overrides.kind = 'opening'
  ),
  ordered_openings as (
    select
      opening_range,
      max(upper(opening_range)) over (
        order by lower(opening_range), upper(opening_range)
        rows between unbounded preceding and 1 preceding
      ) as prior_end
    from raw_openings
  ),
  marked_openings as (
    select
      opening_range,
      case
        when prior_end is null or lower(opening_range) > prior_end then 1
        else 0
      end as starts_group
    from ordered_openings
  ),
  grouped_openings as (
    select
      opening_range,
      sum(starts_group) over (
        order by lower(opening_range), upper(opening_range)
        rows unbounded preceding
      ) as group_id
    from marked_openings
  ),
  merged_openings as (
    select tsrange(
      min(lower(opening_range)),
      max(upper(opening_range)),
      '[)'
    ) as opening_range
    from grouped_openings
    group by group_id
  ),
  raw_blocks as (
    select case
      when schedule_overrides.start_time is null then tsrange(
        $2::timestamp,
        ($2 + 1)::timestamp,
        '[)'
      )
      else tsrange(
        $2 + schedule_overrides.start_time,
        $2 + schedule_overrides.end_time,
        '[)'
      )
    end as block_range
    from target
    inner join public.schedule_overrides
      on schedule_overrides.shop_id = target.shop_id
     and schedule_overrides.professional_id = target.professional_id
    where schedule_overrides.local_date = $2
      and schedule_overrides.kind = 'block'

    union all

    -- The professional's daily lunch break.
    select tsrange($2 + professionals.lunch_start, $2 + professionals.lunch_end, '[)')
    from target
    inner join public.professionals
      on professionals.id = target.professional_id
     and professionals.shop_id = target.shop_id
    where professionals.lunch_start is not null
  ),
  effective_openings as (
    select unnest(
      tsmultirange(merged_openings.opening_range)
      - coalesce(
          (
            select range_agg(raw_blocks.block_range)
            from raw_blocks
          ),
          '{}'::tsmultirange
        )
    ) as opening_range
    from merged_openings
  ),
  opening_bounds as (
    select
      lower(opening_range) as local_starts_at,
      upper(opening_range) as local_ends_at
    from effective_openings
  ),
  grid_bounds as (
    select
      opening_bounds.*,
      date_trunc('day', local_starts_at)
        + ceil(
            extract(
              epoch from local_starts_at - date_trunc('day', local_starts_at)
            ) / 900.0
          ) * interval '15 minutes' as first_candidate
    from opening_bounds
  ),
  candidates as (
    select distinct candidate.local_starts_at
    from target
    inner join grid_bounds on true
    cross join lateral generate_series(
      grid_bounds.first_candidate,
      grid_bounds.local_ends_at - target.service_duration - target.buffer_duration,
      interval '15 minutes'
    ) as candidate(local_starts_at)
  ),
  slots as (
    select
      $2 as local_date,
      candidates.local_starts_at::time as local_time,
      candidates.local_starts_at at time zone target.timezone as starts_at,
      candidates.local_starts_at at time zone target.timezone
        + target.service_duration as ends_at,
      target.buffer_duration,
      target.professional_id,
      target.shop_id
    from candidates
    cross join target
  )
  select slots.local_date, slots.local_time, slots.starts_at, slots.ends_at
  from slots
  where not exists (
    select 1
    from public.appointments
    where appointments.shop_id = slots.shop_id
      and appointments.professional_id = slots.professional_id
      and appointments.status in ('scheduled', 'confirmed')
      and tstzrange(
        slots.starts_at,
        slots.ends_at + slots.buffer_duration,
        '[)'
      ) && tstzrange(appointments.starts_at, appointments.occupied_until, '[)')
  )
  order by slots.local_time;
$$;

revoke all on function public.get_available_slots(uuid, date, uuid) from public;
grant execute on function public.get_available_slots(uuid, date, uuid) to anon, authenticated;
