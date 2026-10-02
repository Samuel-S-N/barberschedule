create table public.barber_customer_notes (
  barber_id uuid not null references public.barbers (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now(),
  primary key (barber_id, customer_id),
  constraint barber_customer_notes_length check (char_length(note) between 1 and 500)
);

-- Private to the author: no policies and no grants, so only the security-definer RPCs below can touch it.
revoke all on table public.barber_customer_notes from anon, authenticated;
alter table public.barber_customer_notes enable row level security;

create function public.is_my_client(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.barbers b
    join public.customers c on c.shop_id = b.shop_id and c.id = target_customer_id
    where b.user_id = auth.uid() and b.active
      and c.active and c.anonymized_at is null
      and (
        c.created_by_barber_id = b.id
        or exists (select 1 from public.appointments a where a.barber_id = b.id and a.customer_id = c.id)
      )
  );
$$;

create function public.list_my_customers(
  search text default null,
  only_lapsed boolean default false,
  lapsed_days integer default 45,
  page_limit integer default 50,
  page_offset integer default 0
)
returns table (
  customer_id uuid,
  full_name text,
  phone text,
  email text,
  has_account boolean,
  visits integer,
  last_visit_at timestamptz,
  next_visit_at timestamptz,
  is_lapsed boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  needle text := lower(btrim(coalesce(search, '')));
  digits text := regexp_replace(coalesce(search, ''), '\D', '', 'g');
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if page_limit < 1 or page_limit > 100 or page_offset < 0 or lapsed_days < 1 then
    raise exception using errcode = 'P0014', message = 'AGENDA_INVALID_RANGE';
  end if;

  return query
  select
    s.id, s.full_name, s.phone, s.email, s.has_account, s.visits, s.last_visit_at, s.next_visit_at,
    (s.last_visit_at is not null and s.last_visit_at < now() - make_interval(days => lapsed_days) and s.next_visit_at is null)
  from (
    select
      c.id,
      c.full_name,
      c.phone,
      c.email,
      (c.user_id is not null) as has_account,
      (count(a.id) filter (where a.status = 'completed'))::int as visits,
      max(a.starts_at) filter (where a.status = 'completed') as last_visit_at,
      min(a.starts_at) filter (where a.status in ('scheduled', 'confirmed') and a.starts_at > now()) as next_visit_at
    from public.customers c
    left join public.appointments a on a.customer_id = c.id and a.barber_id = me.id
    where c.shop_id = me.shop_id
      and c.active
      and c.anonymized_at is null
      and (
        c.created_by_barber_id = me.id
        or exists (select 1 from public.appointments x where x.barber_id = me.id and x.customer_id = c.id)
      )
      and (
        needle = ''
        or position(needle in lower(c.full_name)) > 0
        or position(needle in lower(coalesce(c.email, ''))) > 0
        or (digits <> '' and position(digits in coalesce(c.phone, '')) > 0)
      )
    group by c.id
  ) s
  where not only_lapsed
    or (s.last_visit_at is not null and s.last_visit_at < now() - make_interval(days => lapsed_days) and s.next_visit_at is null)
  order by s.last_visit_at desc nulls last, s.full_name
  limit page_limit offset page_offset;
end;
$$;

create function public.get_my_customer(target_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  cust public.customers%rowtype;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if not public.is_my_client(target_customer_id) then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  select * into cust from public.customers where id = target_customer_id;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', cust.id, 'full_name', cust.full_name, 'phone', cust.phone, 'email', cust.email, 'has_account', cust.user_id is not null
    ),
    'stats', (
      select jsonb_build_object(
        'visits', count(*) filter (where a.status = 'completed'),
        'cancelled', count(*) filter (where a.status = 'cancelled'),
        'no_show', count(*) filter (where a.status = 'no_show'),
        'last_visit_at', max(a.starts_at) filter (where a.status = 'completed'),
        'next_visit_at', min(a.starts_at) filter (where a.status in ('scheduled', 'confirmed') and a.starts_at > now()),
        'favorite_service', (
          select f.service_name_snapshot
          from public.appointments f
          where f.barber_id = me.id and f.customer_id = cust.id and f.status = 'completed'
          group by f.service_name_snapshot
          order by count(*) desc, f.service_name_snapshot
          limit 1
        )
      )
      from public.appointments a
      where a.barber_id = me.id and a.customer_id = cust.id
    ),
    'note', (select n.note from public.barber_customer_notes n where n.barber_id = me.id and n.customer_id = cust.id),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.starts_at desc)
      from (
        select a.id, a.starts_at, a.service_name_snapshot as service_name, a.status
        from public.appointments a
        where a.barber_id = me.id and a.customer_id = cust.id
        order by a.starts_at desc
        limit 20
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

create function public.set_my_customer_note(target_customer_id uuid, new_note text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  clean text := nullif(btrim(coalesce(new_note, '')), '');
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if not public.is_my_client(target_customer_id) then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  if clean is not null and char_length(clean) > 500 then
    raise exception using errcode = 'P0028', message = 'CUSTOMER_NOTE_INVALID';
  end if;

  if clean is null then
    delete from public.barber_customer_notes where barber_id = me.id and customer_id = target_customer_id;
  else
    insert into public.barber_customer_notes (barber_id, customer_id, note)
    values (me.id, target_customer_id, clean)
    on conflict (barber_id, customer_id) do update set note = excluded.note, updated_at = now();
  end if;
end;
$$;

revoke all on function public.is_my_client(uuid) from public, anon;
revoke all on function public.list_my_customers(text, boolean, integer, integer, integer) from public, anon;
revoke all on function public.get_my_customer(uuid) from public, anon;
revoke all on function public.set_my_customer_note(uuid, text) from public, anon;
grant execute on function public.is_my_client(uuid) to authenticated;
grant execute on function public.list_my_customers(text, boolean, integer, integer, integer) to authenticated;
grant execute on function public.get_my_customer(uuid) to authenticated;
grant execute on function public.set_my_customer_note(uuid, text) to authenticated;
