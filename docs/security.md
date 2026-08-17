# Security boundaries

- Expo receives only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is allowed only in backend Edge Functions and is never read by app code.
- PostgreSQL derives actor identity from `auth.uid()`; client role flags do not grant owner access.
- Direct reads of schedules, appointments, recurrence data, notification data, and outbox data are restricted by grants/RLS. Narrow security-definer RPCs expose only the fields required by each flow.
- Push delivery is asynchronous. The service-role dispatcher claims rows, retries bounded failures, and deactivates invalid Expo tokens without changing appointment state.

The RLS matrix is executable in `supabase/tests/010_full_rls.sql` and covers anonymous, customer A, customer B, and owner access.
