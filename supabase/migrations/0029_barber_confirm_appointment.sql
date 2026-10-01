-- Barbers may also confirm their own scheduled appointments (scheduled -> confirmed).
create or replace function public.set_my_appointment_status(
  appointment_id uuid,
  new_status public.appointment_status
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select * into target
  from public.appointments
  where id = appointment_id
  for update;

  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  if not public.is_own_barber(target.barber_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  if not (
    (new_status in ('completed', 'no_show') and target.status in ('scheduled', 'confirmed'))
    or (new_status = 'confirmed' and target.status = 'scheduled')
  ) then
    raise exception using errcode = 'P0013', message = 'APPOINTMENT_STATUS_INVALID';
  end if;

  return query
  update public.appointments
  set status = new_status, updated_at = clock_timestamp()
  where id = target.id
  returning *;
end;
$$;
