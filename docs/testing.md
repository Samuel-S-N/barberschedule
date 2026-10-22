# Testing

Task 1 establishes the persistent baseline gate for the Barberschedule MVP:

- `npm run typecheck`
- `npm run lint`
- `npm test -- --runInBand`
- `npm run test:db`

Every later task must rerun the accumulated suite before it is considered complete.

Task 10 focused checks:

- `npm test -- --runInBand tests/integration/notifications.test.ts`
- `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/009_notifications.sql`

Final handoff gate:

- `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase db reset --local`
- `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify`
- `npm run test:e2e:web`
- `npm run export:web`

The acceptance matrix covers customer daily limits, owner override, exact 90-minute lifecycle boundaries, atomic reschedule rollback, occupancy exclusion, timezone-local dates, recurrence idempotence/conflicts, RLS isolation, and push-failure isolation.

## Web functional coverage

The Playwright suite exercises the visible Expo Web journeys with deterministic
Supabase Auth/REST interceptions. It covers authentication and role routing,
customer booking failures/cancellation/history, owner agenda status changes,
schedule mutations, and recurring-series create/edit/cancel/end/conflict
flows. Unexpected REST requests abort the test so missing contracts fail
loudly.

Run the focused browser suite with:

```bash
npm run test:e2e:web
```

With Expo Web already running, the individual specs can be selected with:

```bash
npx playwright test tests/e2e/auth.web.spec.ts tests/e2e/booking.web.spec.ts tests/e2e/customer-lifecycle.web.spec.ts tests/e2e/owner-agenda.web.spec.ts tests/e2e/recurrence.web.spec.ts tests/e2e/schedule.spec.ts tests/e2e/smoke.spec.ts --config=playwright.config.ts
```

The runner disables dotenv loading and clears the Expo/Metro cache so the
mocked Supabase host remains deterministic. Jest and pgTAP continue to cover
backend rules, authorization, concurrency, availability, and materialization.

### Running the whole suite without the Metro dev server

`expo start --web` (what `test:e2e:web` uses) keeps growing in memory with every page load: during a full run its
process went from about 3.5 GB to about 7.3 GB and died with `JavaScript heap out of memory` after roughly 180 tests,
which makes the late specs fail with instant `ERR_CONNECTION_REFUSED`/timeouts. For the full suite, build the web
bundle once and serve it as static files instead (about 30 s to build; the whole suite then runs in about a minute and
the server stays near 120 MB):

```bash
npm run e2e:export                       # builds .e2e-dist with the mocked Supabase host
npm run e2e:serve &                      # serves it on http://127.0.0.1:4173 (SPA fallback for dynamic routes)
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test
```

Rebuild with `npm run e2e:export` after any source change; the static server does not reload. Move `.env.local` aside
only if you use the Metro-based runner; the export ignores dotenv files.
