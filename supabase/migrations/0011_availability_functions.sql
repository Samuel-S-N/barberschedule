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
  openings as (
    select
      $2 + working_periods.start_time as local_starts_at,
      $2 + working_periods.end_time as local_ends_at
    from target
    inner join public.working_periods
      on working_periods.shop_id = target.shop_id
     and working_periods.professional_id = target.professional_id
    where working_periods.weekday = extract(isodow from $2)::smallint

    union

    select
      $2 + schedule_overrides.start_time as local_starts_at,
      $2 + schedule_overrides.end_time as local_ends_at
    from target
    inner join public.schedule_overrides
      on schedule_overrides.shop_id = target.shop_id
     and schedule_overrides.professional_id = target.professional_id
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
      target.professional_id,
      target.shop_id
    from candidates
    cross join target
    where not exists (
      select 1
      from public.schedule_overrides
      where schedule_overrides.shop_id = target.shop_id
        and schedule_overrides.professional_id = target.professional_id
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
      and appointments.professional_id = slots.professional_id
      and appointments.status in ('scheduled', 'confirmed')
      and tstzrange(slots.starts_at, slots.ends_at + slots.buffer_duration, '[)')
        && tstzrange(appointments.starts_at, appointments.occupied_until, '[)')
  )
  order by slots.local_time;
$$;

revoke all on function public.get_available_slots(uuid, date, uuid) from public;
grant execute on function public.get_available_slots(uuid, date, uuid) to anon, authenticated;
