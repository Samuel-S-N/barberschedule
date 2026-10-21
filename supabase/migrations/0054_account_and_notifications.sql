-- Barbers can delete their account and export their data; notifications can be deleted.
create or replace function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  my_barber uuid;
begin
  select role::text into actor_role from public.profiles where user_id = actor;
  if actor is null or coalesce(actor_role, '') not in ('customer', 'barber') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if actor_role = 'customer' then
    if exists (
      select 1 from public.appointments a
      join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
      where c.user_id = actor and a.status in ('scheduled', 'confirmed') and a.starts_at > clock_timestamp()
    ) or exists (
      select 1 from public.recurrence_series s
      join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
      where c.user_id = actor and s.active
    ) then
      raise exception using errcode = 'P0018', message = 'ACCOUNT_DELETION_BLOCKED';
    end if;

    update public.customers
    set full_name = 'Cliente removido', email = null, phone = null, user_id = null,
        anonymized_at = clock_timestamp(), active = false,
        archived_at = coalesce(archived_at, clock_timestamp()), updated_at = clock_timestamp()
    where user_id = actor;
    return;
  end if;

  select id into my_barber from public.barbers where user_id = actor;
  if my_barber is not null and (
    exists (
      select 1 from public.appointments a
      where a.barber_id = my_barber and a.status in ('scheduled', 'confirmed') and a.starts_at > clock_timestamp()
    ) or exists (
      select 1 from public.recurrence_series s
      join public.barber_services bs on bs.id = s.barber_service_id
      where bs.barber_id = my_barber and s.active
    )
  ) then
    raise exception using errcode = 'P0018', message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  update public.barbers
  set name = 'Barbeiro removido', user_id = null, active = false, bio = null, avatar_url = null,
      archived_at = coalesce(archived_at, clock_timestamp()), updated_at = clock_timestamp()
  where id = my_barber;
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
    'barbers', coalesce((select jsonb_agg(to_jsonb(b)) from public.barbers b where b.user_id = actor), '[]'::jsonb),
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

create function public.delete_notifications(target_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_FORBIDDEN';
  end if;

  delete from public.notifications where user_id = auth.uid() and (target_ids is null or id = any (target_ids));
  get diagnostics removed = row_count;

  return removed;
end;
$$;

revoke all on function public.delete_notifications(uuid[]) from public, anon;
grant execute on function public.delete_notifications(uuid[]) to authenticated;
