-- A customer who uses two businesses must see each business's inbox on its own subdomain. The inbox row gets the shop of the
-- appointment it is about, else the recipient's own staff shop. Customer rows about recurrence (accepted/rejected/cancel) carry
-- neither, stay null and show on every shop the customer uses (a known limit, see multi-shop plan 1, open question 2).
alter table public.notifications add column shop_id uuid references public.shops (id) on delete cascade;

create function public.notifications_set_shop()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.shop_id is null and new.appointment_id is not null then
    select shop_id into new.shop_id from public.appointments where id = new.appointment_id;
  end if;
  if new.shop_id is null then
    select s.id into new.shop_id from public.shops s where s.owner_user_id = new.user_id;
  end if;
  if new.shop_id is null then
    select p.shop_id into new.shop_id from public.professionals p where p.user_id = new.user_id and p.active limit 1;
  end if;
  return new;
end;
$$;

create trigger notifications_set_shop before insert on public.notifications
for each row execute function public.notifications_set_shop();

-- Backfill with the same rules.
update public.notifications n
set shop_id = coalesce(
  (select a.shop_id from public.appointments a where a.id = n.appointment_id),
  (select s.id from public.shops s where s.owner_user_id = n.user_id),
  (select p.shop_id from public.professionals p where p.user_id = n.user_id and p.active limit 1)
)
where n.shop_id is null;

create index notifications_shop_idx on public.notifications (user_id, shop_id, created_at desc);

-- Same columns as 0058; the optional shop narrows the list to one business.
drop function public.list_my_recurrence_requests();
create function public.list_my_recurrence_requests(p_shop_id uuid default null)
returns table (
  id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
  professional_name text, service_name text, recurrence_cents integer,
  series_id uuid, series_active boolean, series_ended_at timestamptz, plan_name text, cancel_requested_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.status, r.interval_weeks, r.local_start_date, r.local_start_time, b.name, s.name,
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks),
         r.series_id, rs.active, rs.ended_at,
         (select pl.name from public.recurrence_plans pl where pl.service_id = s.id and pl.interval_weeks = r.interval_weeks order by pl.active desc, pl.created_at desc limit 1),
         rs.cancel_requested_at
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id and c.user_id = auth.uid()
  join public.professionals b on b.id = r.professional_id
  join public.professional_services bs on bs.id = r.professional_service_id
  join public.services s on s.id = bs.service_id
  left join public.recurrence_series rs on rs.id = r.series_id
  where p_shop_id is null or r.shop_id = p_shop_id
  order by r.created_at desc limit 20;
$$;
revoke all on function public.list_my_recurrence_requests(uuid) from public, anon;
grant execute on function public.list_my_recurrence_requests(uuid) to authenticated;

-- The bell count and "mark all read" / "clear all" follow the same scope: with a shop given they only touch that shop's rows and the
-- unscoped ones, so clearing the inbox on shop A never deletes shop B's notifications. Without a shop they behave as before.
drop function public.count_unread_notifications();
create function public.count_unread_notifications(p_shop_id uuid default null)
returns integer
language sql
stable
security invoker
as $$
  select count(*)::int from public.notifications
  where user_id = auth.uid() and read_at is null and (p_shop_id is null or shop_id is null or shop_id = p_shop_id);
$$;
grant execute on function public.count_unread_notifications(uuid) to authenticated;

drop function public.mark_notifications_read(uuid[]);
create function public.mark_notifications_read(target_ids uuid[] default null, p_shop_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0016', message = 'NOTIFICATION_FORBIDDEN';
  end if;

  update public.notifications
  set read_at = clock_timestamp()
  where user_id = auth.uid() and read_at is null and (target_ids is null or id = any (target_ids))
    and (p_shop_id is null or shop_id is null or shop_id = p_shop_id);
  get diagnostics changed = row_count;

  return changed;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[], uuid) from public;
grant execute on function public.mark_notifications_read(uuid[], uuid) to authenticated;

drop function public.delete_notifications(uuid[]);
create function public.delete_notifications(target_ids uuid[] default null, p_shop_id uuid default null)
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

  delete from public.notifications
  where user_id = auth.uid() and (target_ids is null or id = any (target_ids))
    and (p_shop_id is null or shop_id is null or shop_id = p_shop_id);
  get diagnostics removed = row_count;

  return removed;
end;
$$;
revoke all on function public.delete_notifications(uuid[], uuid) from public, anon;
grant execute on function public.delete_notifications(uuid[], uuid) to authenticated;
