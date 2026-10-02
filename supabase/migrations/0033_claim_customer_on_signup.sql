create or replace function public.ensure_my_customer()
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  shop uuid;
  account_email text;
  account_confirmed boolean;
  meta jsonb;
  consent_version text;
  result public.customers;
begin
  if actor is null
    or coalesce((select role::text from public.profiles where user_id = actor), '') <> 'customer'
  then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select id into shop from public.shops order by created_at, id limit 1;
  if shop is null then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  select email, email_confirmed_at is not null, coalesce(raw_user_meta_data, '{}'::jsonb)
  into account_email, account_confirmed, meta
  from auth.users where id = actor;

  -- A barber may have booked this person before they had an account: link that row (history included) by confirmed email.
  if account_confirmed then
    update public.customers c
    set user_id = actor
    where c.shop_id = shop
      and c.user_id is null
      and c.active
      and lower(c.email) = lower(account_email)
      and not exists (select 1 from public.customers x where x.shop_id = shop and x.user_id = actor);
  end if;

  -- ON CONFLICT keeps concurrent bootstraps (double mount, two tabs, retries) from failing on the unique index.
  insert into public.customers (shop_id, user_id, full_name, email, phone)
  values (
    shop,
    actor,
    coalesce((select full_name from public.profiles where user_id = actor), split_part(account_email, '@', 1)),
    -- Keep customers_shop_email_key satisfied when an unclaimed row (unconfirmed account) already owns the email.
    case when exists (
      select 1 from public.customers x where x.shop_id = shop and lower(x.email) = lower(account_email)
    ) then null else account_email end,
    nullif(btrim(meta ->> 'phone'), '')
  )
  on conflict (shop_id, user_id) where user_id is not null do nothing;

  select * into result from public.customers where shop_id = shop and user_id = actor;

  consent_version := nullif(btrim(meta ->> 'accepted_terms_version'), '');
  if consent_version is not null then
    insert into public.consents (user_id, kind, version)
    values (actor, 'terms', consent_version), (actor, 'privacy', consent_version)
    on conflict do nothing;
  end if;

  return result;
end;
$$;

revoke all on function public.ensure_my_customer() from public, anon;
grant execute on function public.ensure_my_customer() to authenticated;
