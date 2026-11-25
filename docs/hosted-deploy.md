# Hosted Supabase deploy checklist

Run these **in order**, by a human with access to the hosted project. Nothing here has been applied to the hosted
project yet. Never run `supabase db reset` against it.

Migrations: the hosted project does not exist yet, so the first deploy applies **every** migration in `supabase/migrations`
(file order, currently `0001` … `0066`; `0061`-`0063` are intentionally absent until the payouts work lands). After the first
deploy migrations are append-only (decision `018`): never rewrite an applied file, add a new one.

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
   and `zenc://**`. Local-only `exp://` URLs do not belong here.
3. **Minimum password length 8** (Providers > Email), the same rule as the app and `supabase/config.toml`.
4. Verify with the repo's check (it fails while confirmations are off):

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<publishable key> node scripts/assert-hosted-auth.mjs
   ```

## 4. Enable the email claim (only after step 3 passes)

`app_settings.email_claim_enabled` ships **off**. As the service role (SQL editor):

```sql
update public.app_settings set email_claim_enabled = true;
```

With it on, a customer who signs up with a verified email that a professional already used gets that history (a professional-created
row is merged into the account's own row if one exists). Turn it off again if confirmations are ever disabled.

## 5. Edge Functions and scheduler

- Functions: `npx supabase functions deploy dispatch-notifications invite-professional delete-account`.
- Secrets (never in git): `SUPABASE_SERVICE_ROLE_KEY`, optional `EXPO_ACCESS_TOKEN`
  (`npx supabase secrets set ...`).
- Web push (needs HTTPS): generate a key pair once with `npx web-push generate-vapid-keys` and set
  `npx supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:<business e-mail>`;
  put the same **public** key in the web build environment as `EXPO_PUBLIC_VAPID_PUBLIC_KEY`. The private key is never committed
  (local development uses the git-ignored `supabase/functions/.env`). Without the three secrets, web notifications fail with
  `Missing VAPID_...` in `notification_outbox.last_error` while Expo pushes keep working.
- `pg_cron` registers the jobs in migration `0022` when the extension is available; otherwise schedule
  `enqueue_notification_reminders()` every 15 minutes and `materialize_recurrence_job()` hourly.
- Whatever schedules `dispatch-notifications` must send `Authorization: Bearer <service role key>`; any other caller
  gets 401 (the anon key ships inside the app).

## 6. Smoke test on hosted

1. Professional login: agenda loads; book a walk-in customer from a free slot; the booking appears.
2. Professional: cancel and move an appointment (the customer with an account gets the notification).
3. Professional: clients tab (search, load more), reports, working hours, privacy screen.
4. Owner: login, Revenue screen, agenda.
5. Customer: sign up with an email a professional used before; after confirming the email the history is there.
6. Password recovery link opens the app (web origin and, on a dev build, `zenc://`).

## 7. Rollback

Migrations are forward-only (append-only once applied, decision `018`). If something breaks, restore the backup from step 1 rather than hand-editing.

## 8. Legal data (before the public launch)

Fill `src/features/legal/company.ts` (razão social, CNPJ, endereço, foro) and have a lawyer review `docs/legal/revisao-juridica.md`.
While a field is empty the documents show it as a highlighted placeholder, so after deploying open `/privacidade`, `/termos` and
`/contrato` and confirm no `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]` or `[FORO]` is left. Changing a document's text means bumping its
`version` in `src/features/legal/documents/`: every user then sees the "Atualizamos nossos termos" screen once.
