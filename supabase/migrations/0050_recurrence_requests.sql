
create type public.recurrence_request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');

create table public.service_recurrence_prices (
  shop_id uuid not null,
  service_id uuid not null,
  interval_weeks smallint not null check (interval_weeks in (1, 2)),
  price_cents integer not null check (price_cents >= 0),
  primary key (service_id, interval_weeks),
  foreign key (shop_id, service_id) references public.services (shop_id, id) on delete cascade
);

create table public.recurrence_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  customer_id uuid not null,
  barber_id uuid not null,
  barber_service_id uuid not null,
  interval_weeks smallint not null check (interval_weeks in (1, 2)),
  local_start_date date not null,
  local_start_time time not null,
  status public.recurrence_request_status not null default 'pending',
  series_id uuid references public.recurrence_series (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (shop_id, customer_id) references public.customers (shop_id, id) on delete restrict,
  foreign key (shop_id, barber_service_id) references public.barber_services (shop_id, id) on delete restrict
);
create unique index recurrence_requests_one_pending on public.recurrence_requests (customer_id, barber_service_id) where status = 'pending';

alter table public.service_recurrence_prices enable row level security;
alter table public.recurrence_requests enable row level security;
revoke all on table public.service_recurrence_prices, public.recurrence_requests from anon, authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'appointment_awaiting_confirmation','appointment_booked','appointment_confirmed','appointment_cancelled','appointment_rescheduled',
  'recurrence_requested','recurrence_accepted','recurrence_rejected'));

create function public.add_inbox_event(target_user uuid, target_kind text, target_params jsonb, target_key text, push_event text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if target_user is null or target_user is not distinct from auth.uid() then return; end if;
  insert into public.notifications (user_id, kind, params, event_key) values (target_user, target_kind, target_params, target_key)
  on conflict (event_key) do nothing;
  if found and push_event is not null then
    insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
    values ('push:' || target_key, push_event, target_user, target_params)
    on conflict (event_key) do nothing;
  end if;
end;
$$;
revoke all on function public.add_inbox_event(uuid, text, jsonb, text, text) from public;

-- The recurrence engine is owner-gated; this is the same impersonation materialize_recurrence_job uses.
create function public.materialize_shop_as_owner(target_shop_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  shop_row public.shops%rowtype;
  original_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select * into shop_row from public.shops where id = target_shop_id;
  perform set_config('request.jwt.claim.sub', shop_row.owner_user_id::text, true);
  perform public.ensure_recurrence_window(target_shop_id, (clock_timestamp() at time zone shop_row.timezone)::date + 90);
  perform set_config('request.jwt.claim.sub', coalesce(original_sub, ''), true);
end;
$$;
revoke all on function public.materialize_shop_as_owner(uuid) from public;

create function public.set_recurrence_price(target_service_id uuid, target_interval_weeks integer, target_price_cents integer)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare svc_shop uuid;
begin
  select shop_id into svc_shop from public.services where id = target_service_id;
  if svc_shop is null or not public.is_shop_owner(svc_shop) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if target_interval_weeks not in (1, 2) or target_price_cents < 0 then
    raise exception using errcode = 'P0032', message = 'RECURRENCE_PRICE_INVALID';
  end if;
  if target_price_cents is null then
    delete from public.service_recurrence_prices where service_id = target_service_id and interval_weeks = target_interval_weeks;
  else
    insert into public.service_recurrence_prices (shop_id, service_id, interval_weeks, price_cents)
    values (svc_shop, target_service_id, target_interval_weeks, target_price_cents)
    on conflict (service_id, interval_weeks) do update set price_cents = excluded.price_cents;
  end if;
end;
$$;

create function public.list_recurrence_prices(target_shop_id uuid)
returns table (service_id uuid, interval_weeks smallint, price_cents integer)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  return query select p.service_id, p.interval_weeks, p.price_cents from public.service_recurrence_prices p where p.shop_id = target_shop_id;
end;
$$;

create function public.get_recurrence_quote(target_barber_service_id uuid)
returns table (interval_weeks smallint, normal_cents integer, recurrence_cents integer)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN'; end if;
  return query
  select w.weeks::smallint,
         coalesce(bs.price_override_cents, s.price_cents),
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = w.weeks)
  from public.barber_services bs
  join public.services s on s.id = bs.service_id and s.shop_id = bs.shop_id
  cross join (values (1), (2)) as w(weeks)
  where bs.id = target_barber_service_id and bs.active and s.active;
end;
$$;

create function public.request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time)
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
  if target_interval_weeks not in (1, 2) or target_start_date < local_today or target_start_date > local_today + 90 then
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

