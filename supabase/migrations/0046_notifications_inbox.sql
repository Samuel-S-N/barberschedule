-- In-app notification inbox (the bell). Text is never stored: rows carry a kind and params, rendered per viewer language.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  appointment_id uuid references public.appointments (id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  event_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint notifications_kind_check check (kind in (
    'appointment_awaiting_confirmation', 'appointment_booked', 'appointment_confirmed',
    'appointment_cancelled', 'appointment_rescheduled'
  ))
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = auth.uid());

-- Push events that were never sent before: customer "confirmed" and everything for barbers and owners.
alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in (
  'appointment.booked', 'appointment.cancelled', 'appointment.rescheduled', 'appointment.reminder', 'recurrence.conflict',
  'appointment.confirmed', 'staff.awaiting_confirmation', 'staff.booked', 'staff.cancelled', 'staff.rescheduled',
  'recurrence.requested', 'recurrence.accepted', 'recurrence.rejected'
));

create function public.add_inbox_notification(
  target_user uuid,
  target_kind text,
  appt public.appointments,
  key_suffix text default '',
  push_event text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  event_params jsonb;
  inbox_key text := format('%s:%s:%s%s', appt.id, target_kind, target_user, key_suffix);
begin
  if target_user is null or target_user is not distinct from auth.uid() then
    return;
  end if;

  select jsonb_build_object(
    'service_name', appt.service_name_snapshot,
    'starts_at', appt.starts_at,
    'customer_name', c.full_name,
    'barber_name', b.name
  )
  into event_params
  from public.customers c, public.barbers b
  where c.id = appt.customer_id and c.shop_id = appt.shop_id
    and b.id = appt.barber_id and b.shop_id = appt.shop_id;

  if event_params is null then
    return;
  end if;

  insert into public.notifications (user_id, kind, appointment_id, params, event_key)
  values (target_user, target_kind, appt.id, event_params, inbox_key)
  on conflict (event_key) do nothing;

  if found and push_event is not null then
    insert into public.notification_outbox (event_key, event_type, recipient_user_id, appointment_id, payload)
    values (
      'push:' || inbox_key, push_event, target_user, appt.id,
      event_params || jsonb_build_object('appointment_id', appt.id, 'shop_id', appt.shop_id, 'status', appt.status)
    )
    on conflict (event_key) do nothing;
  end if;
end;
$$;

revoke all on function public.add_inbox_notification(uuid, text, public.appointments, text, text) from public;

create function public.appointments_inbox_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  customer_user uuid;
  barber_user uuid;
  owner_user uuid;
  staff_kind text;
  customer_kind text;
  push_event text;
  suffix text := '';
begin
  -- The recurrence engine inserts up to 90 days at once; that must not flood barbers and owners.
  if new.source = 'recurrence' then
    return new;
  end if;

  select user_id into customer_user from public.customers where id = new.customer_id and shop_id = new.shop_id;
  select user_id into barber_user from public.barbers where id = new.barber_id and shop_id = new.shop_id;
  select owner_user_id into owner_user from public.shops where id = new.shop_id;

  if tg_op = 'INSERT' then
    staff_kind := case new.status
      when 'scheduled' then 'appointment_awaiting_confirmation'
      when 'confirmed' then 'appointment_booked'
    end;
    customer_kind := case new.status when 'confirmed' then 'appointment_confirmed' end;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    staff_kind := 'appointment_cancelled';
    customer_kind := 'appointment_cancelled';
  elsif new.status = 'confirmed' and old.status = 'scheduled' then
    customer_kind := 'appointment_confirmed';
  elsif new.starts_at is distinct from old.starts_at and new.status in ('scheduled', 'confirmed') then
    staff_kind := 'appointment_rescheduled';
    customer_kind := 'appointment_rescheduled';
    suffix := ':' || new.starts_at::text;
  end if;

  -- Customer cancelled/rescheduled pushes already come from enqueue_appointment_notification, and an INSERT already
  -- pushes "booked" to the customer; only the scheduled -> confirmed UPDATE is new.
  if customer_kind is not null then
    perform public.add_inbox_notification(
      customer_user, customer_kind, new, suffix,
      case when tg_op = 'UPDATE' and customer_kind = 'appointment_confirmed' then 'appointment.confirmed' end
    );
  end if;

  if staff_kind is not null then
    push_event := 'staff.' || replace(staff_kind, 'appointment_', '');
    perform public.add_inbox_notification(barber_user, staff_kind, new, suffix, push_event);
    if owner_user is distinct from barber_user then
      perform public.add_inbox_notification(owner_user, staff_kind, new, suffix, push_event);
    end if;
  end if;

  return new;
end;
$$;

create trigger appointments_inbox_events
after insert or update on public.appointments
for each row execute function public.appointments_inbox_events();

create function public.count_unread_notifications()
returns integer
language sql
stable
security invoker
as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;

create function public.mark_notifications_read(target_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_FORBIDDEN';
  end if;

  update public.notifications
  set read_at = clock_timestamp()
  where user_id = auth.uid() and read_at is null and (target_ids is null or id = any (target_ids));
  get diagnostics changed = row_count;

  return changed;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.count_unread_notifications() to authenticated;
