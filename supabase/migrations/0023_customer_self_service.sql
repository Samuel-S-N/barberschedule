alter table public.customers add column anonymized_at timestamptz;

alter table public.customers drop constraint customers_contact_present;
alter table public.customers add constraint customers_contact_present
  check (email is not null or phone is not null or user_id is not null or anonymized_at is not null);

create unique index customers_shop_user_key
  on public.customers (shop_id, user_id) where user_id is not null;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (user_id) on delete set null,
  kind text not null check (kind in ('terms', 'privacy')),
  version text not null check (btrim(version) <> ''),
  accepted_at timestamptz not null default clock_timestamp(),
  unique (user_id, kind, version)
);

revoke all on table public.consents from anon, authenticated;
grant select on table public.consents to authenticated;
alter table public.consents enable row level security;

create policy "consents_select_self"
on public.consents
for select
to authenticated
using ((select auth.uid()) = user_id);

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

  select email, coalesce(raw_user_meta_data, '{}'::jsonb) into account_email, meta
  from auth.users where id = actor;

  select * into result from public.customers where shop_id = shop and user_id = actor;
  if not found then
    insert into public.customers (shop_id, user_id, full_name, email, phone)
    values (
      shop,
      actor,
      coalesce((select full_name from public.profiles where user_id = actor), split_part(account_email, '@', 1)),
      account_email,
      nullif(btrim(meta ->> 'phone'), '')
    )
    returning * into result;
  end if;

  consent_version := nullif(btrim(meta ->> 'accepted_terms_version'), '');
  if consent_version is not null then
    insert into public.consents (user_id, kind, version)
    values (actor, 'terms', consent_version), (actor, 'privacy', consent_version)
    on conflict do nothing;
  end if;

  return result;
end;
$$;

create or replace function public.update_my_profile(p_full_name text, p_phone text)
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
  then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name), updated_at = clock_timestamp()
  where user_id = actor;

  update public.customers
  set full_name = btrim(p_full_name), phone = nullif(btrim(p_phone), ''), updated_at = clock_timestamp()
  where user_id = actor
  returning * into result;

  return result;
end;
$$;

create or replace function public.export_my_data()
returns jsonb
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

  return jsonb_build_object(
    'exported_at', clock_timestamp(),
    'account_email', (select email from auth.users where id = actor),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = actor),
    'customers', coalesce((select jsonb_agg(to_jsonb(c)) from public.customers c where c.user_id = actor), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at)
      from public.appointments a
      join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'recurrence_series', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.recurrence_series s
      join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(k) order by k.accepted_at) from public.consents k where k.user_id = actor), '[]'::jsonb),
    'notification_tokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'active', t.active,
        'token_suffix', right(t.expo_push_token, 6), 'created_at', t.created_at))
      from public.notification_tokens t where t.user_id = actor
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.prepare_account_deletion()
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

  if exists (
    select 1
    from public.appointments a
    join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
    where c.user_id = actor
      and a.status in ('scheduled', 'confirmed')
      and a.starts_at > clock_timestamp()
  ) or exists (
    select 1
    from public.recurrence_series s
    join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
    where c.user_id = actor and s.active
  ) then
    raise exception using errcode = 'P0018', message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  update public.customers
  set full_name = 'Cliente removido',
      email = null,
      phone = null,
      user_id = null,
      anonymized_at = clock_timestamp(),
      active = false,
      archived_at = coalesce(archived_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where user_id = actor;
end;
$$;

revoke all on function public.ensure_my_customer() from public, anon;
revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.prepare_account_deletion() from public, anon;
grant execute on function public.ensure_my_customer() to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
