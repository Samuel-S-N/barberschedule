create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  user_id uuid references public.profiles (user_id) on delete set null,
  name text not null,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professionals_name_not_blank check (btrim(name) <> ''),
  constraint professionals_archive_matches_active
    check ((active and archived_at is null) or ((not active) and archived_at is not null)),
  constraint professionals_shop_id_id_key unique (shop_id, id)
);

revoke all on table public.professionals from anon, authenticated;
grant select (id, shop_id, name, active, archived_at) on table public.professionals to anon, authenticated;
grant insert, update on table public.professionals to authenticated;

create or replace function public.list_owner_professionals(target_shop_id uuid)
returns table (
  id uuid,
  shop_id uuid,
  user_id uuid,
  name text,
  active boolean,
  archived_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    return;
  end if;

  return query
  select
    professionals.id,
    professionals.shop_id,
    professionals.user_id,
    professionals.name,
    professionals.active,
    professionals.archived_at
  from public.professionals
  where professionals.shop_id = target_shop_id
  order by professionals.name asc;
end;
$$;

revoke all on function public.list_owner_professionals(uuid) from public;
grant execute on function public.list_owner_professionals(uuid) to authenticated;

alter table public.professionals enable row level security;

create policy "professionals_select_public_active"
on public.professionals
for select
to anon, authenticated
using (active);

create policy "professionals_select_owner_all"
on public.professionals
for select
to authenticated
using (public.is_shop_owner(shop_id));

create policy "professionals_insert_owner"
on public.professionals
for insert
to authenticated
with check (public.is_shop_owner(shop_id));

create policy "professionals_update_owner"
on public.professionals
for update
to authenticated
using (public.is_shop_owner(shop_id))
with check (public.is_shop_owner(shop_id));
