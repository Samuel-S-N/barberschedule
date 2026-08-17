create or replace function public.get_available_slots(
  barber_id uuid,
  local_date date,
  barber_service_id uuid
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
      barbers.id as barber_id,
      barbers.shop_id,
      shops.timezone,
      coalesce(
        barber_services.duration_override_minutes,
        services.duration_minutes
      ) * interval '1 minute' as service_duration,
      barbers.buffer_minutes * interval '1 minute' as buffer_duration
    from public.barber_services
    inner join public.barbers
      on barbers.id = barber_services.barber_id
     and barbers.shop_id = barber_services.shop_id
    inner join public.services
      on services.id = barber_services.service_id
     and services.shop_id = barber_services.shop_id
    inner join public.shops
      on shops.id = barbers.shop_id
    where barber_services.id = $3
      and barbers.id = $1
      and barber_services.active
      and barbers.active
      and services.active
  ),
  openings as (
    select
      $2 + working_periods.start_time as local_starts_at,
      $2 + working_periods.end_time as local_ends_at
    from target
    inner join public.working_periods
      on working_periods.shop_id = target.shop_id
     and working_periods.barber_id = target.barber_id
    where working_periods.weekday = extract(isodow from $2)::smallint

    union

    select
      $2 + schedule_overrides.start_time as local_starts_at,
      $2 + schedule_overrides.end_time as local_ends_at
    from target
    inner join public.schedule_overrides
      on schedule_overrides.shop_id = target.shop_id
     and schedule_overrides.barber_id = target.barber_id
    where schedule_overrides.local_date = $2
      and schedule_overrides.kind = 'opening'
  ),
  candidates as (
    select distinct candidate.local_starts_at
    from target
    inner join openings on true
    cross join lateral generate_series(
      openings.local_starts_at,
      openings.local_ends_at - target.service_duration - target.buffer_duration,
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
      target.barber_id,
      target.shop_id
    from candidates
    cross join target
    where not exists (
      select 1
      from public.schedule_overrides
      where schedule_overrides.shop_id = target.shop_id
        and schedule_overrides.barber_id = target.barber_id
        and schedule_overrides.local_date = $2
        and schedule_overrides.kind = 'block'
        and (
          schedule_overrides.start_time is null
          or tsrange(
            candidates.local_starts_at,
            candidates.local_starts_at + target.service_duration + target.buffer_duration,
            '[)'
          ) && tsrange(
            $2 + schedule_overrides.start_time,
            $2 + schedule_overrides.end_time,
            '[)'
          )
        )
    )
  )
  select slots.local_date, slots.local_time, slots.starts_at, slots.ends_at
  from slots
  where not exists (
    select 1
    from public.appointments
    where appointments.shop_id = slots.shop_id
      and appointments.barber_id = slots.barber_id
      and appointments.status in ('scheduled', 'confirmed')
      and tstzrange(slots.starts_at, slots.ends_at + slots.buffer_duration, '[)')
        && tstzrange(appointments.starts_at, appointments.occupied_until, '[)')
  )
  order by slots.local_time;
$$;

revoke all on function public.get_available_slots(uuid, date, uuid) from public;
grant execute on function public.get_available_slots(uuid, date, uuid) to anon, authenticated;
