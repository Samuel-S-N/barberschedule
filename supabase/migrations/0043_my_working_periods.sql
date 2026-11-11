-- A professional can read (not edit) their own weekly working hours; the owner still manages them.
create function public.list_my_working_periods()
returns table (weekday smallint, start_time time, end_time time)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  my_professional_id uuid;
begin
  select b.id into my_professional_id from public.professionals b where b.user_id = auth.uid() and b.active;

  if my_professional_id is null then
    raise exception using errcode = 'P0019', message = 'PROFESSIONAL_NOT_LINKED';
  end if;

  return query
  select wp.weekday, wp.start_time, wp.end_time
  from public.working_periods wp
  where wp.professional_id = my_professional_id
  order by wp.weekday, wp.start_time;
end;
$$;

revoke all on function public.list_my_working_periods() from public, anon;
grant execute on function public.list_my_working_periods() to authenticated;
