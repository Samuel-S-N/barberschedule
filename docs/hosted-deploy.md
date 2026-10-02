# Hosted Supabase deploy checklist

Run these **in order**, by a human with access to the hosted project. Nothing here has been applied to the hosted
project yet. Never run `supabase db reset` against it.

Migrations pending on hosted: `0031` … `0038` (merged to `main`), plus `0039` (email-claim flag), `0040`
(`barber_book_new_customer`), `0041` (barber cancel/move), `0042` (agenda customer phone) and `0043`
(`list_my_working_periods`) once their PRs are merged. Apply whatever is on `main` at the time; the order is the file order.

## 1. Before touching the database

1. **Back up** (Dashboard > Database > Backups, or `supabase db dump --linked -f backup.sql`).
2. **Duplicate emails.** `0031` creates a unique index on `lower(email)` per shop and fails if duplicates exist:

   ```sql
   select shop_id, lower(email) as email, count(*)
   from public.customers
   where email is not null
   group by 1, 2
   having count(*) > 1;
   ```

   Resolve every row returned (merge or null one of the emails) before continuing.
3. Link the project: `npx supabase link --project-ref <ref>`.

## 2. Apply the migrations

```bash
npx supabase db push --dry-run   # review the list: only the pending migrations may appear
npx supabase db push
```

If the CLI reports out-of-order history, stop and check `supabase migration list`; do not use `--include-all`
without understanding which migration is missing.

## 3. Auth settings (Dashboard > Authentication)

1. **Email confirmations ON** (Providers > Email > "Confirm email"). The customer email claim relies on it.
2. **URL Configuration:** Site URL = the production web origin; Redirect URLs = the production origin with `/**`
   and `barberschedule://**`. Local-only `exp://` URLs do not belong here.
3. Verify with the repo's check (it fails while confirmations are off):

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<publishable key> node scripts/assert-hosted-auth.mjs
   ```

## 4. Enable the email claim (only after step 3 passes)

`app_settings.email_claim_enabled` ships **off**. As the service role (SQL editor):

```sql
update public.app_settings set email_claim_enabled = true;
```

With it on, a customer who signs up with a verified email that a barber already used gets that history (a barber-created
row is merged into the account's own row if one exists). Turn it off again if confirmations are ever disabled.

## 5. Edge Functions and scheduler

- Functions: `npx supabase functions deploy dispatch-notifications invite-barber delete-account`.
- Secrets (never in git): `SUPABASE_SERVICE_ROLE_KEY`, optional `EXPO_ACCESS_TOKEN`
  (`npx supabase secrets set ...`).
- `pg_cron` registers the jobs in migration `0022` when the extension is available; otherwise schedule
  `enqueue_notification_reminders()` every 15 minutes and `materialize_recurrence_job()` hourly.

## 6. Smoke test on hosted

1. Barber login: agenda loads; book a walk-in customer from a free slot; the booking appears.
2. Barber: cancel and move an appointment (the customer with an account gets the notification).
3. Barber: clients tab (search, load more), reports, working hours, privacy screen.
4. Owner: login, Revenue screen, agenda.
5. Customer: sign up with an email a barber used before; after confirming the email the history is there.
6. Password recovery link opens the app (web origin and, on a dev build, `barberschedule://`).

## 7. Rollback

Migrations are forward-only. If something breaks, restore the backup from step 1 rather than hand-editing.
