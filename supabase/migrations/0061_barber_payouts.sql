-- Barber payouts: payout schedule per commission barber, payments, running balance.

create type public.payout_schedule as enum ('none', 'weekly', 'biweekly', 'monthly');

alter table public.barbers
  add column payout_schedule public.payout_schedule not null default 'none',
  add column payout_day_1 smallint,
  add column payout_day_2 smallint,
  add column payout_tracking_start date;

alter table public.barbers add constraint barbers_payout_schedule_matches check (
  (payout_schedule = 'none' and payout_day_1 is null and payout_day_2 is null)
  or (payout_schedule = 'weekly' and payout_day_1 between 0 and 6 and payout_day_2 is null)
  or (payout_schedule = 'biweekly' and payout_day_1 between 1 and 31 and payout_day_2 between 1 and 31 and payout_day_1 < payout_day_2)
  or (payout_schedule = 'monthly' and payout_day_1 between 1 and 31 and payout_day_2 is null)
);
alter table public.barbers add constraint barbers_payout_needs_commission check (
  payout_schedule = 'none' or (compensation_type = 'commission' and payout_tracking_start is not null)
);

-- Existing commission barbers start tracking today: past work is not retroactively owed.
update public.barbers b
set payout_tracking_start = (now() at time zone s.timezone)::date
from public.shops s
where s.id = b.shop_id and b.compensation_type = 'commission';

create table public.barber_payouts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  barber_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_on date not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint barber_payouts_barber_fk foreign key (shop_id, barber_id) references public.barbers (shop_id, id) on delete restrict
);
create index barber_payouts_barber_paid_on_idx on public.barber_payouts (barber_id, paid_on);
alter table public.barber_payouts enable row level security;
revoke all on public.barber_payouts from public, anon, authenticated;

create function public.payout_due_dates(sched public.payout_schedule, day_1 smallint, day_2 smallint, from_date date, to_date date)
returns setof date
language sql
immutable
as $$
  select g.d::date
  from generate_series(from_date::timestamp, to_date::timestamp, interval '1 day') g(d)
  cross join lateral (
    select extract(day from (date_trunc('month', g.d) + interval '1 month - 1 day'))::int as last_day
  ) m
  where case sched
    when 'weekly' then extract(dow from g.d)::int = day_1
    when 'monthly' then extract(day from g.d)::int = least(day_1::int, m.last_day)
    when 'biweekly' then extract(day from g.d)::int in (least(day_1::int, m.last_day), least(day_2::int, m.last_day))
    else false
  end
  order by 1;
$$;

create function public.payout_earned_cents(target_barber uuid, from_date date, tz text)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select round(coalesce(sum(a.service_price_cents_snapshot * public.commission_percent_at(a.barber_id, a.starts_at)), 0) / 100)::int
  from public.appointments a
  where a.barber_id = target_barber
    and a.status = 'completed'
    and a.starts_at >= from_date::timestamp at time zone tz;
$$;

create function public.payout_paid_cents(target_barber uuid, from_date date)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(sum(p.amount_cents), 0)::int
  from public.barber_payouts p
  where p.barber_id = target_barber and p.paid_on >= from_date;
$$;

revoke all on function public.payout_due_dates(public.payout_schedule, smallint, smallint, date, date) from public, anon, authenticated;
revoke all on function public.payout_earned_cents(uuid, date, text) from public, anon, authenticated;
revoke all on function public.payout_paid_cents(uuid, date) from public, anon, authenticated;

