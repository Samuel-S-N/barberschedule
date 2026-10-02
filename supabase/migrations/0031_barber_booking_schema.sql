alter type public.appointment_source add value if not exists 'barber';

alter table public.customers
  add column created_by_barber_id uuid references public.barbers (id) on delete restrict;

alter table public.customers drop constraint customers_contact_present;
alter table public.customers add constraint customers_contact_present
  check (
    email is not null or phone is not null or user_id is not null
    or anonymized_at is not null or created_by_barber_id is not null
  );

create unique index customers_shop_email_key
  on public.customers (shop_id, lower(email)) where email is not null;

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
  barber_actor boolean;
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
  barber_actor := public.is_own_barber(target.barber_id);
  if target_source = 'customer' and target.customer_user_id is distinct from actor_id then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if target_source in ('owner', 'recurrence') and not owner_actor then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if target_source = 'barber' and not barber_actor then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  local_day := (target_starts_at at time zone target.timezone)::date;
  if target_source = 'recurrence' and target_recurrence_occurrence_date <> local_day then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  daily_lock_key := hashtextextended(format('%s:%s:%s', target.shop_id, target_customer_id, local_day), 0);
  perform pg_advisory_xact_lock(daily_lock_key);

  if not (owner_actor or target_source = 'barber') and exists (
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

revoke all on function public.book_appointment_internal(uuid, uuid, timestamptz, public.appointment_source, text, integer, uuid, date) from public;
