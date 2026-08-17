# Functional Web Tests Design

**Date:** 2026-08-17  
**Status:** Approved

## Goal

Expand the existing Playwright Web E2E suite so the critical customer, owner,
authentication, schedule, and recurrence journeys are exercised through the
visible UI and their Supabase RPC boundaries.

## Approach

Extend the existing spec files and reuse their current deterministic REST
interception pattern. Playwright tests will remain fast and isolated by
mocking Supabase responses. Jest/integration and pgTAP suites remain the source
of truth for database authorization, concurrency, availability, lifecycle,
timezone, recurrence materialization, and notification rules.

Do not add a new test framework, browser fixture layer, database fixture
system, or shared abstraction until duplication demonstrably prevents adding
the scenarios below.

## Functional coverage

### Authentication and routing

- An anonymous visitor is redirected to sign-in.
- A visitor can request a password reset.
- A customer can sign in and reach the customer profile/appointment routes.
- An owner can sign in and reach the owner routes.
- An owner is redirected away from the customer booking flow.

### Customer journey

- An authenticated customer selects shop, barber, service, local date, and
  available time, then confirms a booking.
- The booking request sends the selected customer and `source: "customer"`.
- An unavailable/failed booking displays the user-facing error and does not
  claim success.
- A customer sees their appointment history/list.
- A customer can reschedule an appointment and receives confirmation.
- A customer can cancel an appointment and receives confirmation.

### Owner journey

- An owner loads the agenda and can switch between day, week, and month views.
- An owner creates a manual appointment using an existing customer,
  barber-service, local date, and available time.
- Manual booking sends `source: "owner"`.
- An owner can mark an appointment `completed`, `no_show`, or `cancelled` and
  sees the corresponding feedback.

### Schedule and recurrence

- An owner creates and removes a working period and dated override.
- An owner creates a recurring booking and sees its saved state.
- An owner edits the recurring configuration and sees the update feedback.
- An owner cancels one occurrence without ending the series.
- An owner ends a recurring series and sees the resulting feedback.
- An owner opens recurrence conflicts and can use the existing WhatsApp action.

## File ownership

- `tests/e2e/auth.web.spec.ts`: sign-in and password-reset journeys.
- `tests/e2e/booking.web.spec.ts`: customer booking, booking failure,
  cancellation, rescheduling, and role redirect.
- `tests/e2e/customer-lifecycle.web.spec.ts`: profile, appointment list, and
  history navigation where the existing screen flow belongs there.
- `tests/e2e/owner-agenda.web.spec.ts`: agenda, manual booking, and owner
  appointment status transitions.
- `tests/e2e/recurrence.web.spec.ts`: recurring-series mutations and conflict
  inspection.
- `tests/e2e/schedule.spec.ts`: existing schedule mutation coverage.
- `tests/e2e/smoke.spec.ts`: anonymous route guard.
- `scripts/run-e2e-web.mjs`: deterministic Expo Web environment for the suite.
- `docs/testing.md`: commands and the updated functional coverage summary.

Existing integration and SQL test files are not changed unless a missing
backend contract is discovered while wiring an approved UI scenario.

## Test design rules

- Use accessible roles, labels, placeholders, and existing test IDs instead of
  CSS selectors.
- Assert both visible feedback and the relevant RPC payload or request.
- Keep each test focused on one journey; do not add a broad end-to-end fixture
  that spans unrelated personas.
- Use fixed IDs and deterministic response payloads already used by the suite.
- Abort unexpected REST requests so missing route behavior fails loudly.
- Run Expo Web with dotenv disabled and its bundler cache cleared so local
  environment values cannot change the mocked Supabase target.
- Preserve existing tests and scripts.

## Non-goals

- No Playwright connection to a real Supabase instance.
- No replacement of pgTAP/Jest authorization or concurrency tests.
- No push-delivery UI test; notification delivery has no user-facing screen in
  the current MVP.
- No mobile-device E2E or credentialed EAS build.
- No new dependency or test abstraction layer.

## Verification

Run focused Playwright specs while implementing, then run:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:e2e:runner
npm run test:e2e:web
npm run test:db
npm run export:web
```

The final result must preserve all current tests and make the new functional
journeys pass with deterministic mocked REST responses.
