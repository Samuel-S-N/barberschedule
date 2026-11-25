-- Legal documents have their own kinds and versions: the consents table grows a `business` kind, clients record consent through a
-- function (the table is read-only for them) and signup keeps one version per document.
alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check check (kind in ('terms', 'privacy', 'business'));

create function public.accept_legal_documents(p_documents jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  doc_kind text;
  doc_version text;
  is_owner boolean;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if jsonb_typeof(p_documents) is distinct from 'array' or jsonb_array_length(p_documents) = 0 then
    raise exception using errcode = 'P0046', message = 'LEGAL_CONSENT_INVALID';
  end if;

  select role = 'owner' into is_owner from public.profiles where user_id = actor;

  for item in select * from jsonb_array_elements(p_documents) loop
    doc_kind := item ->> 'kind';
    doc_version := nullif(btrim(item ->> 'version'), '');

    if doc_kind is null or doc_kind not in ('terms', 'privacy', 'business')
      or doc_version is null
      or (doc_kind = 'business' and not coalesce(is_owner, false))
    then
      raise exception using errcode = 'P0046', message = 'LEGAL_CONSENT_INVALID';
    end if;

    insert into public.consents (user_id, kind, version) values (actor, doc_kind, doc_version) on conflict do nothing;
  end loop;
end;
$$;

revoke all on function public.accept_legal_documents(jsonb) from public, anon;
grant execute on function public.accept_legal_documents(jsonb) to authenticated;

-- ensure_my_customer(uuid): the 0068 body (still the latest definition; verify with
-- `rtk grep -rn "function public.ensure_my_customer" supabase/migrations` and diff against it if another migration changed it)
-- with ONE change: the consent block at the end records terms and privacy with their own versions.
create or replace function public.ensure_my_customer(p_shop_id uuid)
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
  privacy_version text;
  result public.customers;
  mine public.customers;
  stale public.customers;
begin
  if actor is null
    or coalesce((select role::text from public.profiles where user_id = actor), '') <> 'customer'
  then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select id into shop from public.shops where id = p_shop_id;
  if shop is null then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  select email, email_confirmed_at is not null, coalesce(raw_user_meta_data, '{}'::jsonb)
  into account_email, account_confirmed, meta
  from auth.users where id = actor;

  if account_confirmed and (select email_claim_enabled from public.app_settings) then
    update public.customers c
    set user_id = actor
    where c.shop_id = shop
      and c.user_id is null
      and c.active
      and lower(c.email) = lower(account_email)
      and not exists (select 1 from public.customers x where x.shop_id = shop and x.user_id = actor);

    select * into mine from public.customers where shop_id = shop and user_id = actor;
    if found then
      select * into stale from public.customers
      where shop_id = shop and user_id is null and active and lower(email) = lower(account_email) and id <> mine.id;
      if found then
        update public.appointments set customer_id = mine.id where customer_id = stale.id;
        update public.recurrence_series set customer_id = mine.id where customer_id = stale.id;
        insert into public.professional_customer_notes (professional_id, customer_id, note, updated_at)
        select professional_id, mine.id, note, updated_at from public.professional_customer_notes where customer_id = stale.id
        on conflict do nothing;
        delete from public.customers where id = stale.id;
        update public.customers set email = coalesce(email, stale.email), phone = coalesce(phone, stale.phone) where id = mine.id;
      end if;
    end if;
  end if;

  insert into public.customers (shop_id, user_id, full_name, email, phone)
  values (
    shop,
    actor,
    coalesce((select full_name from public.profiles where user_id = actor), split_part(account_email, '@', 1)),
    case when exists (
      select 1 from public.customers x where x.shop_id = shop and lower(x.email) = lower(account_email)
    ) then null else account_email end,
    nullif(btrim(meta ->> 'phone'), '')
  )
  on conflict (shop_id, user_id) where user_id is not null do nothing;

  select * into result from public.customers where shop_id = shop and user_id = actor;

  consent_version := nullif(btrim(meta ->> 'accepted_terms_version'), '');
  privacy_version := coalesce(nullif(btrim(meta ->> 'accepted_privacy_version'), ''), consent_version);
  if consent_version is not null then
    insert into public.consents (user_id, kind, version) values (actor, 'terms', consent_version) on conflict do nothing;
  end if;
  if privacy_version is not null then
    insert into public.consents (user_id, kind, version) values (actor, 'privacy', privacy_version) on conflict do nothing;
  end if;

  return result;
end;
$$;

revoke all on function public.ensure_my_customer(uuid) from public, anon;
grant execute on function public.ensure_my_customer(uuid) to authenticated;