create function public.set_barber_payout_schedule(
  target_barber_id uuid,
  new_schedule public.payout_schedule,
  new_day_1 smallint default null,
  new_day_2 smallint default null,
  new_tracking_start date default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  target public.barbers%rowtype;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  select * into target from public.barbers where id = target_barber_id and shop_id = sh.id;
  if not found or target.compensation_type <> 'commission' then
    raise exception using errcode = 'P0039', message = 'PAYOUT_SCHEDULE_INVALID';
  end if;

  begin
    update public.barbers
    set payout_schedule = new_schedule,
        payout_day_1 = new_day_1,
        payout_day_2 = new_day_2,
        payout_tracking_start = coalesce(new_tracking_start, target.payout_tracking_start, (clock_timestamp() at time zone sh.timezone)::date),
        updated_at = clock_timestamp()
    where id = target_barber_id;
  exception when check_violation then
    raise exception using errcode = 'P0039', message = 'PAYOUT_SCHEDULE_INVALID';
  end;
end;
$$;

create function public.record_barber_payout(
  target_barber_id uuid,
  payout_amount_cents integer,
  payout_paid_on date,
  payout_note text default null
)
returns public.barber_payouts
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  result public.barber_payouts;
  clean_note text := nullif(btrim(payout_note), '');
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  if payout_amount_cents is null or payout_amount_cents <= 0 or payout_paid_on is null
    or (clean_note is not null and char_length(clean_note) > 200)
    or not exists (
      select 1 from public.barbers b
      where b.id = target_barber_id and b.shop_id = sh.id and b.compensation_type = 'commission'
    )
  then
    raise exception using errcode = 'P0040', message = 'PAYOUT_INVALID';
  end if;

  insert into public.barber_payouts (shop_id, barber_id, amount_cents, paid_on, note)
  values (sh.id, target_barber_id, payout_amount_cents, payout_paid_on, clean_note)
  returning * into result;

  return result;
end;
$$;

create function public.list_barber_payouts(period_start date, period_end date)
returns table (id uuid, barber_id uuid, barber_name text, amount_cents integer, paid_on date, note text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;
  if period_end < period_start or period_end - period_start > 91 then
    raise exception using errcode = 'P0022', message = 'EARNINGS_INVALID_RANGE';
  end if;

  return query
  select p.id, p.barber_id, b.name, p.amount_cents, p.paid_on, p.note
  from public.barber_payouts p
  join public.barbers b on b.id = p.barber_id and b.shop_id = p.shop_id
  where p.shop_id = sh.id and p.paid_on between period_start and period_end
  order by p.paid_on desc, p.created_at desc;
end;
$$;

create function public.delete_barber_payout(payout_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  delete from public.barber_payouts where id = payout_id and shop_id = sh.id;
  if not found then
    raise exception using errcode = 'P0040', message = 'PAYOUT_INVALID';
  end if;
end;
$$;

create function public.get_payout_overview()
returns table (
  barber_id uuid,
  barber_name text,
  payout_schedule public.payout_schedule,
  payout_day_1 smallint,
  payout_day_2 smallint,
  tracking_start date,
  earned_cents integer,
  paid_cents integer,
  balance_cents integer,
  last_due_date date,
  next_due_date date,
  status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict use_column
declare
  sh public.shops%rowtype;
  today date;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;
  today := (clock_timestamp() at time zone sh.timezone)::date;

  return query
  with base as (
    select
      br.id,
      br.name,
      br.active,
      br.payout_schedule,
      br.payout_day_1,
      br.payout_day_2,
      coalesce(br.payout_tracking_start, (br.created_at at time zone sh.timezone)::date) as start_date
    from public.barbers br
    where br.shop_id = sh.id and br.compensation_type = 'commission'
  ), money as (
    select
      b.*,
      public.payout_earned_cents(b.id, b.start_date, sh.timezone) as earned,
      public.payout_paid_cents(b.id, b.start_date) as paid
    from base b
  ), due as (
    select
      m.*,
      (select max(x) from public.payout_due_dates(m.payout_schedule, m.payout_day_1, m.payout_day_2, m.start_date, today) x) as last_due,
      (select min(x) from public.payout_due_dates(m.payout_schedule, m.payout_day_1, m.payout_day_2, today, today + 62) x) as next_due
    from money m
  )
  select
    d.id,
    d.name,
    d.payout_schedule,
    d.payout_day_1,
    d.payout_day_2,
    d.start_date,
    d.earned,
    d.paid,
    d.earned - d.paid,
    d.last_due,
    d.next_due,
    case
      when d.payout_schedule = 'none' then 'no_schedule'
      when d.earned - d.paid <= 0 or d.last_due is null then 'ok'
      when d.last_due = today
        and not exists (select 1 from public.barber_payouts p where p.barber_id = d.id and p.paid_on >= today) then 'due_today'
      when d.last_due < today
        and not exists (select 1 from public.barber_payouts p where p.barber_id = d.id and p.paid_on >= d.last_due) then 'pending'
      else 'ok'
    end
  from due d
  where d.active or d.earned - d.paid <> 0
  order by d.name;
end;
$$;

create function public.get_my_payout_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  tz text;
  today date;
  start_date date;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if me.compensation_type <> 'commission' then
    return null;
  end if;

  select s.timezone into tz from public.shops s where s.id = me.shop_id;
  today := (clock_timestamp() at time zone tz)::date;
  start_date := coalesce(me.payout_tracking_start, (me.created_at at time zone tz)::date);

  -- Never returns gross revenue: only what is left to receive, the schedule and the barber's own payouts.
  return jsonb_build_object(
    'schedule', me.payout_schedule,
    'day_1', me.payout_day_1,
    'day_2', me.payout_day_2,
    'tracking_start', start_date,
    'balance_cents', public.payout_earned_cents(me.id, start_date, tz) - public.payout_paid_cents(me.id, start_date),
    'next_due_date', (select min(x) from public.payout_due_dates(me.payout_schedule, me.payout_day_1, me.payout_day_2, today, today + 62) x),
    'past_unmarked_count', (
      select count(*)::int from public.appointments a
      where a.barber_id = me.id and a.status in ('scheduled', 'confirmed')
        and a.starts_at >= start_date::timestamp at time zone tz and a.starts_at < clock_timestamp()
    ),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'paid_on', p.paid_on, 'amount_cents', p.amount_cents, 'note', p.note) order by p.paid_on desc, p.created_at desc)
      from (
        select * from public.barber_payouts p0 where p0.barber_id = me.id order by p0.paid_on desc, p0.created_at desc limit 50
      ) p
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_barber_compensation(
  target_barber_id uuid,
  new_type public.barber_compensation_type,
  new_commission_percent numeric default null,
  new_rental_amount_cents integer default null,
  new_rental_frequency public.chair_rental_frequency default null,
  apply_retroactively boolean default false
)
returns table (
  id uuid,
  compensation_type public.barber_compensation_type,
  commission_percent numeric,
  chair_rental_amount_cents integer,
  chair_rental_frequency public.chair_rental_frequency
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_shop uuid;
  old_type public.barber_compensation_type;
  old_percent numeric;
  local_today date;
begin
  select b.shop_id, b.compensation_type, b.commission_percent
  into target_shop, old_type, old_percent
  from public.barbers b
  where b.id = target_barber_id;

  if target_shop is null or not public.is_shop_owner(target_shop) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if new_type = 'commission' then
    if new_commission_percent is null
      or new_commission_percent not between 0 and 100
      or new_rental_amount_cents is not null
      or new_rental_frequency is not null then
      raise exception using errcode = 'P0021', message = 'COMPENSATION_INVALID';
    end if;
  else
    if new_rental_amount_cents is null
      or new_rental_amount_cents <= 0
      or new_rental_frequency is null
      or new_commission_percent is not null then
      raise exception using errcode = 'P0021', message = 'COMPENSATION_INVALID';
    end if;
  end if;

  select (clock_timestamp() at time zone s.timezone)::date into local_today from public.shops s where s.id = target_shop;

  if new_type = 'commission' then
    if old_type is distinct from 'commission' then
      delete from public.barber_commission_rates r where r.barber_id = target_barber_id;
      insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
      values (target_shop, target_barber_id, new_commission_percent, 'epoch');
    elsif new_commission_percent <> old_percent then
      if apply_retroactively then
        delete from public.barber_commission_rates r where r.barber_id = target_barber_id;
        insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
        values (target_shop, target_barber_id, new_commission_percent, 'epoch');
      else
        insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
        select target_shop, target_barber_id, old_percent, 'epoch'
        where not exists (select 1 from public.barber_commission_rates r where r.barber_id = target_barber_id);

        insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
        values (target_shop, target_barber_id, new_commission_percent, clock_timestamp())
        on conflict (barber_id, effective_from) do update set percent = excluded.percent;
      end if;
    end if;
  else
    delete from public.barber_commission_rates r where r.barber_id = target_barber_id;
  end if;

  return query
  update public.barbers
  set
    compensation_type = new_type,
    commission_percent = case when new_type = 'commission' then new_commission_percent else 0 end,
    chair_rental_amount_cents = case when new_type = 'chair_rental' then new_rental_amount_cents end,
    chair_rental_frequency = case when new_type = 'chair_rental' then new_rental_frequency end,
    payout_schedule = case when new_type = 'chair_rental' then 'none'::public.payout_schedule else barbers.payout_schedule end,
    payout_day_1 = case when new_type = 'chair_rental' then null else barbers.payout_day_1 end,
    payout_day_2 = case when new_type = 'chair_rental' then null else barbers.payout_day_2 end,
    payout_tracking_start = case
      when new_type = 'chair_rental' then null
      when old_type is distinct from 'commission' then local_today
      else barbers.payout_tracking_start
    end,
    updated_at = clock_timestamp()
  where barbers.id = target_barber_id
  returning
    barbers.id,
    barbers.compensation_type,
    barbers.commission_percent,
    barbers.chair_rental_amount_cents,
    barbers.chair_rental_frequency;
end;
$$;

revoke all on function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency, boolean) from public, anon;
grant execute on function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency, boolean) to authenticated;

drop function public.list_owner_barbers(uuid);

create function public.list_owner_barbers(target_shop_id uuid)
returns table (
  id uuid,
  shop_id uuid,
  user_id uuid,
  name text,
  active boolean,
  archived_at timestamptz,
  bio text,
  avatar_url text,
  compensation_type public.barber_compensation_type,
  commission_percent numeric,
  chair_rental_amount_cents integer,
  chair_rental_frequency public.chair_rental_frequency,
  invited_at timestamptz,
  payout_schedule public.payout_schedule,
  payout_day_1 smallint,
  payout_day_2 smallint,
  payout_tracking_start date
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_shop_owner(target_shop_id) then
    return;
  end if;

  return query
  select
    barbers.id,
    barbers.shop_id,
    barbers.user_id,
    barbers.name,
    barbers.active,
    barbers.archived_at,
    barbers.bio,
    barbers.avatar_url,
    barbers.compensation_type,
    barbers.commission_percent,
    barbers.chair_rental_amount_cents,
    barbers.chair_rental_frequency,
    barbers.invited_at,
    barbers.payout_schedule,
    barbers.payout_day_1,
    barbers.payout_day_2,
    barbers.payout_tracking_start
  from public.barbers
  where barbers.shop_id = target_shop_id
  order by barbers.name asc;
end;
$$;

revoke all on function public.list_owner_barbers(uuid) from public;
grant execute on function public.list_owner_barbers(uuid) to authenticated;

revoke all on function public.set_barber_payout_schedule(uuid, public.payout_schedule, smallint, smallint, date) from public, anon;
revoke all on function public.record_barber_payout(uuid, integer, date, text) from public, anon;
revoke all on function public.list_barber_payouts(date, date) from public, anon;
revoke all on function public.delete_barber_payout(uuid) from public, anon;
revoke all on function public.get_payout_overview() from public, anon;
revoke all on function public.get_my_payout_summary() from public, anon;
grant execute on function public.set_barber_payout_schedule(uuid, public.payout_schedule, smallint, smallint, date) to authenticated;
grant execute on function public.record_barber_payout(uuid, integer, date, text) to authenticated;
grant execute on function public.list_barber_payouts(date, date) to authenticated;
grant execute on function public.delete_barber_payout(uuid) to authenticated;
grant execute on function public.get_payout_overview() to authenticated;
grant execute on function public.get_my_payout_summary() to authenticated;
