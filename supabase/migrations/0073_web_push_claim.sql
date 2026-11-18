-- claim_notification_batch also tells the dispatcher which subscription it is (web_subscription, web_origin), which shop the notification
-- is about (shop_slug, null for events whose payload has no shop_id) and the recipient's role (to pick the screen to open).
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
  recipient_role text
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
         profiles.role::text
  from claimed
  left join public.notification_tokens tokens
    on tokens.user_id = claimed.recipient_user_id
   and tokens.active
  left join public.shops shops
    on shops.id = case
      when claimed.payload ->> 'shop_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (claimed.payload ->> 'shop_id')::uuid
    end
  left join public.profiles profiles
    on profiles.user_id = claimed.recipient_user_id;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

-- The account data export lists the user's push registrations. Web rows have no Expo token (token_suffix would be null), so they
-- show their origin; the subscription's endpoint and keys are secrets of the push channel and are never exported.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'exported_at', clock_timestamp(),
    'account_email', (select email from auth.users where id = actor),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = actor),
    'customers', coalesce((select jsonb_agg(to_jsonb(c)) from public.customers c where c.user_id = actor), '[]'::jsonb),
    'professionals', coalesce((select jsonb_agg(to_jsonb(b)) from public.professionals b where b.user_id = actor), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at)
      from public.appointments a
      join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'recurrence_series', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.recurrence_series s
      join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(k) order by k.accepted_at) from public.consents k where k.user_id = actor), '[]'::jsonb),
    'notification_tokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'active', t.active,
        'token_suffix', right(t.expo_push_token, 6), 'web_origin', t.web_origin, 'created_at', t.created_at))
      from public.notification_tokens t where t.user_id = actor
    ), '[]'::jsonb)
  );
end;
$$;
