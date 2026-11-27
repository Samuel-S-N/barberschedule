# Testing

The persistent baseline gate for the Zenc MVP (also what CI runs, with typecheck, lint, the Node runner tests and pgTAP):

- `npm run typecheck`
- `npm run lint`
- `npm test -- --runInBand`
- `npm run test:db`

Every later task must rerun the accumulated suite before it is considered complete.

Example of focused checks (notifications):

- `npm test -- --runInBand tests/integration/notifications.test.ts`
- `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/009_notifications.sql`

Not in CI: the Playwright web suite. A green PR check says nothing about it, so run it on the merged result before
calling a change done (see "Running the whole suite without the Metro dev server" below).

Gotchas that cost time before:

- The full Jest run takes about 5 minutes; give it a timeout above 6 minutes or run it in the background. It ends with a
  harmless "Jest did not exit one second after the test run" notice.
- React Native Testing Library 14 renders asynchronously (`await render(...)`); a test `QueryClient` needs `gcTime: 0`
  or Jest hangs on open timers.
- After `supabase db reset`, recreate the dev accounts with `supabase/dev-owner.sql` and `supabase/dev-professional.sql`.
  While they exist `010_full_rls.sql` fails on seed counts; that is local data, not a defect.
- The local stack uses `project_id = "zenc"` (containers `supabase_*_zenc`, API port 55421, DB port 55422).
- `npm run lint` at the root also lints `.e2e-dist` after an e2e export; delete the folder or lint with
  `npx eslint app src tests scripts`.

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

### Trying the owner setup checklist with the dev owner account

New shops start closed. To see the checklist with `owner@teste.com` (local database only, never `supabase db reset`), run in the
local database (for example `docker exec supabase_db_zenc psql -U postgres -c "..."`):

```sql
-- close the dev owner's shop and forget the business agreement, so the checklist starts from the top
update public.shops set setup_completed_at = null where owner_user_id = (select id from auth.users where email = 'owner@teste.com');
delete from public.consents where kind = 'business' and user_id = (select id from auth.users where email = 'owner@teste.com');
```

Undo it (the owner's shop is open again; the agreement is asked once by the re-accept gate):

```sql
update public.shops set setup_completed_at = now() where owner_user_id = (select id from auth.users where email = 'owner@teste.com');
```

The account keeps its hours, services and professionals, so only the agreement and the final "Abrir minha agenda" are pending; delete
some of them to see the other steps. Visitors on that shop's address see "Em breve" while it is closed.

### E-mails locally

Account e-mails (confirmation, recovery, e-mail change, invite) are visible in the local Supabase mailbox
(`http://127.0.0.1:55424`; its API lists them at `/api/v1/messages`). The templates in `supabase/templates/` are read when the stack
starts, so after editing one run `npx supabase stop` and `npx supabase start` (keeps the database; never `db reset`). With e-mail
confirmations off locally, signup sends no confirmation: create an unconfirmed user through the admin API
(`email_confirm: false`) and call `POST /auth/v1/resend` with `type: "signup"`.

The 24 h reminder e-mail needs `RESEND_API_KEY` and `EMAIL_FROM` for `dispatch-notifications` (Resend has no local sandbox) and the
Edge runtime is off in `config.toml`, so locally read the outbox instead:
`select payload from notification_outbox where event_type = 'appointment.reminder_email'` after
`select public.enqueue_notification_reminders();`. The builder and the Resend client are covered by Jest (`reminder-email`, `resend`,
`dispatch`).

**The e-mail logo.** Every e-mail shows the wordmark as an image, `https://zencpro.app/email/zenc-logo.png` (an absolute URL, as mail
clients require), which is `public/email/zenc-logo.png`: the web export copies `public/` as it is, so each deploy serves it, and as a
real file it is served before the shop routing (the e2e checks it on a shop address and on the bare domain). **Locally the image does
not load in the mailbox** (`http://127.0.0.1:55424`) until the web app is deployed at that domain: that is expected, and the styled
alt text "ZENC." shows instead. To see an e-mail with the image, open its HTML with the `src` pointed at the local file. To
regenerate the PNG (Oswald Bold, ink `#171412`, the period drawn as a wine `#7A1F2B` circle, transparent, 2x of 119 x 48):
`node scripts/render-email-logo.mjs`.

## Fake passwords in tests (secret scanners)

GitGuardian flags literals that look like passwords next to a password key (`{ password: "brand-new-1" }`), even fake ones. Its PR
check scans every commit of the PR, so a flagged literal keeps the check red until someone marks it a false positive. Scanning stays
on for every path; write tests so they do not trip it:

- keep a fixture password in a named constant without "password" in its name (`const CHOSEN = "brand-new-1";`) and use the
  constant everywhere, including in assertions (`{ password: CHOSEN }`);
- never use a real password, key or token in a test;
- if a fake one is flagged anyway, mark that incident "false positive" in the GitGuardian check; do not disable scanning for paths.

