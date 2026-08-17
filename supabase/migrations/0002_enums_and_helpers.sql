create type public.profile_role as enum ('owner', 'customer');

create or replace function public.is_valid_timezone(timezone_name text)
returns boolean
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select exists(
    select 1
    from pg_catalog.pg_timezone_names
    where name = timezone_name
  );
$$;

revoke all on function public.is_valid_timezone(text) from public;
grant execute on function public.is_valid_timezone(text) to authenticated;
