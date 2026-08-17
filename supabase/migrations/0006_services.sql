create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  name text not null,
  description text,
  duration_minutes integer not null,
  price_cents integer not null,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_name_not_blank check (btrim(name) <> ''),
  constraint services_description_not_blank
    check (description is null or btrim(description) <> ''),
  constraint services_duration_positive check (duration_minutes > 0),
  constraint services_price_non_negative check (price_cents >= 0),
  constraint services_archive_matches_active
    check ((active and archived_at is null) or ((not active) and archived_at is not null)),
  constraint services_shop_id_id_key unique (shop_id, id)
);

revoke all on table public.services from anon, authenticated;
grant select on table public.services to anon, authenticated;
grant insert, update on table public.services to authenticated;

alter table public.services enable row level security;

create policy "services_select_public_active"
on public.services
for select
to anon, authenticated
using (active);

create policy "services_select_owner_all"
on public.services
for select
to authenticated
using (public.is_shop_owner(shop_id));

create policy "services_insert_owner"
on public.services
for insert
to authenticated
with check (public.is_shop_owner(shop_id));

create policy "services_update_owner"
on public.services
for update
to authenticated
using (public.is_shop_owner(shop_id))
with check (public.is_shop_owner(shop_id));
