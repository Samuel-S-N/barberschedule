-- Recurrence plans: what the owner offers (service + price per session + every N weeks).
create table public.recurrence_plans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  service_id uuid not null,
  name text,
  interval_weeks smallint not null check (interval_weeks between 1 and 12),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (shop_id, service_id) references public.services (shop_id, id) on delete cascade
);

create unique index recurrence_plans_one_active on public.recurrence_plans (service_id, interval_weeks) where active;

alter table public.recurrence_plans enable row level security;
revoke all on table public.recurrence_plans from anon, authenticated;

-- Keep the prices the owner already set.
insert into public.recurrence_plans (shop_id, service_id, interval_weeks, price_cents)
select shop_id, service_id, interval_weeks, price_cents from public.service_recurrence_prices;

drop function public.set_recurrence_price(uuid, integer, integer);
drop function public.list_recurrence_prices(uuid);
drop table public.service_recurrence_prices;

-- Compatibility view: the request/accept functions of 0050 still look prices up by (service, weeks).
create view public.service_recurrence_prices as
select shop_id, service_id, interval_weeks, price_cents from public.recurrence_plans where active;
revoke all on public.service_recurrence_prices from anon, authenticated;

-- Requests may now be for any plan periodicity.
alter table public.recurrence_requests drop constraint recurrence_requests_interval_weeks_check;
alter table public.recurrence_requests add constraint recurrence_requests_interval_weeks_check check (interval_weeks between 1 and 12);

create function public.list_recurrence_plans(target_shop_id uuid)
returns table (id uuid, service_id uuid, service_name text, name text, interval_weeks smallint, price_cents integer, normal_cents integer, active boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  return query
  select p.id, p.service_id, s.name, p.name, p.interval_weeks, p.price_cents, s.price_cents, p.active
  from public.recurrence_plans p
  join public.services s on s.id = p.service_id and s.shop_id = p.shop_id
  where p.shop_id = target_shop_id
  order by s.name, p.interval_weeks;
end;
$$;

create function public.save_recurrence_plan(
  target_plan_id uuid, target_service_id uuid, target_interval_weeks integer, target_price_cents integer, target_name text, target_active boolean
)
returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  svc_shop uuid;
begin
  select shop_id into svc_shop from public.services where id = target_service_id;
  if svc_shop is null or not public.is_shop_owner(svc_shop) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_interval_weeks is null or target_interval_weeks not between 1 and 12 or target_price_cents is null or target_price_cents < 0 then
    raise exception using errcode = 'P0032', message = 'RECURRENCE_PRICE_INVALID';
  end if;
  if target_active and exists (
    select 1 from public.recurrence_plans p
    where p.service_id = target_service_id and p.interval_weeks = target_interval_weeks and p.active and p.id is distinct from target_plan_id
  ) then
    raise exception using errcode = 'P0033', message = 'RECURRENCE_PLAN_DUPLICATE';
  end if;

  if target_plan_id is null then
    insert into public.recurrence_plans (shop_id, service_id, name, interval_weeks, price_cents, active)
    values (svc_shop, target_service_id, nullif(btrim(target_name), ''), target_interval_weeks, target_price_cents, coalesce(target_active, true));
  else
    update public.recurrence_plans
    set service_id = target_service_id, name = nullif(btrim(target_name), ''), interval_weeks = target_interval_weeks,
        price_cents = target_price_cents, active = coalesce(target_active, true)
    where id = target_plan_id and shop_id = svc_shop;
    if not found then
      raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
    end if;
  end if;
end;
$$;

create function public.list_recurrence_plans_for_barber(target_barber_id uuid)
returns table (plan_id uuid, name text, service_name text, barber_service_id uuid, interval_weeks smallint, price_cents integer, normal_cents integer)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select p.id, p.name, s.name, bs.id, p.interval_weeks, p.price_cents, coalesce(bs.price_override_cents, s.price_cents)
  from public.recurrence_plans p
  join public.services s on s.id = p.service_id and s.shop_id = p.shop_id and s.active
  join public.barber_services bs on bs.service_id = s.id and bs.shop_id = p.shop_id and bs.barber_id = target_barber_id and bs.active
  join public.barbers b on b.id = bs.barber_id and b.shop_id = bs.shop_id and b.active
  where p.active and auth.uid() is not null
  order by s.name, p.interval_weeks;
$$;

revoke all on function public.list_recurrence_plans(uuid), public.save_recurrence_plan(uuid, uuid, integer, integer, text, boolean),
  public.list_recurrence_plans_for_barber(uuid) from public;
grant execute on function public.list_recurrence_plans(uuid), public.save_recurrence_plan(uuid, uuid, integer, integer, text, boolean),
  public.list_recurrence_plans_for_barber(uuid) to authenticated;

-- Periodicity is now validated against the active plans (any of 1-12 weeks) instead of 1/2.
create or replace function public.request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time)
returns setof public.recurrence_requests
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  bs public.barber_services%rowtype;
  cust public.customers%rowtype;
  tz text;
  local_today date;
  created public.recurrence_requests%rowtype;
  owner_user uuid;
  barber_user uuid;
  params jsonb;
