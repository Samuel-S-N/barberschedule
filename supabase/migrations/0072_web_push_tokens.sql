-- Web Push next to Expo push: a notification_tokens row is either an Expo token (native app) or a browser PushSubscription.
alter table public.notification_tokens
  alter column expo_push_token drop not null,
  add column web_subscription jsonb,
  add column web_origin text,
  add constraint notification_tokens_one_kind check ((expo_push_token is not null) <> (web_subscription is not null)),
  add constraint notification_tokens_web_shape check (
    web_subscription is null or (
      jsonb_typeof(web_subscription) = 'object'
      and web_subscription ->> 'endpoint' ~ '^https://'
      and nullif(web_subscription #>> '{keys,p256dh}', '') is not null
      and nullif(web_subscription #>> '{keys,auth}', '') is not null
      and web_origin is not null
    )
  );

create unique index notification_tokens_web_endpoint_key
on public.notification_tokens ((web_subscription ->> 'endpoint'))
where web_subscription is not null;

-- Same pattern as register_notification_token: the caller's own row, upserted by the unique key (here the push endpoint, so a
-- browser used by another account is re-bound to that account instead of duplicated). Only endpoint and keys are stored.
create function public.register_web_push_subscription(
  target_subscription jsonb,
  target_origin text,
  target_locale text default null
)
returns setof public.notification_tokens
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_locale text := case when target_locale in ('en', 'pt', 'es') then target_locale else 'en' end;
  clean jsonb;
begin
  if actor_id is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_FORBIDDEN';
  end if;
  if jsonb_typeof(target_subscription) is distinct from 'object'
    or coalesce(target_subscription ->> 'endpoint', '') !~ '^https://[^[:space:]]+$'
    or char_length(target_subscription ->> 'endpoint') > 2000
    or coalesce(target_subscription #>> '{keys,p256dh}', '') = ''
    or coalesce(target_subscription #>> '{keys,auth}', '') = ''
    or coalesce(target_origin, '') !~ '^https?://[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$'
  then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_INVALID';
  end if;

  clean := jsonb_build_object(
    'endpoint', target_subscription ->> 'endpoint',
    'keys', jsonb_build_object('p256dh', target_subscription #>> '{keys,p256dh}', 'auth', target_subscription #>> '{keys,auth}')
  );

  return query
  insert into public.notification_tokens (user_id, web_subscription, web_origin, platform, locale)
  values (actor_id, clean, target_origin, 'web', normalized_locale)
  on conflict ((web_subscription ->> 'endpoint')) where web_subscription is not null do update
  set user_id = excluded.user_id,
      web_subscription = excluded.web_subscription,
      web_origin = excluded.web_origin,
      locale = case when target_locale is null then public.notification_tokens.locale else excluded.locale end,
      active = true,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning *;
end;
$$;

-- Sign-out: the signed-in user switches their own browser's subscription off (the client calls it before ending the session).
create function public.deactivate_my_web_subscription(target_endpoint text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_tokens
  set active = false, updated_at = clock_timestamp()
  where user_id = auth.uid() and web_subscription ->> 'endpoint' = target_endpoint;
$$;

-- The dispatcher's counterpart of deactivate_notification_token: the push service answered 404/410 (subscription gone).
create function public.deactivate_web_subscription(target_endpoint text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_tokens
  set active = false, updated_at = clock_timestamp()
  where web_subscription ->> 'endpoint' = target_endpoint;
$$;

revoke all on function public.register_web_push_subscription(jsonb, text, text) from public, anon;
grant execute on function public.register_web_push_subscription(jsonb, text, text) to authenticated;
revoke all on function public.deactivate_my_web_subscription(text) from public, anon;
grant execute on function public.deactivate_my_web_subscription(text) to authenticated;
revoke all on function public.deactivate_web_subscription(text) from public, anon, authenticated;
grant execute on function public.deactivate_web_subscription(text) to service_role;
