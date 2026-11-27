# Deploy spikes (run with the owner once the secrets exist)

Each spike answers one risk of `docs/superpowers/specs/2026-11-26-deploy-05-design.md` (section 7). Claude never types a secret: the
owner runs the commands that need one, in their own shell, and pastes back only the output (never a key). Record each result as one
line under "Risks" in the spec.

| Spike | Risk | Needs | Status |
|---|---|---|---|
| S1 dynamic route on Workers | R1 | nothing | **Done 2026-11-26** (local `wrangler dev`, 11 Playwright specs passed, no Worker script needed) |
| S2 `@sentry/deno` on the hosted runtime | R2 | dev project + DSN | optional: the repo ships the envelope client |
| S3 `config push` and `[remotes.dev]` | R3 | dev project ref, personal access token | to do before the first deploy |
| S4a Vault values from `db push` | R4 | dev project | checked by the first dev deploy |
| S4b key model on the hosted project | R8 | dev project | to do after the first deploy |
| S4c source maps reach Sentry | R2/Sentry | `SENTRY_AUTH_TOKEN` | checked by the first dev deploy |
| P1 what a dump contains | R9 | dev session-pooler URL | to do before the first backup (below) |

## S3: what would `config push` change? (before the first deploy; RAN 2026-11-26 against zenc-dev)

**`supabase config push` has no dry run.** In a non-interactive shell (an agent is auto-detected) it applies **without prompting** and
ignores a piped "n". To review the diff, the owner runs it in their own interactive terminal with `--agent no` and answers "n":

```bash
npx supabase login            # or a scoped token, see docs/hosted-deploy.md "Supabase access token"
npx supabase link --project-ref <DEV_REF>
npx supabase config push --project-ref <DEV_REF> --agent no     # read the diff, answer n
```

Findings of the first run (each fixed in `config.toml` or accepted):

- Fixed: `[email.smtp] enabled` would have become `false`: the hosted update was **rejected** (400, "Email template modification is not
  available for free tier projects using the default email provider"). Both `[remotes.*.auth.email.smtp]` blocks now set `enabled = true`.
- Fixed: `[auth.email] max_frequency` would have gone from the hosted `1m0s` to the local `1s`. Both remotes now set `max_frequency = "1m0s"`.
- Accepted, no override (see `docs/hosted-deploy.md` "Accepted differences"): TOTP MFA enroll/verify true to false, `otp_length` 8 to 6,
  `minimum_password_length` to 8, `sms.enable_confirmations` true.
- The token needs `infra_add_ons_read` (config push lists add-ons first; 403 otherwise): recipe in `docs/hosted-deploy.md`.

Pass criteria for a later run: the diff lists only hosted values (the workers.dev or production site URL and redirects, confirmations true,
the Resend SMTP block enabled) and no `127.0.0.1` or `localhost`.

## S4a: Vault values (after the first dev deploy)

SQL editor of `zenc-dev`: `select name from vault.decrypted_secrets order by name;` must list `dispatch_token` and `dispatch_url`
(never select the secret column). If the CLI rejected the `[remotes.dev.db.vault]` block, fall back to a one-time SQL typed by the
owner: `select vault.create_secret('https://<DEV_REF>.supabase.co/functions/v1/dispatch-notifications', 'dispatch_url'); select vault.create_secret('<DISPATCH_TOKEN>', 'dispatch_token');`.
Then wait two minutes: `select status_code, left(content, 80) from net._http_response order by id desc limit 3;` shows 200.

## S4b: key model

Supabase projects expose a legacy JWT `service_role` key and newer `sb_secret_...` keys. `dispatch-notifications` compares the bearer
with `SUPABASE_SERVICE_ROLE_KEY` as the platform injects it. Check (Dashboard > Edge Functions > Secrets lists the injected names) that
`SUPABASE_SERVICE_ROLE_KEY` exists. The cron path does not depend on it (it uses `DISPATCH_TOKEN`); `scripts/create-shop.mjs` does,
so run it once against dev with the key the Dashboard calls the service-role key. If it answers 401, use the legacy JWT key or adapt the script.

## S4c: source maps

After the first dev deploy: Sentry > Settings > Projects > `zenc-app` > Source Maps lists a release with artifacts for the web bundle
(debug IDs). Then trigger a harmless error on the dev site from a local build pointed at dev (`EXPO_PUBLIC_SENTRY_DSN` set) and check the
issue shows readable file names, tagged `dev`, with no e-mail address.

## S2 (optional): the Deno SDK

Only if the owner wants the SDK instead of `supabase/functions/_shared/monitoring.ts`. Deploy a scratch function to `zenc-dev`
that calls `Sentry.init({ dsn, defaultIntegrations: false, sendDefaultPii: false })` from `npm:@sentry/deno` and captures one
exception; pass = the event arrives and the function boots. Delete the scratch function afterwards.

## P1: what does a dump of this project really contain? (before the first backup; against zenc-dev, never production)

The owner runs it with the session-pooler string of `zenc-dev` typed only into their own shell:

```bash
read -rs DEV_DB_URL && export DEV_DB_URL
mkdir -p /tmp/zenc-p1 && cd /tmp/zenc-p1
npx supabase db dump --db-url "$DEV_DB_URL" -f roles.sql --role-only
npx supabase db dump --db-url "$DEV_DB_URL" -f schema.sql
npx supabase db dump --db-url "$DEV_DB_URL" -f data.sql --data-only --use-copy
grep -c '^COPY ' data.sql
grep -E '^COPY (auth\.users|public\.shops|public\.appointments|vault\.secrets|storage\.objects)' data.sql
```

Pass: the three dumps run (the CLI needs Docker for a matching `pg_dump`) and `COPY auth.users` and `COPY public.shops` are present. Record
whether `vault.secrets` appears (if so, the encryption matters even more), whether the dump needs the `--exclude` flags from Supabase's
own backup guide, and the time and size. If `auth.users` is missing from `data.sql`, stop: `scripts/backup.sh` must dump `auth` explicitly
(`--schema`) before the first production backup. Then `shred -u` the files and remove `/tmp/zenc-p1`.
