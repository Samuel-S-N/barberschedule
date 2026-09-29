create type public.barber_compensation_type as enum ('commission', 'chair_rental');
create type public.chair_rental_frequency as enum ('weekly', 'monthly');

alter table public.barbers
  add column bio text,
  add column avatar_url text,
  add column compensation_type public.barber_compensation_type not null default 'commission',
  add column commission_percent numeric(5, 2) not null default 0,
  add column chair_rental_amount_cents integer,
  add column chair_rental_frequency public.chair_rental_frequency,
  add column invited_at timestamptz;

alter table public.barbers
  add constraint barbers_compensation_matches_type check (
    (
      compensation_type = 'commission'
      and commission_percent between 0 and 100
      and chair_rental_amount_cents is null
      and chair_rental_frequency is null
    ) or (
      compensation_type = 'chair_rental'
      and commission_percent = 0
      and chair_rental_amount_cents > 0
      and chair_rental_frequency is not null
    )
  ),
  add constraint barbers_bio_length check (bio is null or char_length(bio) <= 500);

create unique index barbers_user_id_key on public.barbers (user_id) where user_id is not null;

-- Owner-only listing now also exposes profile, compensation and invite state.
drop function public.list_owner_barbers(uuid);

create function public.list_owner_barbers(target_shop_id uuid)
returns table (
  id uuid,
  shop_id uuid,
  user_id uuid,
  name text,
  active boolean,
  archived_at timestamptz,
  bio text,
  avatar_url text,
  compensation_type public.barber_compensation_type,
  commission_percent numeric,
  chair_rental_amount_cents integer,
  chair_rental_frequency public.chair_rental_frequency,
  invited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    return;
  end if;

  return query
  select
    barbers.id,
    barbers.shop_id,
    barbers.user_id,
    barbers.name,
    barbers.active,
    barbers.archived_at,
    barbers.bio,
    barbers.avatar_url,
    barbers.compensation_type,
    barbers.commission_percent,
    barbers.chair_rental_amount_cents,
    barbers.chair_rental_frequency,
    barbers.invited_at
  from public.barbers
  where barbers.shop_id = target_shop_id
  order by barbers.name asc;
end;
$$;

revoke all on function public.list_owner_barbers(uuid) from public;
grant execute on function public.list_owner_barbers(uuid) to authenticated;

-- A barber acts only through the active barbers row linked to auth.uid().
create function public.is_own_barber(target_barber_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1
    from public.barbers
    where barbers.id = target_barber_id
      and barbers.user_id = auth.uid()
      and barbers.active
  );
$$;

revoke all on function public.is_own_barber(uuid) from public;
grant execute on function public.is_own_barber(uuid) to authenticated;

create policy "schedule_overrides_select_self"
on public.schedule_overrides
for select
to authenticated
using (public.is_own_barber(barber_id));

create policy "schedule_overrides_insert_self_block"
on public.schedule_overrides
for insert
to authenticated
with check (public.is_own_barber(barber_id) and kind = 'block');

create policy "schedule_overrides_delete_self_block"
on public.schedule_overrides
for delete
to authenticated
using (public.is_own_barber(barber_id) and kind = 'block');

create function public.get_my_barber_profile()
returns table (
  id uuid,
  shop_id uuid,
  name text,
  bio text,
  avatar_url text,
  compensation_type public.barber_compensation_type,
  commission_percent numeric,
  chair_rental_amount_cents integer,
  chair_rental_frequency public.chair_rental_frequency
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'BARBER_NOT_LINKED';
  end if;

  return query
  select
    barbers.id,
    barbers.shop_id,
    barbers.name,
    barbers.bio,
    barbers.avatar_url,
    barbers.compensation_type,
    barbers.commission_percent,
    barbers.chair_rental_amount_cents,
    barbers.chair_rental_frequency
  from public.barbers
  where barbers.user_id = auth.uid()
    and barbers.active;

  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
end;
$$;

create function public.list_my_barber_services()
returns table (
  barber_service_id uuid,
  service_id uuid,
  service_name text,
  duration_minutes integer,
  price_cents integer,
  active boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  my_barber_id uuid;
begin
  select barbers.id into my_barber_id
  from public.barbers
  where barbers.user_id = auth.uid() and barbers.active;

  if my_barber_id is null then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  return query
  select
    barber_services.id,
    services.id,
    services.name,
    coalesce(barber_services.duration_override_minutes, services.duration_minutes),
    coalesce(barber_services.price_override_cents, services.price_cents),
    (barber_services.active and services.active)
  from public.barber_services
  join public.services
    on services.id = barber_services.service_id
   and services.shop_id = barber_services.shop_id
  where barber_services.barber_id = my_barber_id
  order by services.name;
end;
$$;

create function public.update_my_barber_profile(new_bio text, new_avatar_url text)
returns table (
  id uuid,
  bio text,
  avatar_url text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  clean_bio text := nullif(btrim(new_bio), '');
  clean_avatar text := nullif(btrim(new_avatar_url), '');
begin
  if clean_bio is not null and char_length(clean_bio) > 500 then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  if clean_avatar is not null and clean_avatar !~* '^https?://[^\s]+$' then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  return query
  update public.barbers
  set bio = clean_bio, avatar_url = clean_avatar, updated_at = clock_timestamp()
  where barbers.user_id = auth.uid() and barbers.active
  returning barbers.id, barbers.bio, barbers.avatar_url;

  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
end;
$$;

create function public.list_my_barber_agenda(
  range_start date,
  range_end date,
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  id uuid,
  shop_id uuid,
  barber_id uuid,
  customer_id uuid,
  barber_service_id uuid,
  service_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  occupied_until timestamptz,
  status public.appointment_status,
  source public.appointment_source,
  notes text,
  service_name_snapshot text,
  service_duration_minutes_snapshot integer,
  service_price_cents_snapshot integer,
  barber_buffer_minutes_snapshot integer,
  created_at timestamptz,
  updated_at timestamptz,
  barber_name text,
  customer_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  my_barber_id uuid;
  my_shop_id uuid;
  target_timezone text;
begin
  select barbers.id, barbers.shop_id
  into my_barber_id, my_shop_id
  from public.barbers
  where barbers.user_id = auth.uid() and barbers.active;

  if my_barber_id is null then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  if range_end < range_start
    or range_end - range_start > 31
    or page_limit not between 1 and 100
    or page_offset < 0
  then
    raise exception using errcode = 'P0014', message = 'AGENDA_INVALID_RANGE';
  end if;

  select shops.timezone into target_timezone
  from public.shops
  where shops.id = my_shop_id;

  return query
  select
    appointments.id,
    appointments.shop_id,
    appointments.barber_id,
    appointments.customer_id,
    appointments.barber_service_id,
    appointments.service_id,
    appointments.starts_at,
    appointments.ends_at,
    appointments.occupied_until,
    appointments.status,
    appointments.source,
    appointments.notes,
    appointments.service_name_snapshot,
    appointments.service_duration_minutes_snapshot,
    appointments.service_price_cents_snapshot,
    appointments.barber_buffer_minutes_snapshot,
    appointments.created_at,
    appointments.updated_at,
    barbers.name,
    customers.full_name
  from public.appointments
  join public.barbers
    on barbers.id = appointments.barber_id
   and barbers.shop_id = appointments.shop_id
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  where appointments.barber_id = my_barber_id
    and appointments.starts_at >= range_start::timestamp at time zone target_timezone
    and appointments.starts_at < (range_end + 1)::timestamp at time zone target_timezone
  order by appointments.starts_at, appointments.id
  limit page_limit
  offset page_offset;
end;
$$;

create function public.set_my_appointment_status(
  appointment_id uuid,
  new_status public.appointment_status
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select * into target
  from public.appointments
  where id = appointment_id
  for update;

  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  if not public.is_own_barber(target.barber_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  if new_status not in ('completed', 'no_show')
    or target.status not in ('scheduled', 'confirmed') then
    raise exception using errcode = 'P0013', message = 'APPOINTMENT_STATUS_INVALID';
  end if;

  return query
  update public.appointments
  set status = new_status, updated_at = clock_timestamp()
  where id = target.id
  returning *;
end;
$$;

create function public.get_my_barber_earnings(period_start date, period_end date)
returns table (
  service_id uuid,
  service_name_snapshot text,
  completed_count bigint,
  gross_cents bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  my_barber_id uuid;
  my_shop_id uuid;
  target_timezone text;
begin
  select barbers.id, barbers.shop_id
  into my_barber_id, my_shop_id
  from public.barbers
  where barbers.user_id = auth.uid() and barbers.active;

  if my_barber_id is null then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  if period_end < period_start or period_end - period_start > 91 then
    raise exception using errcode = 'P0022', message = 'EARNINGS_INVALID_RANGE';
  end if;

  select shops.timezone into target_timezone
  from public.shops
  where shops.id = my_shop_id;

  return query
  select
    appointments.service_id,
    appointments.service_name_snapshot,
    count(*)::bigint,
    coalesce(sum(appointments.service_price_cents_snapshot), 0)::bigint
  from public.appointments
  where appointments.barber_id = my_barber_id
    and appointments.status = 'completed'
    and appointments.starts_at >= period_start::timestamp at time zone target_timezone
    and appointments.starts_at < (period_end + 1)::timestamp at time zone target_timezone
  group by appointments.service_id, appointments.service_name_snapshot
  order by appointments.service_name_snapshot;
end;
$$;

create function public.set_barber_compensation(
  target_barber_id uuid,
  new_type public.barber_compensation_type,
  new_commission_percent numeric default null,
  new_rental_amount_cents integer default null,
  new_rental_frequency public.chair_rental_frequency default null
)
returns table (
  id uuid,
  compensation_type public.barber_compensation_type,
  commission_percent numeric,
  chair_rental_amount_cents integer,
  chair_rental_frequency public.chair_rental_frequency
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_shop uuid;
begin
  select barbers.shop_id into target_shop
  from public.barbers
  where barbers.id = target_barber_id;

  if target_shop is null or not public.is_shop_owner(target_shop) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if new_type = 'commission' then
    if new_commission_percent is null
      or new_commission_percent not between 0 and 100
      or new_rental_amount_cents is not null
      or new_rental_frequency is not null then
      raise exception using errcode = 'P0021', message = 'COMPENSATION_INVALID';
    end if;
  else
    if new_rental_amount_cents is null
      or new_rental_amount_cents <= 0
      or new_rental_frequency is null
      or new_commission_percent is not null then
      raise exception using errcode = 'P0021', message = 'COMPENSATION_INVALID';
    end if;
  end if;

  return query
  update public.barbers
  set
    compensation_type = new_type,
    commission_percent = case when new_type = 'commission' then new_commission_percent else 0 end,
    chair_rental_amount_cents = case when new_type = 'chair_rental' then new_rental_amount_cents end,
    chair_rental_frequency = case when new_type = 'chair_rental' then new_rental_frequency end,
    updated_at = clock_timestamp()
  where barbers.id = target_barber_id
  returning
    barbers.id,
    barbers.compensation_type,
    barbers.commission_percent,
    barbers.chair_rental_amount_cents,
    barbers.chair_rental_frequency;
end;
$$;

create function public.get_barber_account_status(target_barber_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  target_shop uuid;
  target_user uuid;
begin
  select barbers.shop_id, barbers.user_id into target_shop, target_user
  from public.barbers
  where barbers.id = target_barber_id;

  if target_shop is null or not public.is_shop_owner(target_shop) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if target_user is null then
    return false;
  end if;

  return exists(
    select 1 from auth.users
    where users.id = target_user and users.last_sign_in_at is not null
  );
end;
$$;

revoke all on function public.get_my_barber_profile() from public;
revoke all on function public.list_my_barber_services() from public;
revoke all on function public.update_my_barber_profile(text, text) from public;
revoke all on function public.list_my_barber_agenda(date, date, integer, integer) from public;
revoke all on function public.set_my_appointment_status(uuid, public.appointment_status) from public;
revoke all on function public.get_my_barber_earnings(date, date) from public;
revoke all on function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency) from public;
revoke all on function public.get_barber_account_status(uuid) from public;

grant execute on function public.get_my_barber_profile() to authenticated;
grant execute on function public.list_my_barber_services() to authenticated;
grant execute on function public.update_my_barber_profile(text, text) to authenticated;
grant execute on function public.list_my_barber_agenda(date, date, integer, integer) to authenticated;
grant execute on function public.set_my_appointment_status(uuid, public.appointment_status) to authenticated;
grant execute on function public.get_my_barber_earnings(date, date) to authenticated;
grant execute on function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency) to authenticated;
grant execute on function public.get_barber_account_status(uuid) to authenticated;
