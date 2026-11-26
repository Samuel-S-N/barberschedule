# Hosted deploy (dev, production, backups)

> **Status (2026-11-26): target flow, not applied yet.** Nothing is deployed. The flow below is designed in
> `docs/superpowers/specs/2026-11-26-deploy-05-design.md` and built by three plans: `2026-11-26-deploy-1-dev.md`,
> `-deploy-2-prod.md` and `-deploy-3-backups.md`. Each plan's last task removes this banner for what it delivered. Until then,
> sections 1 to 10 are the manual steps a human would run; once the pipeline exists the pipeline runs sections 2, 3 (config) and 5
> (functions) for every deploy and a human only does the one-time parts marked **(user)**.

## 0. The flow in one screen

- **One branch, `main`.** Every merge runs `verify` (typecheck, lint, Jest, script tests, pgTAP on a clean database) and then deploys
  to **dev** (`zenc-dev` + the `zenc-web-dev` Worker behind Cloudflare Access) by itself.
- **Production** is the same commit promoted by one approval in the GitHub Environment `production` (reviewer: the owner): `zenc-prod`
  + the `zenc-web` Worker on `zencpro.app` and `*.zencpro.app`.
- **Backups:** nightly encrypted dump of `zenc-prod` to Cloudflare R2 (30 daily, 12 monthly); restore runbook `docs/restore-runbook.md`.
- Migrations are **append-only from the first hosted deploy** (decision `018`); never `db reset` and never `db push --include-seed` on
  a hosted project (`supabase/seed.sql` has fictional users).
- Every account is owned by `zencpro.admin@gmail.com` (2FA). Secrets are pasted by the owner into GitHub, Supabase or Cloudflare,
  never into the repo, a chat or a tool.

### Secrets and variables (names exactly as the workflows read them)

