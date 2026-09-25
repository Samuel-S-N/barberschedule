alter table public.notification_tokens
  add column locale text not null default 'en'
  constraint notification_tokens_locale_check check (locale in ('en', 'pt', 'es'));

drop function public.register_notification_token(text, text);

create function public.register_notification_token(
  target_expo_push_token text,
  target_platform text default null,
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
begin
  if actor_id is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_FORBIDDEN';
  end if;
  if target_expo_push_token is null or btrim(target_expo_push_token) = '' then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_INVALID';
  end if;

  return query
  insert into public.notification_tokens (user_id, expo_push_token, platform, locale)
  values (actor_id, btrim(target_expo_push_token), nullif(btrim(target_platform), ''), normalized_locale)
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      locale = excluded.locale,
      active = true,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning *;
end;
$$;

revoke all on function public.register_notification_token(text, text, text) from public;
grant execute on function public.register_notification_token(text, text, text) to authenticated;

drop function public.claim_notification_batch(integer);

create function public.claim_notification_batch(target_limit integer default 50)
returns table (
  id uuid,
  event_type text,
  payload jsonb,
  expo_push_token text,
  attempts integer,
  max_attempts integer,
  locale text
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
         coalesce(tokens.locale, 'en')
  from claimed
  left join public.notification_tokens tokens
    on tokens.user_id = claimed.recipient_user_id
   and tokens.active;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;
