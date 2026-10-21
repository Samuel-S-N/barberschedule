-- Customers (and visitors of the public booking page) may see a barber's profile photo.
grant select (avatar_url) on table public.barbers to anon, authenticated;
