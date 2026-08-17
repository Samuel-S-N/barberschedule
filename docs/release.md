# Release checklist

## Required environment

Configure these values in the deployment platform, never in source control:

- App: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Edge Function: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `EXPO_ACCESS_TOKEN`

## Local checks

```bash
HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase db reset --local
HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify
npm run test:e2e:web
npm run export:web
```

`pg_cron` jobs are registered by migration `0022` when the extension is available. Otherwise schedule `enqueue_notification_reminders()` every 15 minutes and `materialize_recurrence_job()` hourly through the deployment scheduler.

## EAS

`development` is an internal development-client build, `preview` is an internal Android APK, and `production` is intentionally empty until real EAS credentials and store metadata are configured. This repository does not claim store readiness.

Before handoff, run the clean reset, `npm run verify`, Web E2E, and static export. Record the output with the release artifact; do not deploy an Edge Function without setting its service-role secret in the backend environment.
