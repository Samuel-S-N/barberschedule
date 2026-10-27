-- Payout notifications: the owner's due-today reminder and the barber's payout-received notice.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'appointment_awaiting_confirmation', 'appointment_booked', 'appointment_confirmed', 'appointment_cancelled', 'appointment_rescheduled',
  'recurrence_requested', 'recurrence_accepted', 'recurrence_rejected',
  'recurrence_cancel_requested', 'recurrence_cancel_accepted', 'recurrence_cancel_declined',
  'payout_due', 'payout_paid'));

alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in (
  'appointment.booked', 'appointment.cancelled', 'appointment.rescheduled', 'appointment.reminder', 'recurrence.conflict',
  'appointment.confirmed', 'staff.awaiting_confirmation', 'staff.booked', 'staff.cancelled', 'staff.rescheduled',
  'recurrence.requested', 'recurrence.accepted', 'recurrence.rejected',
  'recurrence.cancel_requested', 'recurrence.cancel_accepted', 'recurrence.cancel_declined',
  'payout.due', 'payout.paid'));

create function public.payout_due_barbers(target_shop uuid, local_date date)
returns table (barber_id uuid, barber_name text)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select b.id, b.name
  from public.barbers b
  join public.shops s on s.id = b.shop_id
  where b.shop_id = target_shop
    and b.active
    and b.compensation_type = 'commission'
    and b.payout_schedule <> 'none'
    and b.payout_tracking_start <= local_date
    and exists (select 1 from public.payout_due_dates(b.payout_schedule, b.payout_day_1, b.payout_day_2, local_date, local_date))
    and not exists (select 1 from public.barber_payouts p where p.barber_id = b.id and p.paid_on >= local_date)
    and public.payout_earned_cents(b.id, b.payout_tracking_start, s.timezone) - public.payout_paid_cents(b.id, b.payout_tracking_start) > 0
  order by b.name;
$$;
revoke all on function public.payout_due_barbers(uuid, date) from public, anon, authenticated;

create function public.enqueue_payout_due_notifications(now_at timestamptz default clock_timestamp())
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh record;
  local_date date;
  due_count integer;
  due_names jsonb;
  inbox_key text;
  event_params jsonb;
  created integer := 0;
begin
  for sh in select s.id, s.owner_user_id, s.timezone from public.shops s loop
    continue when (now_at at time zone sh.timezone)::time < time '08:00';
    local_date := (now_at at time zone sh.timezone)::date;

    select count(*)::int, coalesce(jsonb_agg(d.barber_name order by d.barber_name) filter (where d.rn <= 3), '[]'::jsonb)
    into due_count, due_names
    from (
      select x.barber_name, row_number() over (order by x.barber_name) as rn
      from public.payout_due_barbers(sh.id, local_date) x
    ) d;

    continue when due_count = 0;

    inbox_key := format('payout_due:%s:%s', sh.owner_user_id, local_date);
    event_params := jsonb_build_object('count', due_count, 'barber_names', due_names, 'date', local_date);

    insert into public.notifications (user_id, kind, params, event_key)
    values (sh.owner_user_id, 'payout_due', event_params, inbox_key)
    on conflict (event_key) do nothing;

    if found then
      insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
      values ('push:' || inbox_key, 'payout.due', sh.owner_user_id, event_params)
      on conflict (event_key) do nothing;
      created := created + 1;
    end if;
  end loop;

  return created;
end;
$$;
revoke all on function public.enqueue_payout_due_notifications(timestamptz) from public, anon, authenticated;

do $schedule$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema extensions';
    if to_regnamespace('cron') is not null then
      execute $sql$select cron.schedule('barberschedule-payout-due', '5 * * * *', 'select public.enqueue_payout_due_notifications();')$sql$;
    end if;
  end if;
end
$schedule$;

create or replace function public.record_barber_payout(
  target_barber_id uuid,
  payout_amount_cents integer,
  payout_paid_on date,
  payout_note text default null
)
returns public.barber_payouts
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  result public.barber_payouts;
  clean_note text := nullif(btrim(payout_note), '');
  barber_user uuid;
  inbox_key text;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  if payout_amount_cents is null or payout_amount_cents <= 0 or payout_paid_on is null
    or (clean_note is not null and char_length(clean_note) > 200)
    or not exists (
      select 1 from public.barbers b
      where b.id = target_barber_id and b.shop_id = sh.id and b.compensation_type = 'commission'
    )
  then
    raise exception using errcode = 'P0040', message = 'PAYOUT_INVALID';
  end if;

  insert into public.barber_payouts (shop_id, barber_id, amount_cents, paid_on, note)
  values (sh.id, target_barber_id, payout_amount_cents, payout_paid_on, clean_note)
  returning * into result;

  select b.user_id into barber_user from public.barbers b where b.id = target_barber_id;

  if barber_user is not null and barber_user is distinct from auth.uid() then
    inbox_key := 'payout_paid:' || result.id;

    insert into public.notifications (user_id, kind, params, event_key)
    values (barber_user, 'payout_paid', jsonb_build_object('amount_cents', result.amount_cents, 'paid_on', result.paid_on), inbox_key)
    on conflict (event_key) do nothing;

    insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
    values ('push:' || inbox_key, 'payout.paid', barber_user, jsonb_build_object('amount_cents', result.amount_cents, 'paid_on', result.paid_on))
    on conflict (event_key) do nothing;
  end if;

  return result;
end;
$$;

revoke all on function public.record_barber_payout(uuid, integer, date, text) from public, anon;
grant execute on function public.record_barber_payout(uuid, integer, date, text) to authenticated;
