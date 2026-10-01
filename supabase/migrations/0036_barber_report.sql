create function public.get_my_barber_report(period_start date, period_end date)
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
  share numeric;
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
  -- The barber's own share: commission percent, or the whole amount for chair rental. Gross is never returned.
  share := case when me.compensation_type = 'commission' then me.commission_percent else 100 end;

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(to_jsonb(d) order by d."date")
      from (
        select
          (a.starts_at at time zone tz)::date as "date",
          (count(*) filter (where a.status = 'completed'))::int as completed,
          round(coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0) * share / 100)::int as earnings_cents,
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
