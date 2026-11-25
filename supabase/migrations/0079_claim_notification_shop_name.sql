-- Every push names the shop it comes from (its name becomes the title): the dispatcher needs the shop's name next to its slug.
-- Same function as 0073 (copied), plus shop_name. The return columns change, so it is dropped and created again with the same grants.
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
         shops.name,
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
