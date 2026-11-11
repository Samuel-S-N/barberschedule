alter table public.professional_services
add constraint professional_services_identity_key
  unique (shop_id, id, professional_id, service_id);

alter table public.appointments
add constraint appointments_professional_service_identity_fk
  foreign key (shop_id, professional_service_id, professional_id, service_id)
  references public.professional_services (shop_id, id, professional_id, service_id)
  on delete restrict;

create or replace function public.prevent_appointment_snapshot_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.service_name_snapshot is distinct from new.service_name_snapshot
    or old.service_duration_minutes_snapshot is distinct from new.service_duration_minutes_snapshot
    or old.service_price_cents_snapshot is distinct from new.service_price_cents_snapshot
    or old.professional_buffer_minutes_snapshot is distinct from new.professional_buffer_minutes_snapshot
  then
    raise exception using
      errcode = '22000',
      message = 'Appointment snapshots are immutable.';
  end if;

  return new;
end;
$$;

create trigger appointments_snapshot_immutable
before update on public.appointments
for each row execute function public.prevent_appointment_snapshot_update();

create or replace function public.validate_appointment_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.professional_services
    where shop_id = new.shop_id
      and id = new.professional_service_id
      and professional_id = new.professional_id
      and service_id = new.service_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Appointment professional service identity is invalid.';
  end if;

  return new;
end;
$$;

create trigger appointments_identity_valid
before insert or update on public.appointments
for each row execute function public.validate_appointment_identity();

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
