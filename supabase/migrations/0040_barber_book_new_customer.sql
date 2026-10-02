-- Create-or-find the customer and book in ONE transaction, so a failed or repeated booking leaves no orphan customer.
create function public.barber_book_new_customer(
  target_barber_service_id uuid,
  target_starts_at timestamptz,
  target_name text,
  target_email text default null,
  target_phone text default null,
  target_notes text default null
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  customer uuid;
begin
  select f.id into customer from public.barber_find_or_create_customer(target_name, target_email, target_phone) f;

  -- Same transaction: if the booking raises, the customer insert above is rolled back with it.
  return query
  select * from public.book_appointment_internal(
    target_barber_service_id, customer, target_starts_at, 'barber', target_notes, null, null, null
  );
end;
$$;

revoke all on function public.barber_book_new_customer(uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.barber_book_new_customer(uuid, timestamptz, text, text, text, text) to authenticated;
