-- 1. The account setting. A Zenc account has one setting for every business (the account is not tied to one).
alter table public.profiles add column email_reminders boolean not null default true;

create function public.set_email_reminders(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  update public.profiles set email_reminders = coalesce(p_enabled, true), updated_at = now() where user_id = auth.uid();
end;
$$;

revoke all on function public.set_email_reminders(boolean) from public, anon;
grant execute on function public.set_email_reminders(boolean) to authenticated;

-- 2. The outbox accepts the e-mail event (list copied from 0062 plus the new type).
alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in (
  'appointment.booked', 'appointment.cancelled', 'appointment.rescheduled', 'appointment.reminder', 'recurrence.conflict',
  'appointment.confirmed', 'staff.awaiting_confirmation', 'staff.booked', 'staff.cancelled', 'staff.rescheduled',
  'recurrence.requested', 'recurrence.accepted', 'recurrence.rejected',
  'recurrence.cancel_requested', 'recurrence.cancel_accepted', 'recurrence.cancel_declined',
  'payout.due', 'payout.paid',
  'appointment.reminder_email'));

-- 3. Reminders: the push insert of 0022 unchanged, plus one e-mail row per eligible appointment (its own event key, so push and
-- e-mail are retried independently). The return value stays the number of push rows.
create or replace function public.enqueue_notification_reminders()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  inserted_count integer;
begin
  insert into public.notification_outbox (
    event_key, event_type, recipient_user_id, appointment_id, payload
  )
  select
    format('appointment:%s:reminder:24h', appointments.id),
    'appointment.reminder',
    customers.user_id,
    appointments.id,
    jsonb_build_object(
      'appointment_id', appointments.id,
      'shop_id', appointments.shop_id,
      'starts_at', appointments.starts_at,
      'ends_at', appointments.ends_at,
      'service_name', appointments.service_name_snapshot,
      'status', appointments.status
    )
  from public.appointments
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  where appointments.status in ('scheduled', 'confirmed')
    and customers.user_id is not null
    and appointments.starts_at > clock_timestamp() + interval '23 hours'
    and appointments.starts_at <= clock_timestamp() + interval '25 hours'
  on conflict (event_key) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.notification_outbox (
    event_key, event_type, recipient_user_id, appointment_id, payload
  )
  select
    format('appointment:%s:reminder:24h:email', appointments.id),
    'appointment.reminder_email',
    customers.user_id,
    appointments.id,
    jsonb_build_object(
      'appointment_id', appointments.id,
      'shop_id', appointments.shop_id,
      'starts_at', appointments.starts_at,
      'service_name', appointments.service_name_snapshot,
      'professional_name', professionals.name,
      'shop_name', shops.name,
      'shop_slug', shops.slug,
      'shop_timezone', shops.timezone,
      'shop_address', concat_ws(', ',
        nullif(concat_ws(' ', nullif(btrim(shops.address_street), ''), nullif(btrim(shops.address_number), '')), ''),
        nullif(btrim(shops.address_district), ''),
        nullif(concat_ws(' - ', nullif(btrim(shops.address_city), ''), nullif(btrim(shops.address_state), '')), ''))
    )
  from public.appointments
  join public.customers
    on customers.id = appointments.customer_id
   and customers.shop_id = appointments.shop_id
  join public.professionals
    on professionals.id = appointments.professional_id
   and professionals.shop_id = appointments.shop_id
  join public.shops on shops.id = appointments.shop_id
  join public.profiles on profiles.user_id = customers.user_id
  join auth.users on auth.users.id = customers.user_id
  where appointments.status in ('scheduled', 'confirmed')
    and customers.user_id is not null
    and profiles.email_reminders
    and coalesce(btrim(auth.users.email), '') <> ''
    and appointments.starts_at > clock_timestamp() + interval '23 hours'
    and appointments.starts_at <= clock_timestamp() + interval '25 hours'
  on conflict (event_key) do nothing;

  return inserted_count;
end;
$$;

revoke all on function public.enqueue_notification_reminders() from public, anon, authenticated;

-- 4. Claim: 0079 unchanged except for recipient_email, and e-mail rows do not join device tokens (one row per e-mail).
drop function public.claim_notification_batch(integer);

create function public.claim_notification_batch(target_limit integer default 50)
returns table (
  id uuid,
  event_type text,
  payload jsonb,
  expo_push_token text,
  attempts integer,
  max_attempts integer,
  locale text,
  web_subscription jsonb,
  web_origin text,
  shop_slug text,
  shop_name text,
  recipient_role text,
  recipient_email text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.status in ('pending', 'failed')
      and outbox.available_at <= clock_timestamp()
      and outbox.attempts < outbox.max_attempts
    order by outbox.created_at
    for update skip locked
    limit greatest(1, least(coalesce(target_limit, 50), 100))
  ), claimed as (
    update public.notification_outbox outbox
    set status = 'sending',
        attempts = outbox.attempts + 1,
        claimed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id,
         claimed.event_type,
         claimed.payload,
         tokens.expo_push_token,
         claimed.attempts,
         claimed.max_attempts,
         coalesce(tokens.locale, 'en'),
         tokens.web_subscription,
         tokens.web_origin,
         shops.slug,
         shops.name,
         profiles.role::text,
         accounts.email::text
  from claimed
  left join public.notification_tokens tokens
    on tokens.user_id = claimed.recipient_user_id
   and tokens.active
   and claimed.event_type <> 'appointment.reminder_email'
  left join public.shops shops
    on shops.id = case
      when claimed.payload ->> 'shop_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (claimed.payload ->> 'shop_id')::uuid
    end
  left join public.profiles profiles
    on profiles.user_id = claimed.recipient_user_id
  left join auth.users accounts
    on accounts.id = claimed.recipient_user_id
   and claimed.event_type = 'appointment.reminder_email';
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

-- 5. invite-professional builds the invite data with the business name, read with the service-role key.
grant select (name) on table public.shops to service_role;
