create table public.professional_services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  professional_id uuid not null,
  service_id uuid not null,
  duration_override_minutes integer,
  price_override_cents integer,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_services_professional_fk
    foreign key (shop_id, professional_id)
    references public.professionals (shop_id, id)
    on delete restrict,
  constraint professional_services_service_fk
    foreign key (shop_id, service_id)
    references public.services (shop_id, id)
    on delete restrict,
  constraint professional_services_duration_override_positive
    check (duration_override_minutes is null or duration_override_minutes > 0),
  constraint professional_services_price_override_non_negative
    check (price_override_cents is null or price_override_cents >= 0),
  constraint professional_services_archive_matches_active
    check ((active and archived_at is null) or ((not active) and archived_at is not null)),
  constraint professional_services_unique unique (shop_id, professional_id, service_id)
);

create or replace function public.resolve_effective_service(target_professional_service_id uuid)
returns table (
  professional_service_id uuid,
  shop_id uuid,
  professional_id uuid,
  professional_name text,
  service_id uuid,
  service_name text,
  duration_minutes integer,
  price_cents integer,
  active boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  return query
  with resolved as (
    select
      professional_services.id as professional_service_id,
      professional_services.shop_id,
      professional_services.professional_id,
      professionals.name as professional_name,
      professional_services.service_id,
      services.name as service_name,
      coalesce(
        professional_services.duration_override_minutes,
        services.duration_minutes
      ) as duration_minutes,
      coalesce(
        professional_services.price_override_cents,
        services.price_cents
      ) as price_cents,
      (
        professional_services.active
        and professionals.active
        and services.active
      ) as active
    from public.professional_services
    inner join public.professionals
      on professionals.id = professional_services.professional_id
     and professionals.shop_id = professional_services.shop_id
    inner join public.services
      on services.id = professional_services.service_id
     and services.shop_id = professional_services.shop_id
    where professional_services.id = target_professional_service_id
  )
  select resolved.*
  from resolved
  where resolved.active
     or public.is_shop_owner(resolved.shop_id);
end;
$$;

revoke all on function public.resolve_effective_service(uuid) from public;
grant execute on function public.resolve_effective_service(uuid) to anon, authenticated;

revoke all on table public.professional_services from anon, authenticated;
grant select on table public.professional_services to anon, authenticated;
grant insert, update on table public.professional_services to authenticated;

alter table public.professional_services enable row level security;

create policy "professional_services_select_public_active"
on public.professional_services
for select
to anon, authenticated
using (
  active
  and exists(
    select 1
    from public.professionals
    where id = professional_id
      and shop_id = professional_services.shop_id
      and active
  )
  and exists(
    select 1
    from public.services
    where id = service_id
      and shop_id = professional_services.shop_id
      and active
  )
);

create policy "professional_services_select_owner_all"
on public.professional_services
for select
to authenticated
using (public.is_shop_owner(shop_id));

create policy "professional_services_insert_owner"
on public.professional_services
for insert
to authenticated
with check (public.is_shop_owner(shop_id));

create policy "professional_services_update_owner"
on public.professional_services
for update
to authenticated
using (public.is_shop_owner(shop_id))
with check (public.is_shop_owner(shop_id));
