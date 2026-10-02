-- The barber only needs the id to book: do not hand back another person's phone or account id for a probed email.
drop function public.barber_find_or_create_customer(text, text, text);

create function public.barber_find_or_create_customer(
  target_name text,
  target_email text default null,
  target_phone text default null
)
returns table (id uuid, full_name text, has_account boolean)
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
  found_row public.customers;
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
    select * into found_row from public.customers where shop_id = me.shop_id and lower(email) = clean_email;
    if found then
      if not found_row.active then
        raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
      end if;
      return query select found_row.id, found_row.full_name, found_row.user_id is not null;
      return;
    end if;

    select u.id into account_id
    from auth.users u
    join public.profiles p on p.user_id = u.id and p.role = 'customer'
    where lower(u.email) = clean_email and u.email_confirmed_at is not null;

    if account_id is not null then
      select * into found_row from public.customers where shop_id = me.shop_id and user_id = account_id;
      if found then
        if not found_row.active then
          raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
        end if;
        return query select found_row.id, found_row.full_name, found_row.user_id is not null;
        return;
      end if;
    end if;
  end if;

  begin
    insert into public.customers (shop_id, user_id, full_name, email, phone, created_by_barber_id)
    values (me.shop_id, account_id, clean_name, clean_email, clean_phone, me.id)
    returning * into found_row;
  exception when unique_violation then
    -- A concurrent request created the same email first.
    select * into found_row from public.customers where shop_id = me.shop_id and lower(email) = clean_email;
    if not found then
      raise;
    end if;
  end;

  return query select found_row.id, found_row.full_name, found_row.user_id is not null;

  return;
end;
$$;

revoke all on function public.barber_find_or_create_customer(text, text, text) from public, anon;
grant execute on function public.barber_find_or_create_customer(text, text, text) to authenticated;
