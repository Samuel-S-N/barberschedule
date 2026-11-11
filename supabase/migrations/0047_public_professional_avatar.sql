-- Customers (and visitors of the public booking page) may see a professional's profile photo.
grant select (avatar_url) on table public.professionals to anon, authenticated;
