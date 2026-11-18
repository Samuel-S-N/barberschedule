-- Creates a business and makes an existing account its owner, in one transaction. Called by scripts/create-shop.mjs (service role)
-- right after it invites the owner; the future self-serve wizard reuses it. Slug rules live in the 0067 constraints.
create function public.create_shop(
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
    insert into public.shops (name, slug, owner_user_id, timezone)
    values (btrim(p_name), p_slug, p_owner_user_id, coalesce(p_timezone, 'America/Sao_Paulo'))
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

-- invite-professional builds the professional's own shop link, so it reads the shop's slug with the service-role key.
grant select (id, slug) on table public.shops to service_role;
