-- Name and nickname for staff (owners, barbers): update_my_profile needs a customers row, which they do not have.
create function public.update_my_staff_profile(p_full_name text, p_nickname text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' or char_length(btrim(coalesce(p_nickname, ''))) > 30 then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name), nickname = nullif(btrim(p_nickname), ''), updated_at = clock_timestamp()
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_my_staff_profile(text, text) from public, anon;
grant execute on function public.update_my_staff_profile(text, text) to authenticated;
