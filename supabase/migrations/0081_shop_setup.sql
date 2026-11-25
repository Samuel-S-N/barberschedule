-- A business is closed to customers until its owner finishes the setup checklist. `setup_completed_at` is null while closed. The
-- default is now() so every shop inserted directly (seed, tests, dev scripts) is open; create_shop sets it to null on purpose.
alter table public.shops add column setup_completed_at timestamptz default now();

-- Whether a business is open is public information (the closed page and the booking screens read it with the name and slug).
-- Owners get NO update grant: only complete_shop_setup writes it.
grant select (setup_completed_at) on table public.shops to anon, authenticated;

-- create_shop (0070) unchanged except for setup_completed_at = null.
create or replace function public.create_shop(
  p_name text,
  p_slug text,
  p_owner_user_id uuid,
  p_timezone text default 'America/Sao_Paulo'
)
returns public.shops
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  owner_role public.profile_role;
  created public.shops;
  violated text;
begin
  select role into owner_role from public.profiles where user_id = p_owner_user_id;
  if not found
    or owner_role = 'professional'
    or exists (select 1 from public.professionals where user_id = p_owner_user_id)
    or exists (select 1 from public.shops where owner_user_id = p_owner_user_id)
  then
    raise exception using errcode = 'P0042', message = 'SHOP_OWNER_INVALID';
  end if;

  begin
    insert into public.shops (name, slug, owner_user_id, timezone, setup_completed_at)
    values (btrim(p_name), p_slug, p_owner_user_id, coalesce(p_timezone, 'America/Sao_Paulo'), null)
    returning * into created;
  exception when unique_violation or check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated in ('shops_slug_key', 'shops_slug_format', 'shops_slug_not_reserved') then
      raise exception using errcode = 'P0041', message = 'SHOP_SLUG_INVALID';
    elsif violated = 'shops_owner_user_id_key' then
      raise exception using errcode = 'P0042', message = 'SHOP_OWNER_INVALID';
    end if;
    raise;
  end;

  update public.profiles set role = 'owner' where user_id = p_owner_user_id;

  return created;
end;
$$;

revoke all on function public.create_shop(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_shop(text, text, uuid, text) to service_role;

-- The ONE definition of "ready": the checklist (shop_setup_status) and the server check (complete_shop_setup) both use it.
create function public.shop_setup_missing(p_shop_id uuid, p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(array_remove(array[
    case when not exists (select 1 from public.consents c where c.user_id = p_user and c.kind = 'business') then 'agreement' end,
    case when not exists (
      select 1 from public.shops s
      where s.id = p_shop_id
        and btrim(s.name) <> ''
        and coalesce(nullif(btrim(s.phone), ''), nullif(btrim(s.whatsapp), '')) is not null
        and s.address_cep is not null
        and nullif(btrim(s.address_street), '') is not null
    ) then 'details' end,
    case when not exists (select 1 from public.shop_hours h where h.shop_id = p_shop_id) then 'hours' end,
    case when not exists (select 1 from public.services v where v.shop_id = p_shop_id and v.active and v.archived_at is null) then 'services' end,
    case when not exists (
      select 1 from public.professionals p
      where p.shop_id = p_shop_id and p.active and p.archived_at is null
        and exists (select 1 from public.working_periods w where w.shop_id = p.shop_id and w.professional_id = p.id)
        and exists (
          select 1 from public.professional_services ps
          join public.services v on v.id = ps.service_id and v.shop_id = ps.shop_id
          where ps.shop_id = p.shop_id and ps.professional_id = p.id
            and ps.active and ps.archived_at is null and v.active and v.archived_at is null
        )
    ) then 'team' end
  ], null), '{}'::text[]);
$$;

revoke all on function public.shop_setup_missing(uuid, uuid) from public, anon, authenticated;

create function public.shop_setup_status(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.is_shop_owner(p_shop_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'completed', exists (select 1 from public.shops where id = p_shop_id and setup_completed_at is not null),
    'missing', to_jsonb(public.shop_setup_missing(p_shop_id, auth.uid())),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'hasHours', exists (select 1 from public.working_periods w where w.shop_id = p.shop_id and w.professional_id = p.id),
        'hasServices', exists (
          select 1 from public.professional_services ps
          join public.services v on v.id = ps.service_id and v.shop_id = ps.shop_id
          where ps.shop_id = p.shop_id and ps.professional_id = p.id
            and ps.active and ps.archived_at is null and v.active and v.archived_at is null
        )
      ) order by p.created_at, p.id)
      from public.professionals p
      where p.shop_id = p_shop_id and p.active and p.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shop_setup_status(uuid) from public, anon;
grant execute on function public.shop_setup_status(uuid) to authenticated;

create function public.complete_shop_setup(p_shop_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  done timestamptz;
  missing text[];
begin
  if not public.is_shop_owner(p_shop_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select setup_completed_at into done from public.shops where id = p_shop_id for update;
  if done is not null then
    return done;
  end if;

  missing := public.shop_setup_missing(p_shop_id, auth.uid());
  if cardinality(missing) > 0 then
    raise exception using errcode = 'P0045', message = 'SHOP_SETUP_INCOMPLETE', detail = array_to_string(missing, ',');
  end if;

  update public.shops set setup_completed_at = clock_timestamp() where id = p_shop_id returning setup_completed_at into done;

  return done;
end;
$$;

revoke all on function public.complete_shop_setup(uuid) from public, anon;
grant execute on function public.complete_shop_setup(uuid) to authenticated;

-- book_appointment (0017) unchanged except for the closed-shop guard. Grants are kept by create or replace.
create or replace function public.book_appointment(
  professional_service_id uuid,
  customer_id uuid,
  starts_at timestamptz,
  source public.appointment_source,
  notes text default null
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if source = 'recurrence' then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.professional_services ps
    join public.shops s on s.id = ps.shop_id
    where ps.id = professional_service_id and s.setup_completed_at is null
  ) then
    raise exception using errcode = 'P0044', message = 'SHOP_NOT_READY';
  end if;

  return query
  select * from public.book_appointment_internal(
    professional_service_id, customer_id, starts_at, source, notes, null, null, null
  );
end;
$$;
