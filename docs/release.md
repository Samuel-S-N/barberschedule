# Release checklist

> **Flow (built, never run yet; see `docs/hosted-deploy.md` sections 0 to 0e):** a merge to `main` deploys to dev; production is the same commit
> approved in the GitHub Environment `production`. The 0.5 release is web/PWA only: no EAS or store build. Until the pipeline
> exists, the manual steps in `docs/hosted-deploy.md` apply.

## Required environment

Configure these values in the deployment platform (GitHub Environments and Supabase function secrets), never in source control.
The full list with names and places is the table in `docs/hosted-deploy.md` section 0. In short:

- Web build: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SHOP_BASE_DOMAIN`,
  `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, `EXPO_PUBLIC_SENTRY_DSN`
- Edge Functions: platform-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; set by us `RESEND_API_KEY`,
  `EMAIL_FROM`, `SHOP_URL_TEMPLATE`, `DISPATCH_TOKEN`, the VAPID three, `SENTRY_DSN_FUNCTIONS`, `SENTRY_ENVIRONMENT`

## Local checks

```bash
HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase db reset --local
HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify
npm run test:e2e:web
npm run export:web
```

`pg_cron` jobs are registered by migrations `0022`, `0062` and (from plan 1) `0083`; hosted Supabase has `pg_cron` and `pg_net`, so no external scheduler is needed. `0083` is what makes `dispatch-notifications` run (see `docs/hosted-deploy.md` section 5).

## Store identifiers

The app id is `com.zencpro.app` (iOS bundle identifier and Android package, see `app.json` and decision `015`). Reserve it
in App Store Connect and Google Play before the first build; changing it later is not possible once published.
Shop subdomains will be `*.zencpro.app`; the marketing site is on `zencpro.com.br`.

## EAS (later: store builds are not part of 0.5)

`development` is an internal development-client build, `preview` is an internal Android APK, and `production` is intentionally empty until real EAS credentials and store metadata are configured. This repository does not claim store readiness.

Before handoff, run the clean reset, `npm run verify`, Web E2E, and static export. Record the output with the release artifact; do not deploy an Edge Function without setting its service-role secret in the backend environment.
