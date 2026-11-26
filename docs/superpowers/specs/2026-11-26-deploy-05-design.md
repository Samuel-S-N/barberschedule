# Zenc 0.5 deploy: design

Date: 2026-11-26
Status: approved by the user (decisions below are theirs); implementation not started
Plans: `docs/superpowers/plans/2026-11-26-deploy-1-dev.md`, `-deploy-2-prod.md`, `-deploy-3-backups.md`

## 1. Goal

Put Zenc 0.5 (web/PWA only) on the internet with two hosted environments, **dev** and **production**, a CI/CD flow where every
merge to `main` reaches dev by itself and production by one approval, error reporting, scheduled jobs that really run, and a
nightly encrypted backup of production that has been restored for real at least once.

Non-goals (0.5): store builds (EAS stays as it is), the marketing site on `zencpro.com.br`, payments, WhatsApp/SMS, uptime
monitoring, Turnstile, Sentry performance/replay/logs (PII), a `develop` branch, a staging environment between dev and production.

## 2. Decisions already made (the user's)

| Topic | Decision |
|---|---|
| Identity | Every Zenc account is owned by `zencpro.admin@gmail.com` with 2FA. Domain addresses (`contato@`, `privacidade@zencpro.com.br`) only forward to it (Cloudflare Email Routing); the root account is never a domain address. |
| Cloudflare | Domains `zencpro.app` and `zencpro.com` registered there; `zencpro.com.br` stays registered at Registro.br with DNS delegated to Cloudflare. |
| GitHub | Org `zencpro`, repo `zencpro/zenc`, private. |
| Supabase | Org "Zenc" with project `zenc-prod`, org "Zenc Dev" with project `zenc-dev`; both `sa-east-1`, Free; Data API on; "grant API access to new tables automatically" ON; "enable RLS on new tables automatically" ON; **not** connected to GitHub (we deploy from Actions). |
| E-mail | Resend; sender `Zenc <nao-responda@zencpro.com.br>`; domain `zencpro.com.br` verified through Cloudflare auto-configure; free tier 3,000/month and 100/day (UTC) shared by dev and prod. |
| Sentry | Org slug `zenc`, EU region (`ingest.de.sentry.io`), projects `zenc-app` (React Native, also Expo web) and `zenc-functions` (Deno); error monitoring only; data scrubbing on; IP storage off. |
| Flow | **A**: single `main`. Merge to `main` deploys to **dev** automatically; **production** is the same commit promoted through the GitHub Environment `production` with the user as required reviewer. No `develop`. |
| Dev web | Cloudflare Workers (static assets) on a free `*.workers.dev` address behind Cloudflare Access (allowed e-mails only); one test business chosen with `EXPO_PUBLIC_DEV_SHOP_SLUG` or `?shop=` (already supported by the app: `resolveCurrentSlug`). |
| Production web | Same Workers setup on `*.zencpro.app` (wildcard Workers route plus proxied wildcard DNS); the bare domain shows the existing bare page. |
| Migrations | Append-only after the first hosted deploy (decision `018`). The first hosted deploy applies every file in `supabase/migrations`. |
| Backups | Nightly GitHub Action: dump `zenc-prod`, encrypt with a key only the user holds (`age`, public key in GitHub, private key in the user's password manager), upload to Cloudflare R2; keep 30 daily and 12 monthly; failures e-mail from GitHub; restore runbook proven by restoring into `zenc-dev`. |
| First business | Created with `scripts/create-shop.mjs` against production (invite, then the setup checklist from readiness part C). |
| Secrets | The user pastes every secret into GitHub, Supabase or Cloudflare. Claude never types keys or passwords. Least privilege; no MCP connector with write access to production. |
| Tests | pgTAP on a clean database stays in CI (`npm run verify`); pgTAP `064` fails if a `public` table has RLS off. |

## 3. Architecture

```
                         pull request                          merge to main
                              │                                       │
                      verify.yml (clean DB,                  deploy.yml (same verify
                      typecheck, lint, Jest,                 first, then:)
                      pgTAP, script tests)                          │
                                                                    ▼
                                                   job deploy-dev  (environment: dev)
                                                   ├─ supabase db push        → zenc-dev
                                                   ├─ supabase config push    → zenc-dev (auth templates, URLs, SMTP)
                                                   ├─ supabase functions deploy → zenc-dev
                                                   ├─ sentry source maps (app build)
                                                   └─ expo export + wrangler deploy → zenc-web-dev (Access)
                                                                    │ needs
                                                                    ▼
                                                   job deploy-prod (environment: production, reviewer: the user)
                                                   └─ the same four steps against zenc-prod and zenc-web
                                                      (*.zencpro.app)

   backup.yml (cron 05:00 UTC, environment: backup) → dump zenc-prod → age → R2 (daily/, monthly/)
```

Environments and what differs:

| | local | dev | production |
|---|---|---|---|
| Database | Docker Supabase | `zenc-dev` | `zenc-prod` |
| Web | Metro / static export on `*.localhost` | Worker `zenc-web-dev` on `*.workers.dev`, behind Access | Worker `zenc-web` on `zencpro.app` + `*.zencpro.app` |
| Shop selection | host label | `?shop=` or `EXPO_PUBLIC_DEV_SHOP_SLUG` | host label (`<slug>.zencpro.app`) |
| `EXPO_PUBLIC_SHOP_BASE_DOMAIN` | `localhost` | `zencpro.app` (the dev host is not under it, so the `?shop=` path applies) | `zencpro.app` |
| `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN` | empty | empty | `.zencpro.app` (one login across business subdomains) |
| `SHOP_URL_TEMPLATE` (function secret) | `http://{slug}.localhost:8081` | `https://zenc-web-dev.<account>.workers.dev/?shop={slug}` (needs the small `buildShopUrl` change in plan 1) | `https://{slug}.zencpro.app` |
| Sentry `environment` | none (SDK off) | `dev` | `production` |
| E-mail | none (Inbucket) | Resend (same domain) | Resend |

"Same commit" means the same git SHA and the same migrations and functions. The web bundle is rebuilt per environment because
Expo inlines `EXPO_PUBLIC_*` at build time (Supabase URL, base domain, VAPID public key, Sentry DSN).

## 4. Components

### 4.1 CI/CD

- `verify.yml` stays the gate: `npm ci`, `npx supabase start`, `npm run verify` (typecheck, root lint, Jest, script tests, pgTAP on a
  clean DB). It changes triggers: `pull_request` and `workflow_call` (today it runs on every push **and** every PR, which doubles the
  minutes). Branch pushes without a PR are not verified; that is accepted.
- `deploy.yml` (new): `on: push: branches: [main]`. Jobs: `verify` (calls `verify.yml`), `deploy-dev` (needs verify, environment `dev`),
  `deploy-prod` (needs deploy-dev, environment `production`). `concurrency: { group: deploy, cancel-in-progress: false }` so deploys never
  overlap and only the newest commit waits for approval (older pending runs are replaced).
- Both deploy jobs run the same steps with different environment secrets and variables. The steps live in one reusable workflow
  `.github/workflows/deploy-env.yml` (`workflow_call`, input `environment`, job-level `environment: ${{ inputs.environment }}`) so dev
  and production cannot drift and the production approval gate attaches to the called job.
- Production approval: GitHub Environment `production`, required reviewer = the user. A pending review is the "promote" button.
- GitHub minutes: private repos have 2,000 free minutes per month. `verify` is the costly job (Docker, about 8 to 10 minutes). It runs
  once per PR push and once per merge. Watch it (risk R6).

### 4.2 Supabase per environment

- `supabase/config.toml` remains the **local** configuration. Hosted differences go into `[remotes.dev]` and `[remotes.prod]` blocks
  (`project_id` = the project ref, which is not a secret) that override only: `auth.site_url`, `auth.additional_redirect_urls`,
  `auth.email.enable_confirmations = true`, `auth.email.smtp` (Resend, `pass = "env(RESEND_API_KEY)"`). Without them `config push`
  would send the local values (`site_url = http://127.0.0.1:3000`, confirmations off) to a hosted project. The CLI version in the
  repo is `2.114.0`; spike S3 proves the `[remotes]` behaviour with `config push --dry-run`-style output before the first push.
- `supabase db push --linked` never gets `--include-seed` (`supabase/seed.sql` holds fictional users). Never `db reset` on a hosted project.
- Function secrets (`supabase secrets set`): `RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
  `SHOP_URL_TEMPLATE`, `SENTRY_DSN_FUNCTIONS`, `SENTRY_ENVIRONMENT`, `DISPATCH_TOKEN`, optional `EXPO_ACCESS_TOKEN`. The user sets them
  once per project; CI never holds them. (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.)
- Functions are deployed from CI with `supabase functions deploy` (no Docker needed: `--use-api`).
- Hosted checks kept from `docs/hosted-deploy.md`: email confirmations ON, `app_settings.email_claim_enabled` turned on only after
  `scripts/assert-hosted-auth.mjs` passes (CI runs that script after `config push`; turning the flag on stays a manual SQL step).

### 4.3 Scheduled jobs (finding)

Today the database registers three `pg_cron` jobs (migrations `0022` and `0062`): `zenc-notification-reminders` (every 15 minutes),
`zenc-materialize-recurrence` (hourly) and `barberschedule-payout-due` (hourly at :05). They only **enqueue** rows
(`notification_outbox`, recurrence appointments). **Nothing calls `dispatch-notifications`**, locally or hosted: today it is only
invoked by hand, so no push and no reminder e-mail would ever leave a hosted project.

Decision (flagged, mine): a new migration `0083_schedule_dispatch.sql` adds `public.invoke_dispatch_notifications()` and a `pg_cron`
job every minute that does `net.http_post` (pg_net) to the function URL with `Authorization: Bearer <DISPATCH_TOKEN>`, both values
read from Supabase Vault at run time. It is a no-op while the Vault secrets are missing, so local and CI databases are unaffected.
`DISPATCH_TOKEN` is a random 32-byte secret, distinct from the service-role key, accepted by the function next to the service-role
bearer (`isServiceRequest` keeps working). The function is deployed with `verify_jwt = false` (it authenticates itself; a random token
is not a JWT, so the platform gateway would reject it otherwise). The Vault values come from `[db.vault]` in the remote config blocks
(`env(...)`, applied by `db push`) or, as fallback, a one-time `vault.create_secret(...)` in the SQL editor (user step).
Hosted `pg_cron` and `pg_net` are available on Free; the migration enables them like `0022` does.
Alternative rejected: a GitHub scheduled workflow (5-minute floor, frequent delays, and it would hold the service-role key).

### 4.4 Web hosting (Cloudflare Workers, static assets)

- `wrangler.jsonc` at the root with two environments. Assets directory `dist` (the output of `expo export --platform web`),
  `not_found_handling: "single-page-application"`, no Worker script unless spike S1 shows the dynamic route needs one.
- `zenc-web-dev`: workers.dev only, Cloudflare Access enabled on it (policy: the allowed e-mails, one-time PIN). Preview URLs
  disabled, so there is no unprotected address.
- `zenc-web` (production): Workers Routes `zencpro.app/*` and `*.zencpro.app/*` in zone `zencpro.app`, plus proxied DNS records for the
  apex and `*`. Universal SSL covers the apex and one wildcard level. Custom Domains do not support wildcards, hence Routes.
- `public/_headers`: `sw.js` and `manifest.json` with `Cache-Control: no-cache` so a new deploy reaches installed PWAs.
- Deploy command in CI: `npx wrangler deploy --env <dev|production>` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Cookies: production sets `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN=.zencpro.app`.

### 4.5 Sentry

- App: `@sentry/react-native` with the Expo config plugin (`organization: zenc`, `project: zenc-app`, `url: https://de.sentry.io/`).
  A small wrapper `src/lib/monitoring/sentry.ts` calls `Sentry.init` only when `EXPO_PUBLIC_SENTRY_DSN` is set, with
  `sendDefaultPii: false`, `environment` from `EXPO_PUBLIC_APP_ENV`, no tracing, no replay, and a `beforeSend` that strips request
  bodies, cookies, the URL query and e-mail-looking strings. Unit-tested.
- Functions: `supabase/functions/_shared/sentry.ts` with the same scrubbing. Primary: `npm:@sentry/deno`. Fallback if the hosted
  runtime rejects it: a minimal envelope POST to the DSN (about 30 lines, no dependency). Spike S2 decides.
- Source maps: uploaded from CI with `SENTRY_AUTH_TOKEN` (`@sentry/cli`, release = git SHA) for the web bundle, then the `.map` files
  are removed from the published `dist` so source code is not served.
- No Sentry for native builds in 0.5 (no store builds); the plugin only needs to not break `expo export`.

### 4.6 Backups

- `backup.yml`: `schedule: cron "0 5 * * *"` (02:00 in Brasília) plus `workflow_dispatch`. Its own GitHub Environment `backup`
  (no reviewer, otherwise the nightly run would wait for approval) holding only: `SUPABASE_DB_URL` (session-pooler connection string
  of `zenc-prod`, IPv4), `AGE_PUBLIC_KEY`, and the scoped R2 credentials.
- Steps: three `supabase db dump --db-url` files (roles, schema, data with `--use-copy`), a `counts.txt` of rows per `public` table,
  tar, `age -r "$AGE_PUBLIC_KEY"`, upload with the S3 API of R2. Sanity checks fail the job (empty file, missing `CREATE TABLE`).
- Layout in the bucket: `daily/zenc-prod-YYYY-MM-DD.tar.age` (R2 lifecycle: delete after 30 days) and, on the first of the month,
  a copy in `monthly/` (lifecycle: delete after 366 days). Pruning is configuration in R2, not code.
- The private key never leaves the user's password manager. Without it the archive is unreadable; with the public key in GitHub a
  leak of the repo secrets cannot decrypt old backups.
- Restore runbook `docs/restore-runbook.md`, proven by restoring a real dump into `zenc-dev` (plan 3). A drill log section records
  every drill (date, dump used, minutes, problems).

## 5. Secrets and variables matrix

Nothing below is ever committed. `Var` = a GitHub environment variable (not secret, still per environment).

| Name | Where it lives | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` (Workers deploy, scoped to the account and the `zencpro.app` zone) | GitHub env `dev`, `production` (one token per env is better) | `wrangler deploy` |
| `CLOUDFLARE_ACCOUNT_ID` | Var in `dev`, `production` | `wrangler deploy` |
| `SUPABASE_ACCESS_TOKEN` (personal access token of `zencpro.admin`) | Secret in `dev`, `production` | `db push`, `config push`, `functions deploy` |
| `SUPABASE_DB_PASSWORD` | Secret per env (the database password of that project) | `db push` |
| `SUPABASE_PROJECT_REF` | Var per env | all Supabase commands |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Var per env (public values) | web build |
| `EXPO_PUBLIC_SHOP_BASE_DOMAIN`, `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN`, `EXPO_PUBLIC_DEV_SHOP_SLUG`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_APP_ENV` | Var per env | web build |
| `RESEND_API_KEY` | Secret per env (a different key for dev and prod) and function secret per project | `config push` (SMTP), `dispatch-notifications` |
| `DISPATCH_TOKEN` | Secret per env (for the vault value) and function secret per project | cron to function |
| `SENTRY_AUTH_TOKEN` | Secret in `dev`, `production` | source map upload |
| `SENTRY_DSN_FUNCTIONS` | Function secret per project | functions |
| `SUPABASE_DB_URL` (prod session pooler), `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | GitHub env `backup` | backup |
| age **private** key | Password manager only | restore |

## 6. User-only checklist

Everything here is done by the user (the person typing secrets is never Claude). Each step says where the value goes.

**A. Before plan 1 (dev)**
1. Cloudflare: confirm `zencpro.com.br` is active on Cloudflare (the nameservers were delegated at Registro.br on 2026-11-26). Resend > Domains > add `zencpro.com.br` >
   "Auto configure" with Cloudflare; wait for "Verified".
2. Resend: create API key `zenc-dev` (sending access, domain `zencpro.com.br`) and key `zenc-prod`. Paste into GitHub env `dev` /
   `production` as secret `RESEND_API_KEY` (plan 1 and 2 tell when).
3. Supabase: note both project refs (Project Settings > General). Create the personal access token `zenc-ci` (Account > Access Tokens):
   GitHub secret `SUPABASE_ACCESS_TOKEN` in `dev` and `production`. Database passwords: GitHub secret `SUPABASE_DB_PASSWORD` per env.
4. Sentry: create an organization auth token (`org:ci` scope is enough for releases and source maps): GitHub secret `SENTRY_AUTH_TOKEN`.
   Copy the two DSNs: app DSN into var `EXPO_PUBLIC_SENTRY_DSN`; functions DSN into the Supabase function secret `SENTRY_DSN_FUNCTIONS`.
5. Cloudflare: API token `zenc-deploy` from the template "Edit Cloudflare Workers" (account scope plus zone `zencpro.app` for routes):
   GitHub secret `CLOUDFLARE_API_TOKEN`; `CLOUDFLARE_ACCOUNT_ID` as var.
6. GitHub: create environments `dev`, `production` (required reviewer: the user; self-review allowed since they are the only member),
   `backup`. Repo settings: Actions allowed, require the `verify` check on PRs to `main`, GitGuardian check present.
7. VAPID: `npx web-push generate-vapid-keys` twice (dev and prod). Public key into var `EXPO_PUBLIC_VAPID_PUBLIC_KEY`; both keys and
   `VAPID_SUBJECT=mailto:contato@zencpro.com.br` into the Supabase function secrets of that project.
8. Supabase function secrets per project (Dashboard > Edge Functions > Secrets, or the CLI): `RESEND_API_KEY`, `EMAIL_FROM`,
   `SHOP_URL_TEMPLATE`, `DISPATCH_TOKEN` (generate with `openssl rand -hex 32`), `SENTRY_DSN_FUNCTIONS`, `SENTRY_ENVIRONMENT`, the VAPID three.
9. After the first dev deploy: Cloudflare > Workers & Pages > `zenc-web-dev` > Settings > Domains & Routes > Enable Cloudflare Access
   (workers.dev **and** preview URLs), policy "Allow" for the e-mails listed by the user; open the address and log in once to check.

**B. Before plan 2 (production)**
10. Cloudflare DNS for `zencpro.app`: proxied `A` records `@` and `*` with the placeholder address `192.0.2.1` (the Worker Route answers before it is
    contacted; plan 2 Task 4 has the exact steps); no other record may shadow them.
11. Cloudflare Email Routing for `zencpro.com.br`: `contato@` and `privacidade@` forward to `zencpro.admin@gmail.com`; confirm the
    verification e-mail. Gmail "send as" is not needed (the app only receives at those addresses).
12. First production deploy: approve it in GitHub (Actions > the run > Review deployments).

**C. Before plan 3 (backups)**
13. Cloudflare: add a payment card to enable R2 (stay inside the 10 GB free tier); create bucket `zenc-backups` (location: automatic, no public access).
14. R2 > Manage API tokens: token with **Object Read & Write limited to the bucket `zenc-backups`**; paste Access Key ID, Secret and the
    account ID into GitHub env `backup` (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`) and the bucket name `R2_BUCKET`.
15. R2 > bucket > Settings > Object lifecycle rules: `daily/` delete after 30 days; `monthly/` delete after 366 days.
16. On the user's computer: `age-keygen -o zenc-backup.key` (install `age` first). Put the whole file in the password manager (two copies: the
    manager and an offline copy). GitHub env `backup` secret `AGE_PUBLIC_KEY` = the line `Public key: age1...` (never the secret line).
17. Supabase `zenc-prod` > Connect > "Session pooler" connection string, password filled in: GitHub env `backup` secret `SUPABASE_DB_URL`.

## 7. Risks

- **R1 Dynamic route on static hosting.** The export has one dynamic route (`clients/[id]`). `serve-web-static.mjs` maps it to
  `clients/[id].html`; Workers asset routing will not. SPA fallback serves root `index.html` for `/clients/123`, which may hydrate wrong.
  Spike S1 (local `wrangler dev` + Playwright) decides; fallback is a 25-line Worker script porting `resolveDynamic`.
- **R2 `@sentry/deno` on the hosted runtime.** Sentry's v11 docs need Deno ≥ 2.8.3; local supabase edge-runtime 1.74.3 reports Deno 2.1.4
  compatibility. Sentry's Deno SDK also does not instrument `Deno.serve` (no per-request scope). Spike S2, fallback in 4.5.
- **R3 `config push` overwrites hosted auth settings with local values** unless the `[remotes.*]` overrides work as expected. Spike S3.
- **R4 pg_net and Vault on hosted.** The migration must not break local/CI where Vault values are absent (no-op by design). Unverified:
  `[db.vault]` in the pinned CLI; fallback is the one-time SQL step.
- **R5 Free-tier ceilings.** Resend 100 mails/day shared by dev and prod (a dev test burst can starve production reminders: keep dev
  testing small, or use a smaller dev volume); Supabase Free projects pause after 7 days of inactivity (dev may pause; production must not:
  the nightly dump and cron keep it active, but this is unverified) and have no point-in-time recovery (our dump is the only backup);
  Cloudflare Workers Free: 100,000 requests/day.
- **R6 GitHub minutes** (2,000/month private): about 10 minutes per verify run.
- **R7 Silent backup failure.** GitHub e-mails failed scheduled runs, but a workflow that never runs sends nothing. The runbook has a
  weekly 30-second check (newest object in `daily/`).
- **R8 Supabase key model.** New projects expose `sb_publishable_`/`sb_secret_` keys next to the legacy JWT keys. `dispatch-notifications`
  compares against `SUPABASE_SERVICE_ROLE_KEY` and `create-shop.mjs` sends it as a bearer; spike S4 checks what the hosted project injects.
- **R9 Restoring `auth` data.** `auth.users` has internal triggers and hashes; the restore into dev is exactly where problems show up (that
  is the point of the drill).

## 8. Open questions (for the orchestrator / user)

1. Dev web shop addressing with `SHOP_URL_TEMPLATE`: e-mail links must open `<dev worker>/<path>?shop=<slug>`, but `buildShopUrl` appends
   the path after the whole template, so a template with a query string would produce `...?shop=demo/reset-password`. Proposal (plan 1,
   TDD): `buildShopUrl` inserts the path before the template's query string. Production and local templates are unchanged. Confirm.
2. Dev test business: slug name (proposal `demo`) and who creates it (proposal: the user runs `create-shop.mjs` once against dev).
3. Access allow-list: which e-mail addresses besides `zencpro.admin@gmail.com`?
4. Should `zencpro.com` redirect somewhere (to `.com.br`)? Out of scope here unless the user wants it.
5. Branch protection: require `verify` on PRs to `main`? Proposed yes (setting in the checklist).
6. After the first real business, a second restore drill on real data: schedule it? Proposed: yes, the week after the first business goes live.

## 9. Decisions in this document that are mine, not the user's

- D1 `DISPATCH_TOKEN` plus `verify_jwt = false` for `dispatch-notifications` instead of putting the service-role key in Vault/GitHub.
- D2 The dispatch trigger is a new migration `0083` using `pg_cron`+`pg_net`+Vault (nothing triggered the function before).
- D3 `verify.yml` runs on `pull_request` and `workflow_call` only (no duplicate run on push).
- D4 A reusable workflow `.github/workflows/deploy-env.yml` shared by dev and production.
- D5 A separate GitHub Environment `backup` (no reviewer) so the nightly job is not blocked by the production approval.
- D6 R2 lifecycle rules do the 30 daily / 12 monthly retention (no pruning code); monthly copy made by the job on day 1.
- D7 Worker names `zenc-web-dev` and `zenc-web`; bucket name `zenc-backups`; backup time 05:00 UTC.
- D8 Source maps are uploaded to Sentry and then deleted from the published bundle.
- D9 `[remotes.dev]`/`[remotes.prod]` blocks in `config.toml` carry the per-environment auth config.
- D10 pg_dump goes through the session pooler string (IPv4 runners), not the direct host.
