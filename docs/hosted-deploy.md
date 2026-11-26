# Hosted deploy (dev, production, backups)

> **Status (2026-11-26):** plans 1 (dev pipeline, scheduled dispatch, Sentry) and 2 (production promotion) are **in the repository** but
> have never run: nothing is deployed yet, because they need the owner's secrets (sections 0b to 0e). Backups (plan 3) are designed in
> `docs/superpowers/specs/2026-11-26-deploy-05-design.md` and `docs/superpowers/plans/2026-11-26-deploy-{1-dev,2-prod,3-backups}.md`.
> Sections 1 to 10 below are the manual steps; the pipeline runs sections 2, 3 (config) and 5 (functions) for every deploy, and a human
> only does the one-time parts. Spikes and their pass criteria: `docs/deploy-spikes.md`.

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

## 0b. First dev deploy: what the owner does (once)

1. Fill the two placeholders in `supabase/config.toml` `[remotes.dev]` (the dev project ref, 20 letters, and the account part of
   `zenc-web-dev.<account>.workers.dev`, shown in Cloudflare > Workers & Pages) and merge that. The deploy workflow refuses to run
   while `REPLACE-` is left, or while `SUPABASE_PROJECT_REF` has no `[remotes.*]` block.
2. GitHub > Settings > Environments > `dev`: add the secrets and variables of the table below, and set the Supabase **function secrets** of
   `zenc-dev` (section 0c). The owner pastes every value.
3. GitHub > Settings > Branches: protect `main`: require a pull request and the `verify` status check before merging.
4. Run `docs/deploy-spikes.md` S3 (config diff, answer "no") before the first merge.
5. Merge to `main`: `verify` runs, then `dev` deploys. Read the log; then S4a and S4c.
6. Cloudflare > Workers & Pages > `zenc-web-dev` > Settings > Domains & Routes > Enable Cloudflare Access (workers.dev **and**
   preview URLs); policy "Allow" for exactly two e-mails: zencpro.admin@gmail.com and your personal e-mail. Open the address, log in once.
