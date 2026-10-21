-- A plan request can replace a running series or a pending request; customers can ask to cancel a running plan.
alter table public.recurrence_requests add column replaces_series_id uuid references public.recurrence_series (id) on delete set null;
alter table public.recurrence_series add column cancel_requested_at timestamptz;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'appointment_awaiting_confirmation', 'appointment_booked', 'appointment_confirmed', 'appointment_cancelled', 'appointment_rescheduled',
  'recurrence_requested', 'recurrence_accepted', 'recurrence_rejected',
  'recurrence_cancel_requested', 'recurrence_cancel_accepted', 'recurrence_cancel_declined'));

alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in (
  'appointment.booked', 'appointment.cancelled', 'appointment.rescheduled', 'appointment.reminder', 'recurrence.conflict',
  'appointment.confirmed', 'staff.awaiting_confirmation', 'staff.booked', 'staff.cancelled', 'staff.rescheduled',
  'recurrence.requested', 'recurrence.accepted', 'recurrence.rejected',
  'recurrence.cancel_requested', 'recurrence.cancel_accepted', 'recurrence.cancel_declined'));

drop function public.list_my_recurrence_requests();
create function public.list_my_recurrence_requests()
returns table (
  id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
  barber_name text, service_name text, recurrence_cents integer,
  series_id uuid, series_active boolean, series_ended_at timestamptz, plan_name text, cancel_requested_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.status, r.interval_weeks, r.local_start_date, r.local_start_time, b.name, s.name,
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks),
         r.series_id, rs.active, rs.ended_at,
         (select pl.name from public.recurrence_plans pl where pl.service_id = s.id and pl.interval_weeks = r.interval_weeks order by pl.active desc, pl.created_at desc limit 1),
         rs.cancel_requested_at
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id and c.user_id = auth.uid()
  join public.barbers b on b.id = r.barber_id
  join public.barber_services bs on bs.id = r.barber_service_id
  join public.services s on s.id = bs.service_id
  left join public.recurrence_series rs on rs.id = r.series_id
  order by r.created_at desc limit 20;
$$;
revoke all on function public.list_my_recurrence_requests() from public, anon;
grant execute on function public.list_my_recurrence_requests() to authenticated;

create function public.request_series_cancellation(target_series_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  series_row public.recurrence_series%rowtype;
  cust public.customers%rowtype;
  bs public.barber_services%rowtype;
  owner_user uuid;
  barber_user uuid;
  params jsonb;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  select * into cust from public.customers where id = series_row.customer_id and user_id = auth.uid();
  if series_row.id is null or cust.id is null or not series_row.active or series_row.cancel_requested_at is not null then
    raise exception using errcode = 'P0037', message = 'RECURRENCE_CANCEL_NOT_ALLOWED';
  end if;

  update public.recurrence_series set cancel_requested_at = clock_timestamp(), updated_at = clock_timestamp() where id = series_row.id;

  select * into bs from public.barber_services where id = series_row.barber_service_id;
  select owner_user_id into owner_user from public.shops where id = series_row.shop_id;
  select user_id into barber_user from public.barbers where id = bs.barber_id;
  params := jsonb_build_object('customer_name', cust.full_name, 'interval_weeks', series_row.interval_weeks,
    'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(barber_user, 'recurrence_cancel_requested', params, format('reccancelreq:%s:%s', series_row.id, barber_user), 'recurrence.cancel_requested');
  if owner_user is distinct from barber_user then
    perform public.add_inbox_event(owner_user, 'recurrence_cancel_requested', params, format('reccancelreq:%s:%s', series_row.id, owner_user), 'recurrence.cancel_requested');
  end if;
end;
$$;

create function public.decide_series_cancellation(target_series_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  series_row public.recurrence_series%rowtype;
  bs public.barber_services%rowtype;
  customer_user uuid;
  params jsonb;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;
  select * into bs from public.barber_services where id = series_row.barber_service_id;
  if not (public.is_shop_owner(series_row.shop_id) or public.is_own_barber(bs.barber_id)) then
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
  perform public.add_inbox_event(customer_user,
    case when accept then 'recurrence_cancel_accepted' else 'recurrence_cancel_declined' end, params,
    format('reccanceldec:%s:%s', series_row.id, clock_timestamp()),
    case when accept then 'recurrence.cancel_accepted' else 'recurrence.cancel_declined' end);
end;
$$;

create function public.list_recurrence_cancellations(target_shop_id uuid)
returns table (series_id uuid, customer_name text, customer_phone text, barber_name text, service_name text, interval_weeks smallint, requested_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select rs.id, c.full_name, c.phone, b.name, s.name, rs.interval_weeks, rs.cancel_requested_at
  from public.recurrence_series rs
  join public.customers c on c.id = rs.customer_id and c.shop_id = rs.shop_id
  join public.barber_services bs on bs.id = rs.barber_service_id
  join public.barbers b on b.id = bs.barber_id
  join public.services s on s.id = bs.service_id
  where rs.shop_id = target_shop_id and rs.active and rs.cancel_requested_at is not null
    and (public.is_shop_owner(target_shop_id) or public.is_own_barber(bs.barber_id))
  order by rs.cancel_requested_at;
$$;

revoke all on function public.request_series_cancellation(uuid), public.decide_series_cancellation(uuid, boolean),
  public.list_recurrence_cancellations(uuid) from public, anon;
grant execute on function public.request_series_cancellation(uuid), public.decide_series_cancellation(uuid, boolean),
  public.list_recurrence_cancellations(uuid) to authenticated;

-- The old four-argument signature goes away; the new one keeps working for four arguments through the defaults.
drop function public.request_recurrence(uuid, integer, date, time);

create function public.request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time,
  target_replaces_series_id uuid default null, target_replaces_request_id uuid default null)
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
    select 1 from public.get_available_slots(bs.barber_id, target_start_date, bs.id) slot where slot.local_time = target_start_time
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  insert into public.recurrence_requests (shop_id, customer_id, barber_id, barber_service_id, interval_weeks, local_start_date, local_start_time, replaces_series_id)
  values (bs.shop_id, cust.id, bs.barber_id, bs.id, target_interval_weeks, target_start_date, target_start_time, target_replaces_series_id)
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
revoke all on function public.request_recurrence(uuid, integer, date, time, uuid, uuid) from public, anon;
grant execute on function public.request_recurrence(uuid, integer, date, time, uuid, uuid) to authenticated;

-- Accepting a change ends the series it replaces, in the same transaction.
create or replace function public.decide_recurrence_request(target_request_id uuid, accept boolean)
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
    if req.replaces_series_id is not null then
      update public.appointments set status = 'cancelled', updated_at = clock_timestamp()
      where recurrence_series_id = req.replaces_series_id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed');
      update public.recurrence_series
      set active = false, ended_at = clock_timestamp(), cancel_requested_at = null, updated_at = clock_timestamp()
      where id = req.replaces_series_id and active;
    end if;
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
