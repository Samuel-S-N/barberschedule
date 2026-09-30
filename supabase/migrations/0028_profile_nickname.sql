alter table public.profiles add column nickname text;
alter table public.profiles add constraint profiles_nickname_valid
  check (nickname is null or (btrim(nickname) <> '' and char_length(nickname) <= 30));

-- Signup metadata may carry a nickname; cut it instead of failing the whole signup when it is too long.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (user_id, full_name, nickname)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    left(nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''), 30)
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop function public.update_my_profile(text, text);

create function public.update_my_profile(p_full_name text, p_phone text, p_nickname text default null)
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  result public.customers;
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
  where user_id = actor
  returning * into result;

  if not found then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  return result;
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
