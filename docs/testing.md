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