| Name | Kind | Where | Used by |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | GitHub env `dev`, `production` | `db push`, `config push`, `functions deploy` |
| `SUPABASE_DB_PASSWORD` | secret | GitHub env `dev`, `production` | `db push` |
| `SUPABASE_PROJECT_REF` | variable | GitHub env `dev`, `production` | every Supabase command |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | variable (public values) | GitHub env `dev`, `production` | web build, smoke checks |
| `EXPO_PUBLIC_SHOP_BASE_DOMAIN`, `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN`, `EXPO_PUBLIC_DEV_SHOP_SLUG`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, `EXPO_PUBLIC_SENTRY_DSN` | variable | GitHub env `dev`, `production` | web build |
| `RESEND_API_KEY` | secret | GitHub env (one key per env) **and** Supabase function secret | SMTP in `config push`; `dispatch-notifications` |
| `DISPATCH_TOKEN` | secret | GitHub env **and** Supabase function secret (same value) | cron job to `dispatch-notifications` (Vault via `db push`) |
| `CLOUDFLARE_API_TOKEN` | secret | GitHub env `dev`, `production` (a separate token each) | `wrangler deploy` |
| `CLOUDFLARE_ACCOUNT_ID` | variable | GitHub env `dev`, `production` | `wrangler deploy` |
| `SENTRY_AUTH_TOKEN` | secret | GitHub env `dev`, `production` | source map upload |
| `SENTRY_DSN_FUNCTIONS`, `SENTRY_ENVIRONMENT`, `EMAIL_FROM`, `SHOP_URL_TEMPLATE`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `EXPO_ACCESS_TOKEN` (optional) | Supabase function secrets | each Supabase project | Edge Functions |
| `SUPABASE_DB_URL` (session pooler of `zenc-prod`), `AGE_PUBLIC_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secret | GitHub env `backup` only | nightly backup |
| `R2_ACCOUNT_ID`, `R2_BUCKET` | variable | GitHub env `backup` only | nightly backup |
| age **private** key | (never in a system) | the owner's password manager | restore only |

The step-by-step owner checklist (R2 card, bucket, tokens, key pair, Access policy, Resend domain, Email Routing, approving the first
production run) is section 6 of the spec; each plan repeats the items it needs.

## 1. Before touching the database

(Only relevant for a project that already holds data. A new project has none: skip to section 2.)

1. **Back up** (the nightly job, or `supabase db dump --linked -f backup.sql`).
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
2. **URL Configuration:** Site URL = the production web origin; Redirect URLs = the production origin with `/**`,
   **`https://*.zencpro.app/**`** (invites and password recovery redirect to each business's own subdomain; without the wildcard the
   link in the e-mail is refused and falls back to the Site URL) and `zenc://**`. Local-only `exp://` URLs do not belong here.
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
- `pg_cron` registers the jobs in migrations `0022` and `0062` (`zenc-notification-reminders` every 15 minutes,
  `zenc-materialize-recurrence` hourly, `barberschedule-payout-due` hourly at :05). They only **enqueue** rows. Until migration
  `0083` (plan 1) nothing called `dispatch-notifications`: it was only run by hand, so no push or reminder e-mail would leave a
  hosted project. `0083` adds the job `zenc-dispatch-notifications` (every minute, `pg_net`) that calls the function with
  `Authorization: Bearer <DISPATCH_TOKEN>`; the URL and the token come from Supabase Vault (`dispatch_url`, `dispatch_token`,
  filled from `[remotes.*.db.vault]` by `db push`). The service-role bearer is still accepted for manual calls; the anon key gets 401.

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

Publish the official legal version reviewed by the lawyer (`docs/legal/revisao-juridica.md`): the documents in
`src/features/legal/documents/` only name "Zenc" until then. Changing a document's text means bumping its `version` there: every
user then sees the "Atualizamos nossos termos" screen once.

## 9. New shops start closed (setup checklist)

A shop created by `scripts/create-shop.mjs` (or `create_shop`) has `shops.setup_completed_at = null`: its owner must finish the
setup checklist (agreement, details, hours, a service, a team member with hours and services) at `<slug>.zencpro.app`, and then
"Abrir minha agenda" opens it and shows the link and QR code. Until then visitors see "Em breve" and `book_appointment` rejects
bookings (`P0044`). Existing shops, and every seed or test shop, are open: the column defaults to `now()` and only `create_shop`
sets it to null. Nothing to configure at deploy time; tell each new owner the checklist is their first step.

## 10. E-mail (Resend and the auth templates)

0. **Deploy the web app first**: the e-mails load their logo from `https://zencpro.app/email/zenc-logo.png`, a static file of the
   web app (`public/email/`). Check it opens in the browser before sending real e-mails.
1. Verify the sending domain **`zencpro.com.br`** in Resend (the DKIM and SPF records it shows) and create an API key. Every e-mail is sent from the same address, `Zenc <nao-responda@zencpro.com.br>`; the templates say it is automatic and point account questions to `contato@zencpro.com.br`, so that mailbox must exist.
2. **Auth e-mails use Resend SMTP.** In the hosted project's Dashboard > Authentication > SMTP settings (or `[auth.email.smtp]` in
   `config.toml` with `pass = "env(RESEND_API_KEY)"`): host `smtp.resend.com`, port `465`, user `resend`, password = the Resend API
   key, sender `Zenc <nao-responda@zencpro.com.br>` (the same address). Without custom SMTP the hosted project's built-in sender is rate-limited and not
   for production.
3. **Push the templates:** `npx supabase link --project-ref <ref>`, then `npx supabase config push` (sends the
   `[auth.email.template.*]` subjects and `supabase/templates/*.html`: confirmation, recovery, e-mail change, invite). Check
   Dashboard > Authentication > Email Templates shows the Portuguese templates. The invite subject and body use
   `{{ .Data.business_name }}`, which `invite-professional` and `scripts/create-shop.mjs` send in the invite data.
4. **Reminder e-mails:** `npx supabase secrets set RESEND_API_KEY=<key> EMAIL_FROM="Zenc <nao-responda@zencpro.com.br>"`, then redeploy
   `dispatch-notifications` (`npx supabase functions deploy dispatch-notifications`). Without `RESEND_API_KEY` the function logs
   "skipping e-mail" and marks the rows done, so no reminder e-mail is sent.
5. Apply migration `0082` with the others (`db push`, section 2).
6. Smoke test: create a customer account, book an appointment 24 h ahead, run `select public.enqueue_notification_reminders();` and
   invoke the function (or wait for the schedule). The e-mail arrives and "Ver meus agendamentos" opens the business page. Turn
   "Lembretes por e-mail" off in that customer's Settings and confirm the next reminder creates no e-mail row.

