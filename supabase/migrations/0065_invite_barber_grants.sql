-- invite-barber calls PostgREST with the service-role key, but new tables only give service_role TRUNCATE, REFERENCES
-- and TRIGGER by default, so every invite answered 403. Grant exactly what it does: read the barber row (the link PATCH
-- returns the whole row), link the invited account, and promote its profile.
grant select on table public.barbers to service_role;
grant update (user_id, invited_at) on table public.barbers to service_role;
grant select (user_id), update (role) on table public.profiles to service_role;
