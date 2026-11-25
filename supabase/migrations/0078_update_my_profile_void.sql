-- update_my_profile used to return ONE of the person's customer rows (they have one per shop), an arbitrary one nobody reads. It now
-- returns nothing. It still updates the profile and EVERY customer row (it is the same person in every shop), and still fails with
-- P0007 when the person has no customer row. A return type cannot change in place: drop and create again, same grants.
drop function public.update_my_profile(text, text, text);

create function public.update_my_profile(p_full_name text, p_phone text, p_nickname text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if btrim(coalesce(p_full_name, '')) = ''
    or (nullif(btrim(p_phone), '') is not null and btrim(p_phone) !~ '^[0-9+()\s-]{8,20}$')
    or char_length(btrim(coalesce(p_nickname, ''))) > 30
  then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name), nickname = nullif(btrim(p_nickname), ''), updated_at = clock_timestamp()
  where user_id = actor;

  update public.customers
  set full_name = btrim(p_full_name), phone = nullif(btrim(p_phone), ''), updated_at = clock_timestamp()
  where user_id = actor;

  if not found then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
