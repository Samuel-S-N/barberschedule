-- Chair rent payments: the owner records what was actually paid; the report keeps the estimate and adds the paid total.
create table public.chair_rent_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  barber_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_on date not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint chair_rent_payments_barber_fk foreign key (shop_id, barber_id) references public.barbers (shop_id, id) on delete restrict
);
create index chair_rent_payments_shop_paid_on_idx on public.chair_rent_payments (shop_id, paid_on);
alter table public.chair_rent_payments enable row level security;
revoke all on public.chair_rent_payments from public, anon, authenticated;

create function public.record_rent_payment(
  target_barber_id uuid,
  payment_amount_cents integer,
  payment_paid_on date,
  payment_note text default null
)
returns public.chair_rent_payments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  result public.chair_rent_payments;
  clean_note text := nullif(btrim(payment_note), '');
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  if payment_amount_cents is null or payment_amount_cents <= 0 or payment_paid_on is null
    or (clean_note is not null and char_length(clean_note) > 200)
    or not exists (
      select 1 from public.barbers b
      where b.id = target_barber_id and b.shop_id = sh.id and b.compensation_type = 'chair_rental'
    )
  then
    raise exception using errcode = 'P0030', message = 'RENT_PAYMENT_INVALID';
  end if;

  insert into public.chair_rent_payments (shop_id, barber_id, amount_cents, paid_on, note)
  values (sh.id, target_barber_id, payment_amount_cents, payment_paid_on, clean_note)
  returning * into result;

  return result;
end;
$$;

create function public.list_rent_payments(period_start date, period_end date)
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
  from public.chair_rent_payments p
  join public.barbers b on b.id = p.barber_id and b.shop_id = p.shop_id
  where p.shop_id = sh.id and p.paid_on between period_start and period_end
  order by p.paid_on desc, p.created_at desc;
end;
$$;

create function public.delete_rent_payment(payment_id uuid)
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

  delete from public.chair_rent_payments where id = payment_id and shop_id = sh.id;
  if not found then
    raise exception using errcode = 'P0030', message = 'RENT_PAYMENT_INVALID';
  end if;
end;
$$;

revoke all on function public.record_rent_payment(uuid, integer, date, text) from public, anon;
revoke all on function public.list_rent_payments(date, date) from public, anon;
revoke all on function public.delete_rent_payment(uuid) from public, anon;
grant execute on function public.record_rent_payment(uuid, integer, date, text) to authenticated;
grant execute on function public.list_rent_payments(date, date) to authenticated;
grant execute on function public.delete_rent_payment(uuid) to authenticated;

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
              then round(coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0) * br.commission_percent / 100)
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
