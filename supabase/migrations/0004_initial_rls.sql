create or replace function public.get_current_profile()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return;
  end if;

  return query
  select profiles.*
  from public.profiles
  where user_id = current_user_id;
end;
$$;

create or replace function public.is_shop_owner(shop_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return false;
  end if;

  return exists(
    select 1
    from public.shops
    where id = shop_id
      and owner_user_id = current_user_id
  );
end;
$$;

revoke all on function public.get_current_profile() from public;
revoke all on function public.is_shop_owner(uuid) from public;
grant execute on function public.get_current_profile() to authenticated;
grant execute on function public.is_shop_owner(uuid) to authenticated;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.shops from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select (id, name, timezone) on table public.shops to anon, authenticated;
grant update (name, timezone) on table public.shops to authenticated;

alter table public.profiles enable row level security;
alter table public.shops enable row level security;

create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "shops_select_public"
on public.shops
for select
to anon, authenticated
using (true);

create policy "shops_update_owner"
on public.shops
for update
to authenticated
using (public.is_shop_owner(id))
with check ((select auth.uid()) = owner_user_id);