create function public.cancel_my_recurrence_request(target_request_id uuid)
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  update public.recurrence_requests r set status = 'cancelled', decided_at = clock_timestamp()
  where r.id = target_request_id and r.status = 'pending'
    and exists (select 1 from public.customers c where c.id = r.customer_id and c.user_id = auth.uid());
$$;

create function public.list_my_recurrence_requests()
returns table (id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
               barber_name text, service_name text, recurrence_cents integer)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.status, r.interval_weeks, r.local_start_date, r.local_start_time, b.name, s.name,
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks)
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id and c.user_id = auth.uid()
  join public.barbers b on b.id = r.barber_id
  join public.barber_services bs on bs.id = r.barber_service_id
  join public.services s on s.id = bs.service_id
  order by r.created_at desc limit 20;
$$;

create function public.list_recurrence_requests(target_shop_id uuid)
returns table (id uuid, customer_name text, customer_phone text, barber_id uuid, barber_name text, service_name text,
               interval_weeks smallint, local_start_date date, local_start_time time, normal_cents integer, recurrence_cents integer)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, c.full_name, c.phone, r.barber_id, b.name, s.name, r.interval_weeks, r.local_start_date, r.local_start_time,
         coalesce(bs.price_override_cents, s.price_cents),
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks)
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id
  join public.barbers b on b.id = r.barber_id
  join public.barber_services bs on bs.id = r.barber_service_id
  join public.services s on s.id = bs.service_id
  where r.shop_id = target_shop_id and r.status = 'pending'
    and (public.is_shop_owner(target_shop_id) or public.is_own_barber(r.barber_id))
  order by r.created_at;
$$;

create function public.decide_recurrence_request(target_request_id uuid, accept boolean)
returns setof public.recurrence_requests
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  req public.recurrence_requests%rowtype;
  bs public.barber_services%rowtype;
  new_series_id uuid;
  price integer;
  customer_user uuid;
  result public.recurrence_requests%rowtype;
begin
  select * into req from public.recurrence_requests where id = target_request_id for update;
  if not found then raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if not (public.is_shop_owner(req.shop_id) or public.is_own_barber(req.barber_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if req.status <> 'pending' then
    raise exception using errcode = 'P0031', message = 'RECURRENCE_REQUEST_NOT_PENDING';
  end if;

  select * into bs from public.barber_services where id = req.barber_service_id;
  select user_id into customer_user from public.customers where id = req.customer_id;

  if accept then
    select p.price_cents into price from public.service_recurrence_prices p where p.service_id = bs.service_id and p.interval_weeks = req.interval_weeks;
    insert into public.recurrence_series (shop_id, customer_id, barber_service_id, local_start_date, local_start_time, interval_weeks, special_price_cents)
    values (req.shop_id, req.customer_id, req.barber_service_id, req.local_start_date, req.local_start_time, req.interval_weeks, price)
    returning id into new_series_id;

    perform public.materialize_shop_as_owner(req.shop_id);
  end if;

  update public.recurrence_requests
  set status = case when accept then 'accepted' else 'rejected' end::public.recurrence_request_status,
      series_id = new_series_id, decided_by = auth.uid(), decided_at = clock_timestamp()
  where id = req.id returning * into result;

  perform public.add_inbox_event(customer_user, case when accept then 'recurrence_accepted' else 'recurrence_rejected' end,
    jsonb_build_object('service_name', (select name from public.services where id = bs.service_id), 'interval_weeks', req.interval_weeks),
    format('recdec:%s', req.id),
    case when accept then 'recurrence.accepted' else 'recurrence.rejected' end);

  return next result;
end;
$$;

create function public.create_recurrence_for_customer(
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
  if target_interval_weeks not in (1, 2) or target_start_date < local_today or target_start_date > local_today + 90 then
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

revoke all on function public.set_recurrence_price(uuid, integer, integer), public.list_recurrence_prices(uuid),
  public.get_recurrence_quote(uuid), public.request_recurrence(uuid, integer, date, time), public.cancel_my_recurrence_request(uuid),
  public.list_my_recurrence_requests(), public.list_recurrence_requests(uuid), public.decide_recurrence_request(uuid, boolean),
  public.create_recurrence_for_customer(uuid, uuid, integer, date, time) from public;
grant execute on function public.set_recurrence_price(uuid, integer, integer), public.list_recurrence_prices(uuid),
  public.get_recurrence_quote(uuid), public.request_recurrence(uuid, integer, date, time), public.cancel_my_recurrence_request(uuid),
  public.list_my_recurrence_requests(), public.list_recurrence_requests(uuid), public.decide_recurrence_request(uuid, boolean),
  public.create_recurrence_for_customer(uuid, uuid, integer, date, time) to authenticated;
