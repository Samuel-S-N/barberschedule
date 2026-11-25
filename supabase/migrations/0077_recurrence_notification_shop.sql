-- Recurrence notifications carry their shop. add_inbox_event (0050) inserted them with no shop, so the trigger guessed one from the
-- recipient (wrong for a professional in two shops) or left it null (a customer's row then showed in EVERY shop's inbox, see 0069).
-- add_inbox_event now takes the shop and every caller passes the one it already holds. The callers below are the latest definitions
-- (0058 for four, 0053 for create_recurrence_for_customer) copied verbatim; only the call to add_inbox_event changed.
drop function public.add_inbox_event(uuid, text, jsonb, text, text);

create function public.add_inbox_event(target_user uuid, target_shop uuid, target_kind text, target_params jsonb, target_key text, push_event text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if target_user is null or target_user is not distinct from auth.uid() then return; end if;
  insert into public.notifications (user_id, shop_id, kind, params, event_key) values (target_user, target_shop, target_kind, target_params, target_key)
  on conflict (event_key) do nothing;
  if found and push_event is not null then
    insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
    values ('push:' || target_key, push_event, target_user, target_params || jsonb_build_object('shop_id', target_shop))
    on conflict (event_key) do nothing;
  end if;
end;
$$;
revoke all on function public.add_inbox_event(uuid, uuid, text, jsonb, text, text) from public;

-- request_series_cancellation: from 0058_plan_change_and_cancellation.sql, 2 call(s) now pass series_row.shop_id
create or replace function public.request_series_cancellation(target_series_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  series_row public.recurrence_series%rowtype;
  cust public.customers%rowtype;
  bs public.professional_services%rowtype;
  owner_user uuid;
  professional_user uuid;
  params jsonb;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  select * into cust from public.customers where id = series_row.customer_id and user_id = auth.uid();
  if series_row.id is null or cust.id is null or not series_row.active or series_row.cancel_requested_at is not null then
    raise exception using errcode = 'P0037', message = 'RECURRENCE_CANCEL_NOT_ALLOWED';
  end if;

  update public.recurrence_series set cancel_requested_at = clock_timestamp(), updated_at = clock_timestamp() where id = series_row.id;

  select * into bs from public.professional_services where id = series_row.professional_service_id;
  select owner_user_id into owner_user from public.shops where id = series_row.shop_id;
  select user_id into professional_user from public.professionals where id = bs.professional_id;
  params := jsonb_build_object('customer_name', cust.full_name, 'interval_weeks', series_row.interval_weeks,
    'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(professional_user, series_row.shop_id, 'recurrence_cancel_requested', params, format('reccancelreq:%s:%s', series_row.id, professional_user), 'recurrence.cancel_requested');
  if owner_user is distinct from professional_user then
    perform public.add_inbox_event(owner_user, series_row.shop_id, 'recurrence_cancel_requested', params, format('reccancelreq:%s:%s', series_row.id, owner_user), 'recurrence.cancel_requested');
  end if;
end;
$$;

-- decide_series_cancellation: from 0058_plan_change_and_cancellation.sql, 1 call(s) now pass series_row.shop_id
create or replace function public.decide_series_cancellation(target_series_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  series_row public.recurrence_series%rowtype;
  bs public.professional_services%rowtype;
  customer_user uuid;
  params jsonb;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;
  select * into bs from public.professional_services where id = series_row.professional_service_id;
  if not (public.is_shop_owner(series_row.shop_id) or public.is_own_professional(bs.professional_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if series_row.cancel_requested_at is null or not series_row.active then
    raise exception using errcode = 'P0038', message = 'RECURRENCE_CANCEL_NOT_REQUESTED';
  end if;

  if accept then
    update public.appointments set status = 'cancelled', updated_at = clock_timestamp()
    where recurrence_series_id = series_row.id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed');
    update public.recurrence_series
    set active = false, ended_at = clock_timestamp(), cancel_requested_at = null, updated_at = clock_timestamp()
    where id = series_row.id;
  else
    update public.recurrence_series set cancel_requested_at = null, updated_at = clock_timestamp() where id = series_row.id;
  end if;

  select user_id into customer_user from public.customers where id = series_row.customer_id;
  params := jsonb_build_object('interval_weeks', series_row.interval_weeks, 'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(customer_user, series_row.shop_id,
    case when accept then 'recurrence_cancel_accepted' else 'recurrence_cancel_declined' end, params,
    format('reccanceldec:%s:%s', series_row.id, clock_timestamp()),
    case when accept then 'recurrence.cancel_accepted' else 'recurrence.cancel_declined' end);
end;
$$;

-- request_recurrence: from 0058_plan_change_and_cancellation.sql, 2 call(s) now pass bs.shop_id
create or replace function public.request_recurrence(target_professional_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time,
  target_replaces_series_id uuid default null, target_replaces_request_id uuid default null)
returns setof public.recurrence_requests
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  bs public.professional_services%rowtype;
  cust public.customers%rowtype;
  tz text;
  local_today date;
  created public.recurrence_requests%rowtype;
  owner_user uuid;
  professional_user uuid;
  params jsonb;
begin
  select * into bs from public.professional_services where id = target_professional_service_id and active;
  select * into cust from public.customers where user_id = auth.uid() and shop_id = bs.shop_id and active;
  if bs.id is null or cust.id is null then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  if target_replaces_series_id is not null and not exists (
    select 1 from public.recurrence_series s where s.id = target_replaces_series_id and s.customer_id = cust.id and s.active
  ) then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;
  if target_replaces_request_id is not null then
    update public.recurrence_requests set status = 'cancelled', decided_at = clock_timestamp()
    where id = target_replaces_request_id and customer_id = cust.id and status = 'pending';
    if not found then
      raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
    end if;
  end if;
  select timezone, owner_user_id into tz, owner_user from public.shops where id = bs.shop_id;
  local_today := (clock_timestamp() at time zone tz)::date;
  if not exists (select 1 from public.recurrence_plans pl where pl.service_id = bs.service_id and pl.interval_weeks = target_interval_weeks and pl.active)
     or target_start_date < local_today or target_start_date > local_today + 90 then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;
  if not exists (
    select 1 from public.get_available_slots(bs.professional_id, target_start_date, bs.id) slot where slot.local_time = target_start_time
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  insert into public.recurrence_requests (shop_id, customer_id, professional_id, professional_service_id, interval_weeks, local_start_date, local_start_time, replaces_series_id)
  values (bs.shop_id, cust.id, bs.professional_id, bs.id, target_interval_weeks, target_start_date, target_start_time, target_replaces_series_id)
  returning * into created;

  select user_id into professional_user from public.professionals where id = bs.professional_id;
  params := jsonb_build_object('customer_name', cust.full_name, 'interval_weeks', target_interval_weeks,
    'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(professional_user, bs.shop_id, 'recurrence_requested', params, format('recreq:%s:%s', created.id, professional_user), 'recurrence.requested');
  if owner_user is distinct from professional_user then
    perform public.add_inbox_event(owner_user, bs.shop_id, 'recurrence_requested', params, format('recreq:%s:%s', created.id, owner_user), 'recurrence.requested');
  end if;

  return next created;
end;
$$;

-- decide_recurrence_request: from 0058_plan_change_and_cancellation.sql, 1 call(s) now pass req.shop_id
create or replace function public.decide_recurrence_request(target_request_id uuid, accept boolean)
returns setof public.recurrence_requests
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  req public.recurrence_requests%rowtype;
  bs public.professional_services%rowtype;
  new_series_id uuid;
  price integer;
  customer_user uuid;
  result public.recurrence_requests%rowtype;
begin
  select * into req from public.recurrence_requests where id = target_request_id for update;
  if not found then raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if not (public.is_shop_owner(req.shop_id) or public.is_own_professional(req.professional_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if req.status <> 'pending' then
    raise exception using errcode = 'P0031', message = 'RECURRENCE_REQUEST_NOT_PENDING';
  end if;

  select * into bs from public.professional_services where id = req.professional_service_id;
  select user_id into customer_user from public.customers where id = req.customer_id;

  if accept then
    if req.replaces_series_id is not null then
      update public.appointments set status = 'cancelled', updated_at = clock_timestamp()
      where recurrence_series_id = req.replaces_series_id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed');
      update public.recurrence_series
      set active = false, ended_at = clock_timestamp(), cancel_requested_at = null, updated_at = clock_timestamp()
      where id = req.replaces_series_id and active;
    end if;
    select p.price_cents into price from public.service_recurrence_prices p where p.service_id = bs.service_id and p.interval_weeks = req.interval_weeks;
    insert into public.recurrence_series (shop_id, customer_id, professional_service_id, local_start_date, local_start_time, interval_weeks, special_price_cents)
    values (req.shop_id, req.customer_id, req.professional_service_id, req.local_start_date, req.local_start_time, req.interval_weeks, price)
    returning id into new_series_id;

    perform public.materialize_shop_as_owner(req.shop_id);
  end if;

  update public.recurrence_requests
  set status = case when accept then 'accepted' else 'rejected' end::public.recurrence_request_status,
      series_id = new_series_id, decided_by = auth.uid(), decided_at = clock_timestamp()
  where id = req.id returning * into result;

  perform public.add_inbox_event(customer_user, req.shop_id, case when accept then 'recurrence_accepted' else 'recurrence_rejected' end,
    jsonb_build_object('service_name', (select name from public.services where id = bs.service_id), 'interval_weeks', req.interval_weeks),
    format('recdec:%s', req.id),
    case when accept then 'recurrence.accepted' else 'recurrence.rejected' end);

  return next result;
end;
$$;

-- create_recurrence_for_customer: from 0053_recurrence_plans.sql, 1 call(s) now pass bs.shop_id
create or replace function public.create_recurrence_for_customer(
  target_customer_id uuid, target_professional_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time
)
returns setof public.recurrence_series
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  bs public.professional_services%rowtype;
  tz text;
  local_today date;
  price integer;
  created public.recurrence_series%rowtype;
  customer_user uuid;
begin
  select * into bs from public.professional_services where id = target_professional_service_id and active;
  if bs.id is null or not exists (
    select 1 from public.customers c where c.id = target_customer_id and c.shop_id = bs.shop_id and c.active
  ) then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  if not (public.is_shop_owner(bs.shop_id) or public.is_own_professional(bs.professional_id)) then
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
  insert into public.recurrence_series (shop_id, customer_id, professional_service_id, local_start_date, local_start_time, interval_weeks, special_price_cents)
  values (bs.shop_id, target_customer_id, bs.id, target_start_date, target_start_time, target_interval_weeks, price)
  returning * into created;
  perform public.materialize_shop_as_owner(bs.shop_id);

  select user_id into customer_user from public.customers where id = target_customer_id;
  perform public.add_inbox_event(customer_user, bs.shop_id, 'recurrence_accepted',
    jsonb_build_object('service_name', (select name from public.services where id = bs.service_id), 'interval_weeks', target_interval_weeks),
    format('recman:%s', created.id), 'recurrence.accepted');

  return next created;
end;
$$;
