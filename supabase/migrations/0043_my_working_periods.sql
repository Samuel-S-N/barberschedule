-- A barber can read (not edit) their own weekly working hours; the owner still manages them.
create function public.list_my_working_periods()
returns table (weekday smallint, start_time time, end_time time)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  my_barber_id uuid;
begin
  select b.id into my_barber_id from public.barbers b where b.user_id = auth.uid() and b.active;

  if my_barber_id is null then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;

  return query
  select wp.weekday, wp.start_time, wp.end_time
  from public.working_periods wp
  where wp.barber_id = my_barber_id
  order by wp.weekday, wp.start_time;
end;
$$;

revoke all on function public.list_my_working_periods() from public, anon;
grant execute on function public.list_my_working_periods() to authenticated;
