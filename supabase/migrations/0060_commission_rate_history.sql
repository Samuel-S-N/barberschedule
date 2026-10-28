-- Commission rate history: each completed appointment earns the percent that was in force when it started.
create table public.barber_commission_rates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  barber_id uuid not null,
  percent numeric(5, 2) not null check (percent between 0 and 100),
  effective_from timestamptz not null,
  created_at timestamptz not null default now(),
  constraint barber_commission_rates_barber_fk foreign key (shop_id, barber_id) references public.barbers (shop_id, id) on delete cascade,
  constraint barber_commission_rates_unique unique (barber_id, effective_from)
);
alter table public.barber_commission_rates enable row level security;
revoke all on public.barber_commission_rates from public, anon, authenticated;

insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
select shop_id, id, commission_percent, 'epoch'::timestamptz
from public.barbers
where compensation_type = 'commission';

create function public.commission_percent_at(target_barber uuid, at timestamptz)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select r.percent from public.barber_commission_rates r
     where r.barber_id = target_barber and r.effective_from <= at
     order by r.effective_from desc limit 1),
    (select b.commission_percent from public.barbers b where b.id = target_barber)
  );
$$;
revoke all on function public.commission_percent_at(uuid, timestamptz) from public, anon, authenticated;

drop function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency);

create function public.set_barber_compensation(
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

create or replace function public.get_shop_report(period_start date, period_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  range_start timestamptz;
  range_end timestamptz;
  period_days integer;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;
  if period_end < period_start or period_end - period_start > 91 then
    raise exception using errcode = 'P0022', message = 'EARNINGS_INVALID_RANGE';
  end if;

  period_days := period_end - period_start + 1;
  range_start := period_start::timestamp at time zone sh.timezone;
  range_end := (period_end + 1)::timestamp at time zone sh.timezone;

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d."date")
      from (
        select
          (a.starts_at at time zone sh.timezone)::date as "date",
          (count(*) filter (where a.status = 'completed'))::int as completed,
          coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)::int as gross_cents,
          (count(*) filter (where a.status = 'cancelled'))::int as cancelled,
          (count(*) filter (where a.status = 'no_show'))::int as no_show,
          (count(*) filter (where a.status in ('scheduled', 'confirmed')))::int as upcoming
        from public.appointments a
        where a.shop_id = sh.id and a.starts_at >= range_start and a.starts_at < range_end
        group by 1
      ) d
    ), '[]'::jsonb),
    'barbers', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.gross_cents desc, b.name)
      from (
        select
          br.id as barber_id,
          br.name,
          br.compensation_type::text as compensation_type,
          (count(a.id) filter (where a.status = 'completed'))::int as completed,
          coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)::int as gross_cents,
          (case
            when br.compensation_type = 'commission'
              then round(coalesce(sum(a.service_price_cents_snapshot * public.commission_percent_at(br.id, a.starts_at)) filter (where a.status = 'completed'), 0) / 100)
            else coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)
          end)::int as barber_share_cents,
          (case
            when br.compensation_type = 'chair_rental'
              then round(br.chair_rental_amount_cents::numeric * period_days / (case when br.chair_rental_frequency = 'weekly' then 7 else 30 end))
            else 0
          end)::int as rent_estimate_cents,
          coalesce((
            select sum(p.amount_cents) from public.chair_rent_payments p
            where p.barber_id = br.id and p.paid_on between period_start and period_end
          ), 0)::int as rent_paid_cents
        from public.barbers br
        left join public.appointments a
          on a.barber_id = br.id and a.starts_at >= range_start and a.starts_at < range_end
        where br.shop_id = sh.id
        group by br.id
        having br.active or count(a.id) > 0
      ) b
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.gross_cents desc, s.name)
      from (
        select
          a.service_id,
          a.service_name_snapshot as name,
          count(*)::int as completed,
          sum(a.service_price_cents_snapshot)::int as gross_cents
        from public.appointments a
        where a.shop_id = sh.id and a.status = 'completed' and a.starts_at >= range_start and a.starts_at < range_end
        group by a.service_id, a.service_name_snapshot
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_shop_report(date, date) from public, anon;
grant execute on function public.get_shop_report(date, date) to authenticated;

create or replace function public.get_my_barber_report(period_start date, period_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  tz text;
  range_start timestamptz;
  range_end timestamptz;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if period_end < period_start or period_end - period_start > 91 then
    raise exception using errcode = 'P0022', message = 'EARNINGS_INVALID_RANGE';
  end if;

  select s.timezone into tz from public.shops s where s.id = me.shop_id;
  range_start := period_start::timestamp at time zone tz;
  range_end := (period_end + 1)::timestamp at time zone tz;
  -- The barber's own share per appointment: the commission percent in force then, or the whole amount for chair rental. Gross is never returned.

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d."date")
      from (
        select
          (a.starts_at at time zone tz)::date as "date",
          (count(*) filter (where a.status = 'completed'))::int as completed,
          round(coalesce(sum(a.service_price_cents_snapshot * (case when me.compensation_type = 'commission' then public.commission_percent_at(me.id, a.starts_at) else 100 end)) filter (where a.status = 'completed'), 0) / 100)::int as earnings_cents,
          (count(*) filter (where a.status = 'cancelled'))::int as cancelled,
          (count(*) filter (where a.status = 'no_show'))::int as no_show,
          (count(*) filter (where a.status in ('scheduled', 'confirmed')))::int as upcoming
        from public.appointments a
        where a.barber_id = me.id and a.starts_at >= range_start and a.starts_at < range_end
        group by 1
      ) d
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.completed desc, s.name)
      from (
        select a.service_id, a.service_name_snapshot as name, count(*)::int as completed
        from public.appointments a
        where a.barber_id = me.id and a.status = 'completed' and a.starts_at >= range_start and a.starts_at < range_end
        group by a.service_id, a.service_name_snapshot
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_barber_report(date, date) from public, anon;
grant execute on function public.get_my_barber_report(date, date) to authenticated;
