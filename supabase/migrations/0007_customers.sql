create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  user_id uuid references public.profiles (user_id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_full_name_not_blank check (btrim(full_name) <> ''),
  constraint customers_email_not_blank check (email is null or btrim(email) <> ''),
  constraint customers_phone_not_blank check (phone is null or btrim(phone) <> ''),
  constraint customers_archive_matches_active
    check ((active and archived_at is null) or ((not active) and archived_at is not null)),
  constraint customers_contact_present
    check (email is not null or phone is not null or user_id is not null),
  constraint customers_shop_id_id_key unique (shop_id, id)
);

revoke all on table public.customers from anon, authenticated;
grant select on table public.customers to authenticated;
grant insert, update on table public.customers to authenticated;

alter table public.customers enable row level security;

create policy "customers_select_owner"
on public.customers
for select
to authenticated
using (public.is_shop_owner(shop_id));

create policy "customers_select_self"
on public.customers
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "customers_insert_owner"
on public.customers
for insert
to authenticated
with check (public.is_shop_owner(shop_id));

create policy "customers_update_owner"
on public.customers
for update
to authenticated
using (public.is_shop_owner(shop_id))
with check (public.is_shop_owner(shop_id));
