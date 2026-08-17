# Database boundaries

PostgreSQL is authoritative for shop-local dates, schedule intervals, availability, booking, lifecycle transitions, recurrence materialization, notification events, and authorization.

Public clients may read active shop/catalog rows and call `get_available_slots`. Customer and owner mutations use authenticated RPCs or owner-scoped table policies. Appointments, schedules, recurrence tables, notification outbox rows, and tokens are not public data.

The development seed is `supabase/seed.sql`. Reset the local database before relying on it:

```bash
HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase db reset --local
```

Run the database suite with `npm run test:db`; it includes the full RLS audit in `supabase/tests/010_full_rls.sql`.