begin
  select * into bs from public.barber_services where id = target_barber_service_id and active;
  select * into cust from public.customers where user_id = auth.uid() and shop_id = bs.shop_id and active;
  if bs.id is null or cust.id is null then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  select timezone, owner_user_id into tz, owner_user from public.shops where id = bs.shop_id;
  local_today := (clock_timestamp() at time zone tz)::date;
  if not exists (select 1 from public.recurrence_plans pl where pl.service_id = bs.service_id and pl.interval_weeks = target_interval_weeks and pl.active)
     or target_start_date < local_today or target_start_date > local_today + 90 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;
  if not exists (
    select 1 from public.get_available_slots(bs.barber_id, target_start_date, bs.id) slot where slot.local_time = target_start_time
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  insert into public.recurrence_requests (shop_id, customer_id, barber_id, barber_service_id, interval_weeks, local_start_date, local_start_time)
  values (bs.shop_id, cust.id, bs.barber_id, bs.id, target_interval_weeks, target_start_date, target_start_time)
  returning * into created;

  select user_id into barber_user from public.barbers where id = bs.barber_id;
  params := jsonb_build_object('customer_name', cust.full_name, 'interval_weeks', target_interval_weeks,
    'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(barber_user, 'recurrence_requested', params, format('recreq:%s:%s', created.id, barber_user), 'recurrence.requested');
  if owner_user is distinct from barber_user then
    perform public.add_inbox_event(owner_user, 'recurrence_requested', params, format('recreq:%s:%s', created.id, owner_user), 'recurrence.requested');
  end if;

  return next created;
end;
$$;

create or replace function public.create_recurrence_for_customer(
  target_customer_id uuid, target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time
)
returns setof public.recurrence_series
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  bs public.barber_services%rowtype;
  tz text;
  local_today date;
  price integer;
  created public.recurrence_series%rowtype;
  customer_user uuid;
begin
  select * into bs from public.barber_services where id = target_barber_service_id and active;
  if bs.id is null or not exists (
    select 1 from public.customers c where c.id = target_customer_id and c.shop_id = bs.shop_id and c.active
  ) then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  if not (public.is_shop_owner(bs.shop_id) or public.is_own_barber(bs.barber_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  select timezone into tz from public.shops where id = bs.shop_id;
  local_today := (clock_timestamp() at time zone tz)::date;
  if not exists (select 1 from public.recurrence_plans pl where pl.service_id = bs.service_id and pl.interval_weeks = target_interval_weeks and pl.active)
     or target_start_date < local_today or target_start_date > local_today + 90 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;

  select p.price_cents into price from public.service_recurrence_prices p
  where p.service_id = bs.service_id and p.interval_weeks = target_interval_weeks;
  insert into public.recurrence_series (shop_id, customer_id, barber_service_id, local_start_date, local_start_time, interval_weeks, special_price_cents)
  values (bs.shop_id, target_customer_id, bs.id, target_start_date, target_start_time, target_interval_weeks, price)
  returning * into created;
  perform public.materialize_shop_as_owner(bs.shop_id);

  select user_id into customer_user from public.customers where id = target_customer_id;
  perform public.add_inbox_event(customer_user, 'recurrence_accepted',
    jsonb_build_object('service_name', (select name from public.services where id = bs.service_id), 'interval_weeks', target_interval_weeks),
    format('recman:%s', created.id), 'recurrence.accepted');

  return next created;
end;
$$;
