grant select on table public.appointments to authenticated;

create policy "appointments_select_self"
on public.appointments
for select
to authenticated
using (
  exists (
    select 1
    from public.customers
    where customers.id = appointments.customer_id
      and customers.shop_id = appointments.shop_id
      and customers.user_id = auth.uid()
  )
);

create or replace function public.cancel_appointment(appointment_id uuid)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target record;
  owner_actor boolean;
begin
  if actor_id is null then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select appointments.*, customers.user_id as customer_user_id
  into target
  from public.appointments
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  where appointments.id = $1
  for update of appointments;

  if not found or target.status not in ('scheduled', 'confirmed') then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  owner_actor := public.is_shop_owner(target.shop_id);
  if not owner_actor and target.customer_user_id is distinct from actor_id then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  if not owner_actor
    and target.starts_at - clock_timestamp() < interval '90 minutes'
  then
    raise exception using errcode = 'P0011', message = 'APPOINTMENT_LIFECYCLE_LOCKED';
  end if;

  return query
  update public.appointments
  set status = 'cancelled', updated_at = clock_timestamp()
  where id = target.id
  returning *;
end;
$$;

create or replace function public.reschedule_appointment(
  appointment_id uuid,
  new_starts_at timestamptz
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target record;
  owner_actor boolean;
  target_local_day date;
  daily_lock_key bigint;
begin
  if actor_id is null then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select appointments.*, customers.user_id as customer_user_id, shops.timezone
  into target
  from public.appointments
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  join public.shops on shops.id = appointments.shop_id
  where appointments.id = $1
  for update of appointments;

  if not found or target.status not in ('scheduled', 'confirmed') then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  owner_actor := public.is_shop_owner(target.shop_id);
  if not owner_actor and target.customer_user_id is distinct from actor_id then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  if not owner_actor
    and target.starts_at - clock_timestamp() < interval '90 minutes'
  then
    raise exception using errcode = 'P0011', message = 'APPOINTMENT_LIFECYCLE_LOCKED';
  end if;

  if $2 <= clock_timestamp() then
    raise exception using errcode = 'P0009', message = 'INVALID_BOOKING_START';
  end if;

  target_local_day := ($2 at time zone target.timezone)::date;
  daily_lock_key := hashtextextended(
    format('%s:%s:%s', target.shop_id, target.customer_id, target_local_day),
    0
  );
  perform pg_advisory_xact_lock(daily_lock_key);

  if not owner_actor and exists (
    select 1
    from public.appointments
    where shop_id = target.shop_id
      and customer_id = target.customer_id
      and id <> target.id
      and status <> 'cancelled'
      and (starts_at at time zone target.timezone)::date = target_local_day
  ) then
    raise exception using errcode = 'P0002', message = 'DAILY_BOOKING_LIMIT';
  end if;

  update public.appointments
  set status = 'cancelled', updated_at = clock_timestamp()
  where id = target.id;

  if not exists (
    select 1
    from public.get_available_slots(
      target.barber_id,
      target_local_day,
      target.barber_service_id
    ) slot
    where slot.starts_at = $2
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  begin
    return query
    update public.appointments
    set
      starts_at = $2,
      ends_at = $2 + target.service_duration_minutes_snapshot * interval '1 minute',
      occupied_until = $2 + (
        target.service_duration_minutes_snapshot + target.barber_buffer_minutes_snapshot
      ) * interval '1 minute',
      status = target.status,
      updated_at = clock_timestamp()
    where id = target.id
    returning *;
  exception
    when exclusion_violation then
      raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end;
end;
$$;

revoke all on function public.cancel_appointment(uuid) from public;
revoke all on function public.reschedule_appointment(uuid, timestamptz) from public;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to authenticated;
