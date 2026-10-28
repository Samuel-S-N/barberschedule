-- Period split of the payout balance and a status/reminder that only look at the previous period.

create function public.payout_earned_between_cents(target_barber uuid, from_date date, before_date date, tz text)
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
    and a.starts_at >= from_date::timestamp at time zone tz
    and a.starts_at < before_date::timestamp at time zone tz;
$$;

-- What is still owed from before `boundary` (the last due date): earned before it minus everything paid, never below zero.
create function public.payout_prior_open_cents(target_barber uuid, from_date date, boundary date, tz text)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select case
    when boundary is null then 0
    else greatest(public.payout_earned_between_cents(target_barber, from_date, boundary, tz) - public.payout_paid_cents(target_barber, from_date), 0)
  end;
$$;

revoke all on function public.payout_earned_between_cents(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.payout_prior_open_cents(uuid, date, date, text) from public, anon, authenticated;

drop function public.get_payout_overview();

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
  status text,
  period_start date,
  prior_open_cents integer,
  current_open_cents integer
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
  ), split as (
    select d.*, public.payout_prior_open_cents(d.id, d.start_date, d.last_due, sh.timezone) as prior_open
    from due d
  )
  select
    s.id,
    s.name,
    s.payout_schedule,
    s.payout_day_1,
    s.payout_day_2,
    s.start_date,
    s.earned,
    s.paid,
    s.earned - s.paid,
    s.last_due,
    s.next_due,
    case
      when s.payout_schedule = 'none' then 'no_schedule'
      when s.prior_open = 0 then 'ok'
      when s.last_due = today then 'due_today'
      else 'pending'
    end,
    case when s.payout_schedule = 'none' then null else coalesce(s.last_due, s.start_date) end,
    s.prior_open,
    s.earned - s.paid - s.prior_open
  from split s
  where s.active or s.earned - s.paid <> 0
  order by s.name;
end;
$$;

revoke all on function public.get_payout_overview() from public, anon;
grant execute on function public.get_payout_overview() to authenticated;

-- Reminder candidates: due today and something from the period that just closed is still unpaid.
create or replace function public.payout_due_barbers(target_shop uuid, local_date date)
returns table (barber_id uuid, barber_name text)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select b.id, b.name
  from public.barbers b
  join public.shops s on s.id = b.shop_id
  where b.shop_id = target_shop
    and b.active
    and b.compensation_type = 'commission'
    and b.payout_schedule <> 'none'
    and b.payout_tracking_start <= local_date
    and exists (select 1 from public.payout_due_dates(b.payout_schedule, b.payout_day_1, b.payout_day_2, local_date, local_date))
    and public.payout_prior_open_cents(b.id, b.payout_tracking_start, local_date, s.timezone) > 0
  order by b.name;
$$;
revoke all on function public.payout_due_barbers(uuid, date) from public, anon, authenticated;
