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

## S3: what would `config push` change? (before the first deploy)

1. Fill the placeholders in `supabase/config.toml` (`[remotes.dev]` project ref and the `REPLACE-ACCOUNT` part of the workers.dev address) and merge that.
2. In the repo, with the owner logged in (`npx supabase login`):

   ```bash
   npx supabase link --project-ref <DEV_REF>
   npx supabase config push --project-ref <DEV_REF>
   ```

3. Read the diff it prints and **answer "no"**. Pass: it lists only hosted values (the workers.dev site URL and redirect, e-mail
   confirmations true, the Resend SMTP block) and **no** `127.0.0.1` or `localhost`. Fail (the CLI ignores `[remotes.*]`): stop and
   report; the fallback is a generated `supabase/config.dev.toml` with `--workdir`.

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
