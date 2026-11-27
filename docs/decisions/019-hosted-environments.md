# Decision 019: Hosted environments, deploy flow and backups (0.5)

Date: 2026-11-26
Status: accepted (the flow is built; nothing has been deployed yet)

## Context

0.5 is the first release on the internet: web/PWA only, no store builds. Until now everything ran locally. The owner chose a
free-tier stack and a flow with one approval to reach production. Design: `docs/superpowers/specs/2026-11-26-deploy-05-design.md`;
plans: `docs/superpowers/plans/2026-11-26-deploy-{1-dev,2-prod,3-backups}.md`.

## Decision

- **Identity:** every account is owned by `zencpro.admin@gmail.com` with 2FA; the domain addresses (`contato@`, `privacidade@`) only
  forward to it.
- **Flow A, one branch:** every merge to `main` runs `verify` (clean-database pgTAP included) and deploys to **dev** (`zenc-dev` +
  Worker `zenc-web-dev` on workers.dev behind Cloudflare Access). **Production** is the same commit promoted through the GitHub
  Environment `production` with the owner as required reviewer (`zenc-prod` + Worker `zenc-web` on `zencpro.app` and `*.zencpro.app`).
  No `develop` branch. The web bundle is rebuilt per environment because Expo inlines `EXPO_PUBLIC_*`.
- **Hosting:** Cloudflare Workers static assets with SPA fallback; production uses Workers Routes plus proxied DNS because Custom
  Domains cannot be wildcards. One Worker script is not needed (spike S1 passed locally).
- **Per-environment Supabase config** lives in `[remotes.dev]` and `[remotes.prod]` of `supabase/config.toml`; the workflow refuses to
  push when the project has no block or a placeholder is left, because `config push` would otherwise send the local values.
- **Scheduled dispatch:** `pg_cron` only enqueued notifications; migration `0083` adds a per-minute job (pg_net + Vault) that calls
  `dispatch-notifications` with a dedicated `DISPATCH_TOKEN`, so the service-role key never sits in Vault or GitHub.
- **Sentry:** errors only, EU region, scrubbed (no e-mail, no user, no query strings, no bodies), `environment` tag dev/production;
  functions use a dependency-free envelope client (the Deno SDK needs a newer Deno than the Supabase runtime reports); source maps go to
  Sentry from CI and are not published.
- **Migrations are append-only from the first hosted deploy** (decision 018): never rewrite an applied file, never `db reset` a hosted
  project, never `db push --include-seed`.
- **Least privilege:** secrets are pasted by the owner into GitHub environments (`dev`, `production`, `backup`), Supabase function
  secrets or Cloudflare; CI holds no function secrets; no connector with write access to production.
- **Backups (plan 3):** nightly encrypted dump of `zenc-prod` to Cloudflare R2 (30 daily, 12 monthly), key held only by the owner,
  restore runbook proven on `zenc-dev`. Avatar files (Supabase Storage) are not in the dump: a known gap for 0.5.

## Consequences

- Nothing reaches production without the owner's approval; dev receives every merge, so a broken merge breaks dev first.
- A restore replaces everything written after the dump (Supabase Free has no point-in-time recovery).
- Free-tier limits are shared or small: Resend 100 e-mails/day across dev and production, 2,000 GitHub Actions minutes per month for a
  private repository (each `verify` costs about 10), Supabase Free projects pause when idle (production is kept active by cron).
