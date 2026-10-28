-- Security audit 2026-10-27. Limits mirror the app's Zod schemas, so the app normally refuses first; these
-- constraints hold for callers that skip the app and talk to the API directly.
alter table public.appointments add constraint appointments_notes_length check (notes is null or char_length(notes) <= 500);
alter table public.customers
  add constraint customers_full_name_length check (char_length(full_name) <= 100),
  add constraint customers_email_length check (email is null or char_length(email) <= 254),
  add constraint customers_phone_length check (phone is null or char_length(phone) <= 30);
alter table public.profiles add constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 100);
alter table public.barbers
  add constraint barbers_name_length check (char_length(name) <= 80),
  add constraint barbers_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 500);
alter table public.services
  add constraint services_name_length check (char_length(name) <= 80),
  add constraint services_description_length check (description is null or char_length(description) <= 500);

-- Owners keep table-level insert/update on barbers and customers (rename, archive, serve as a barber), but linking
-- an account belongs to the RPCs (ensure_my_customer, barber_find_or_create_customer) and to invite-barber.
create function public.guard_account_link()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  -- Security definer RPCs run as their owner and invite-barber as the service role, so only direct writes are limited.
  if current_user = 'authenticated'
    and new.user_id is not null
    and new.user_id is distinct from (case when tg_op = 'UPDATE' then old.user_id end)
    and (tg_table_name = 'customers' or new.user_id <> auth.uid())
  then
    raise exception using errcode = '42501', message = 'ACCOUNT_LINK_FORBIDDEN';
  end if;

  return new;
end;
$$;

create trigger barbers_guard_account_link
before insert or update of user_id on public.barbers
for each row execute function public.guard_account_link();

create trigger customers_guard_account_link
before insert or update of user_id on public.customers
for each row execute function public.guard_account_link();

-- Push tokens come from Expo on the device; anything else is junk the dispatcher would send to Expo.
create or replace function public.register_notification_token(
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
  normalized_platform text := case when target_platform in ('ios', 'android', 'web') then target_platform end;
begin
  if actor_id is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_FORBIDDEN';
  end if;
  if target_expo_push_token is null or btrim(target_expo_push_token) !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]$' then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_INVALID';
  end if;

  return query
  insert into public.notification_tokens (user_id, expo_push_token, platform, locale)
  values (actor_id, btrim(target_expo_push_token), normalized_platform, normalized_locale)
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      locale = case when target_locale is null then public.notification_tokens.locale else excluded.locale end,
      active = true,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning *;
end;
$$;

-- The barber photo is the barber's own file in the public avatars bucket (the app stores its public URL), never an
-- arbitrary address that could track whoever opens the booking page.
create or replace function public.update_my_barber_profile(new_bio text, new_avatar_url text)
returns table (id uuid, bio text, avatar_url text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  clean_bio text := nullif(btrim(new_bio), '');
  clean_avatar text := nullif(btrim(new_avatar_url), '');
begin
  if clean_bio is not null and char_length(clean_bio) > 500 then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  if clean_avatar is not null and clean_avatar !~ (
    '^https?://[^/[:space:]?#]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/avatar-[0-9]+\.(jpg|png|webp)$'
  ) then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  return query
  update public.barbers
  set bio = clean_bio, avatar_url = clean_avatar, updated_at = clock_timestamp()
  where barbers.user_id = auth.uid() and barbers.active
  returning barbers.id, barbers.bio, barbers.avatar_url;

  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
end;
$$;
