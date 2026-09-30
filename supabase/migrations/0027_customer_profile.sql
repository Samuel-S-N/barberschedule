alter table public.profiles add column avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create function public.set_my_avatar(p_path text)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  clean text := nullif(btrim(p_path), '');
  result public.profiles;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  -- Only an object path inside the caller's own folder is stored; the app builds the public URL from it.
  if clean is not null and clean !~ ('^' || actor::text || '/avatar-[0-9]+\.(jpg|png|webp)$') then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  update public.profiles
  set avatar_path = clean, updated_at = clock_timestamp()
  where user_id = actor
  returning * into result;

  return result;
end;
$$;

revoke all on function public.set_my_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;

create function public.sync_customer_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  update public.customers
  set email = new.email, updated_at = clock_timestamp()
  where user_id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_customer_email();
