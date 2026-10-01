create function public.get_shop_report(period_start date, period_end date)
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
          end)::int as rent_estimate_cents
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