7. Create the dev test business once (the owner's own shell, service-role key pasted by them):

   ```bash
   read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_URL=https://<DEV_REF>.supabase.co SHOP_URL_TEMPLATE='https://zenc-web-dev.<account>.workers.dev/?shop={slug}' node scripts/create-shop.mjs --name "Demo" --slug demo --owner <your test e-mail>
   unset SUPABASE_SERVICE_ROLE_KEY
   ```

   then set the GitHub variable `EXPO_PUBLIC_DEV_SHOP_SLUG=demo` and re-run the `deploy` workflow.

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

## 0c. Function secrets (set once per Supabase project: `zenc-dev` AND `zenc-prod`)

Dashboard > Edge Functions > Secrets, or `npx supabase secrets set --project-ref <REF> NAME=value ...` typed by the owner. They never
travel through the repo or CI. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

| Secret | `zenc-dev` | `zenc-prod` |
|---|---|---|
| `DISPATCH_TOKEN` | `openssl rand -hex 32`, **the same value as the GitHub environment `dev` secret** (the cron job sends it from Vault, the function compares it) | a different `openssl rand -hex 32`, **the same value as the GitHub environment `production` secret** |
| `RESEND_API_KEY` | the `zenc-dev` key (also the `dev` GitHub secret) | the `zenc-prod` key (also the `production` GitHub secret) |
| `EMAIL_FROM` | `Zenc <nao-responda@zencpro.com.br>` | `Zenc <nao-responda@zencpro.com.br>` |
| `SHOP_URL_TEMPLATE` | `https://zenc-web-dev.<account>.workers.dev/?shop={slug}` | `https://{slug}.zencpro.app` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | pair 1 (`npx web-push generate-vapid-keys`); the public half is also the `dev` variable `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | pair 2; the public half is also the `production` variable |
| `VAPID_SUBJECT` | `mailto:contato@zencpro.com.br` | `mailto:contato@zencpro.com.br` |
| `SENTRY_DSN_FUNCTIONS` | the `zenc-functions` DSN | the same DSN |
| `SENTRY_ENVIRONMENT` | `dev` | `production` |
| `EXPO_ACCESS_TOKEN` | optional (Expo push; not needed for web-only 0.5) | optional |

Check after setting: Edge Functions > Secrets lists every name above for the project, and `DISPATCH_TOKEN` has the same length (64) in
GitHub and in Supabase (never print it; compare lengths only).

## 0d. Production: what the owner does, in order

1. **GitHub environment `production`** (Settings > Environments): required reviewer = the owner; deployment branches = `main` only.
   Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (prod database password), `RESEND_API_KEY` (the `zenc-prod` key), `DISPATCH_TOKEN`
   (section 0c), `CLOUDFLARE_API_TOKEN`, `SENTRY_AUTH_TOKEN`. Variables: `SUPABASE_PROJECT_REF`, `CLOUDFLARE_ACCOUNT_ID`,
   `EXPO_PUBLIC_SUPABASE_URL` (`https://<PROD_REF>.supabase.co`), `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the prod publishable key),
   `EXPO_PUBLIC_SHOP_BASE_DOMAIN=zencpro.app`, `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN=.zencpro.app`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY`,
   `EXPO_PUBLIC_SENTRY_DSN` (the `zenc-app` DSN). `EXPO_PUBLIC_DEV_SHOP_SLUG` stays unset.
2. **Cloudflare API token for production:** create a second token (`zenc-deploy-prod`) with Workers edit on the account **and**
   Zone > Workers Routes > Edit on `zencpro.app`. Never reuse the dev token.
3. **`supabase/config.toml`:** replace the `[remotes.prod]` placeholder `project_id` with the `zenc-prod` ref and merge. A workflow run
   whose `SUPABASE_PROJECT_REF` has no block there stops before touching anything.
4. **Function secrets** of `zenc-prod`: the `zenc-prod` column of section 0c.
5. **Cloudflare DNS, zone `zencpro.app`:** two **proxied** (orange cloud) `A` records: name `@` and name `*`, both content `192.0.2.1`
   (a placeholder: the Worker Routes answer before it is ever contacted). Explicit records, if any, win over the wildcard. SSL/TLS mode
   "Full (strict)". Universal SSL covers the apex and one wildcard level.
6. **Cloudflare Email Routing for `zencpro.com.br`:** enable it; custom addresses `contato@` and `privacidade@` forward to
   zencpro.admin@gmail.com; confirm the verification e-mail. Both addresses are printed in the legal texts and in every automatic e-mail,
   so they must work before the first invite.
7. **Resend:** the domain `zencpro.com.br` shows "Verified" and the `zenc-prod` key can send from it.
8. **Dry run (read only):** `npx supabase link --project-ref <PROD_REF>` then `npx supabase db push --dry-run`: all 83 migrations
   (`0001` to `0083`) are listed and nothing else (the project is empty, so no duplicate e-mail pre-check is needed). Then
   `docs/deploy-spikes.md` S3 against the prod ref: answer "no"; the diff shows only production values.
9. **Promote:** merge to `main` (or Actions > deploy > Run workflow). `verify` and `dev` run; the `production` job waits. Actions > the
   run > "Review deployments" > tick `production` > Approve. This is the first and last time migrations are applied from zero:
   **from now on they are append-only** (decision `018`).
10. **Read the run:** `db push` applies `0001` to `0083`; `config push` applies the production values; three functions deploy; the web
    bundle uploads; `assert-hosted-auth` and the OPTIONS check pass; the apex and the logo answer.
11. **Verify (SQL editor of `zenc-prod`):** `select name from vault.decrypted_secrets order by name;` lists `dispatch_token` and
    `dispatch_url` (never the secret column); `select jobname, active from cron.job order by jobname;` lists four active jobs
    (`barberschedule-payout-due`, `zenc-dispatch-notifications`, `zenc-materialize-recurrence`, `zenc-notification-reminders`).
12. **Turn the e-mail claim on** (only now: confirmations are enforced, the CI step proved it): `update public.app_settings set email_claim_enabled = true;`.
13. **Bare domain:** `https://zencpro.app/` shows the page asking for the business's link; `https://anything.zencpro.app/` says "negócio não encontrado".

### 0e. The first real business

The owner decides name, slug, the owner's e-mail and time zone. Slugs are permanent addresses: `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$`, not
reserved (`www app api admin zenc mail email smtp static assets cdn docs help support status blog dev staging test login auth`).

```bash
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL=https://<PROD_REF>.supabase.co SHOP_URL_TEMPLATE='https://{slug}.zencpro.app' node scripts/create-shop.mjs --name "<Nome do negócio>" --slug <slug> --owner <e-mail do dono> --timezone America/Sao_Paulo
unset SUPABASE_SERVICE_ROLE_KEY
```

The script checks the slug first and sends nothing if it is taken. Never run it, or any SQL against production, from CI or through Claude.

1. The owner receives "Você foi convidado para <negócio> na Zenc" from `Zenc <nao-responda@zencpro.com.br>` with the logo and the
   automatic-e-mail footer; the button opens `https://<slug>.zencpro.app/reset-password`. They set a password, sign in and see the
   setup checklist (agreement, details, hours, a service, a team member); "Abrir minha agenda" opens the business and shows its link and QR.
   Until then visitors see "Em breve".
2. Read-only check: `select slug, name, setup_completed_at is not null as open from public.shops order by created_at desc limit 3;`.
3. Customer smoke with a real address of the owner's: sign up on `https://<slug>.zencpro.app/`, confirm the e-mail, book an appointment
   for tomorrow, run `select public.enqueue_notification_reminders();`; within two minutes the reminder e-mail arrives (Resend's 100/day is
   shared with dev: do this once). Turn "Lembretes por e-mail" off and confirm no second reminder row appears.
4. iPhone Safari: install the PWA from the business address, sign in, enable push. Record the result (it is unverified until then).

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

Migrations are forward-only (append-only once applied, decision `018`): a mistake gets a **new** migration, never an edit of an applied
file. If data is lost or corrupted, recover from the nightly backup with `docs/restore-runbook.md` (plan 3) rather than hand-editing the
database. A bad web release is rolled back by re-running the `deploy` workflow on the previous good commit (Actions > deploy >
Run workflow, ref `main` after a revert PR); migrations are not undone by that.

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

