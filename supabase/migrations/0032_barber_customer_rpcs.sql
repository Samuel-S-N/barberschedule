create function public.barber_find_or_create_customer(
  target_name text,
  target_email text default null,
  target_phone text default null
)
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  clean_name text := nullif(btrim(target_name), '');
  clean_email text := lower(nullif(btrim(target_email), ''));
  clean_phone text := nullif(regexp_replace(coalesce(target_phone, ''), '\D', '', 'g'), '');
  account_id uuid;
  result public.customers;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;
  if clean_name is null then
    raise exception using errcode = 'P0024', message = 'CUSTOMER_NAME_REQUIRED';
  end if;
  if clean_email is not null and clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'P0025', message = 'CUSTOMER_EMAIL_INVALID';
  end if;

  if clean_email is not null then
    select * into result from public.customers where shop_id = me.shop_id and lower(email) = clean_email;
    if found then
      if not result.active then
        raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
      end if;
      return result;
    end if;

    select u.id into account_id
    from auth.users u
    join public.profiles p on p.user_id = u.id and p.role = 'customer'
    where lower(u.email) = clean_email and u.email_confirmed_at is not null;

    if account_id is not null then
      select * into result from public.customers where shop_id = me.shop_id and user_id = account_id;
      if found then
        if not result.active then
          raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
        end if;
        return result;
      end if;
    end if;
  end if;

  begin
    insert into public.customers (shop_id, user_id, full_name, email, phone, created_by_barber_id)
    values (me.shop_id, account_id, clean_name, clean_email, clean_phone, me.id)
    returning * into result;
  exception when unique_violation then
    -- A concurrent request created the same email first.
    select * into result from public.customers where shop_id = me.shop_id and lower(email) = clean_email;
    if not found then
      raise;
    end if;
  end;

  return result;
end;
$$;

create function public.barber_search_customers(term text default null)
returns table (id uuid, full_name text, email text, phone text, has_account boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  needle text := lower(btrim(coalesce(term, '')));
  digits text := regexp_replace(coalesce(term, ''), '\D', '', 'g');
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  return query
  select c.id, c.full_name, c.email, c.phone, c.user_id is not null
  from public.customers c
  left join lateral (
    select max(a.starts_at) as last_at
    from public.appointments a
    where a.customer_id = c.id and a.barber_id = me.id
  ) seen on true
  where c.shop_id = me.shop_id
    and c.active
    and (seen.last_at is not null or c.created_by_barber_id = me.id)
    and (
      needle = ''
      or position(needle in lower(c.full_name)) > 0
      or position(needle in lower(coalesce(c.email, ''))) > 0
      or (digits <> '' and position(digits in coalesce(c.phone, '')) > 0)
    )
  order by coalesce(seen.last_at, c.created_at) desc
  limit 8;
end;
$$;

revoke all on function public.barber_find_or_create_customer(text, text, text) from public, anon;
revoke all on function public.barber_search_customers(text) from public, anon;
grant execute on function public.barber_find_or_create_customer(text, text, text) to authenticated;
grant execute on function public.barber_search_customers(text) to authenticated;
