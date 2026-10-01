alter table public.services add column is_standard boolean not null default false;

create function public.fan_out_standard_service()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.is_standard and new.active then
    insert into public.barber_services (shop_id, barber_id, service_id, active, archived_at)
    select new.shop_id, b.id, new.id, true, null
    from public.barbers b
    where b.shop_id = new.shop_id and b.active
    on conflict (shop_id, barber_id, service_id)
    do update set active = true, archived_at = null, updated_at = clock_timestamp();
  end if;

  return null;
end;
$$;

create trigger services_fan_out_standard
after insert or update of is_standard, active on public.services
for each row execute function public.fan_out_standard_service();

create function public.inherit_standard_services()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.active then
    insert into public.barber_services (shop_id, barber_id, service_id, active, archived_at)
    select new.shop_id, new.id, s.id, true, null
    from public.services s
    where s.shop_id = new.shop_id and s.active and s.is_standard
    on conflict (shop_id, barber_id, service_id)
    do update set active = true, archived_at = null, updated_at = clock_timestamp();
  end if;

  return null;
end;
$$;

create trigger barbers_inherit_standard
after insert or update of active on public.barbers
for each row execute function public.inherit_standard_services();

create function public.list_my_service_options()
returns table (
  service_id uuid,
  service_name text,
  description text,
  duration_minutes integer,
  price_cents integer,
  is_standard boolean,
  enabled boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  return query
  select
    s.id,
    s.name,
    s.description,
    coalesce(bs.duration_override_minutes, s.duration_minutes),
    coalesce(bs.price_override_cents, s.price_cents),
    s.is_standard,
    (s.is_standard or coalesce(bs.active, false))
  from public.services s
  left join public.barber_services bs
    on bs.service_id = s.id and bs.shop_id = s.shop_id and bs.barber_id = me.id
  where s.shop_id = me.shop_id and s.active
  order by s.is_standard desc, s.name;
end;
$$;

create function public.set_my_service_enabled(target_service_id uuid, new_enabled boolean)
returns table (service_id uuid, enabled boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  target public.services%rowtype;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  select * into target from public.services where id = target_service_id and shop_id = me.shop_id and active;
  if not found then
    raise exception using errcode = 'P0004', message = 'SERVICE_UNAVAILABLE';
  end if;
  if target.is_standard then
    raise exception using errcode = 'P0026', message = 'SERVICE_STANDARD_LOCKED';
  end if;

  insert into public.barber_services (shop_id, barber_id, service_id, active, archived_at)
  values (me.shop_id, me.id, target.id, new_enabled, case when new_enabled then null else now() end)
  on conflict on constraint barber_services_unique
  do update set
    active = new_enabled,
    archived_at = case when new_enabled then null else coalesce(public.barber_services.archived_at, now()) end,
    updated_at = clock_timestamp();

  return query select target.id, new_enabled;
end;
$$;

revoke all on function public.list_my_service_options() from public, anon;
revoke all on function public.set_my_service_enabled(uuid, boolean) from public, anon;
grant execute on function public.list_my_service_options() to authenticated;
grant execute on function public.set_my_service_enabled(uuid, boolean) to authenticated;
