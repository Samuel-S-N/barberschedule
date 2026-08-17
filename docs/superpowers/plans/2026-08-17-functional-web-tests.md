# Functional Web Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing Playwright Web E2E suite with the approved authentication, customer, owner, schedule, and recurrence journeys.

**Architecture:** Extend the current spec files with deterministic Supabase REST interceptions. Each test verifies visible UI feedback and the relevant auth/RPC request; Jest and pgTAP remain responsible for backend rules. No shared fixture layer or new dependency is introduced.

**Tech Stack:** TypeScript, Expo Router Web, Playwright, Supabase REST/Auth responses, Jest, Supabase CLI/pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-17-functional-tests-design.md`

**Integration note:** the workspace has no `.git` metadata, so the commit steps
were not executable; changes remain in the current workspace for handoff.

## Global Constraints

- Use the existing Playwright setup in `playwright.config.ts` and `scripts/run-e2e-web.mjs`.
- Keep Supabase Web E2E deterministic with host-agnostic Auth/REST interceptions.
- Assert accessible roles, labels, placeholders, and existing test IDs instead of CSS selectors.
- Assert visible feedback plus the relevant RPC/Auth request payload.
- Keep database authorization, concurrency, availability, lifecycle, timezone, recurrence materialization, and notifications in Jest/pgTAP suites.
- Do not add dependencies, mobile E2E, real Supabase E2E fixtures, or shared abstractions.
- Preserve all existing tests and scripts.
- Keep `scripts/run-e2e-web.mjs` deterministic by disabling dotenv loading and
  clearing the Expo/Metro cache before Playwright starts.

### Task 1: Cover authenticated login and role routing

**Files:**
- Modify: `tests/e2e/auth.web.spec.ts`

**Interfaces:**
- Consumes: `/login`, `signInWithPassword`, Supabase Auth token response, and `get_current_profile` response.
- Produces: Playwright proof that customer and owner credentials result in the correct signed-in landing content and request payload.

- [x] **Step 1: Write the failing customer-login test**

Add a test named `a customer can sign in and reach customer links`. Intercept the password grant, capture `request.postDataJSON()`, return a valid session with user id `customer-user-1`, and return `{ role: "customer", user_id: "customer-user-1" }` from `rpc/get_current_profile`.

```ts
test("a customer can sign in and reach customer links", async ({ page }) => {
  let signInPayload: Record<string, unknown> | null = null;

  await page.route("https://example.supabase.co/auth/v1/token?grant_type=password", async (route) => {
    signInPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      body: JSON.stringify({
        access_token: "customer-access-token",
        expires_in: 3600,
        refresh_token: "customer-refresh-token",
        token_type: "bearer",
        user: { id: "customer-user-1" },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("https://example.supabase.co/rest/v1/rpc/get_current_profile", async (route) => {
    await route.fulfill({
      body: JSON.stringify([{ full_name: "Browser Customer", role: "customer", user_id: "customer-user-1" }]),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("customer@example.test");
  await page.getByPlaceholder("Password").fill("correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as customer.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book an appointment" })).toBeVisible();
  expect(signInPayload).toEqual({ email: "customer@example.test", password: "correct-password" });
});
```

- [x] **Step 2: Run the focused test and verify the current gap**

Run: `npx playwright test tests/e2e/auth.web.spec.ts --config=playwright.config.ts`

Expected: the new test fails before the implementation of the test harness is complete, or passes if the current app already satisfies the flow; in either case record the actual failure before changing the test.

- [x] **Step 3: Add the owner-login assertion**

Add `an owner can sign in and see owner links` using the same Auth response shape with user id `owner-user-1`, a profile response with role `owner`, and these assertions:

```ts
await expect(page.getByText("Signed in as owner.")).toBeVisible();
await expect(page.getByRole("link", { name: "Manage agenda" })).toBeVisible();
await expect(page.getByRole("link", { name: "Manage schedule" })).toBeVisible();
await expect(page.getByRole("link", { name: "Book an appointment" })).not.toBeVisible();
```

- [x] **Step 4: Run the focused auth and smoke tests**

Run: `npx playwright test tests/e2e/auth.web.spec.ts tests/e2e/smoke.spec.ts --config=playwright.config.ts`

Expected: all password-reset, login, and anonymous-route tests pass.

- [x] **Step 5: Commit the focused change when repository metadata is available**

Run: `git add tests/e2e/auth.web.spec.ts && git commit -m "test: cover web authentication flows"`

Expected: one commit is created. The current workspace has no `.git`, so this step must be reported as unavailable rather than replaced with destructive repository setup.

### Task 2: Cover customer booking failures and appointment lifecycle UI

**Files:**
- Modify: `tests/e2e/booking.web.spec.ts`
- Modify: `tests/e2e/customer-lifecycle.web.spec.ts`

**Interfaces:**
- Consumes: existing customer token/profile setup, public catalog routes, `get_available_slots`, `book_appointment`, `cancel_appointment`, `reschedule_appointment`, and customer appointment reads.
- Produces: proof that booking failure is visible and that customer cancellation, rescheduling, list, and history journeys call the correct endpoints.

- [x] **Step 1: Write the failing booking-error test**

Add `a customer sees an unavailable error when booking loses the slot` by copying the existing successful booking route setup only for the required public catalog/customer responses. Return HTTP `409` with `{ code: "23P01", message: "overlap" }` for `rpc/book_appointment` and capture its request body.

```ts
if (url.pathname.endsWith("/rpc/book_appointment")) {
  bookingPayload = request.postDataJSON() as Record<string, unknown>;
  await route.fulfill({
    body: JSON.stringify({ code: "23P01", message: "overlap" }),
    contentType: "application/json",
    status: 409,
  });
  return;
}
```

Complete the same booking wizard, click `Confirm booking`, and assert:

```ts
await expect(page.getByText("That time is no longer available.")).toBeVisible();
await expect(page.getByText("Booking confirmed.")).not.toBeVisible();
expect(bookingPayload).toMatchObject({ customer_id: customerId, source: "customer" });
```

- [x] **Step 2: Run the focused booking spec and verify the failure**

Run: `npx playwright test tests/e2e/booking.web.spec.ts --config=playwright.config.ts`

Expected: the new scenario exposes any missing mock response or incorrect visible error before the final suite run.

- [x] **Step 3: Add customer cancellation coverage**

Add a test in `booking.web.spec.ts` with the existing authenticated customer setup. Return one scheduled appointment from `/appointments`, return the appointment with `status: "cancelled"` from `rpc/cancel_appointment`, and capture the RPC input.

```ts
if (url.pathname.endsWith("/rpc/cancel_appointment")) {
  cancelPayload = request.postDataJSON() as Record<string, unknown>;
  cancelled = true;
  await json([{ ...appointment, status: "cancelled" }]);
  return;
}

if (url.pathname.endsWith("/appointments")) {
  await json(cancelled ? [] : [appointment]);
  return;
}
```

After clicking `Cancel appointment`, assert `cancelPayload` equals `{ appointment_id: "appointment-1" }` and assert that the refreshed list no longer displays the scheduled appointment. Declare `let cancelled = false` before registering the route.

- [x] **Step 4: Add appointment-list and history assertions**

Extend `customer-lifecycle.web.spec.ts` with separate tests for `/appointments` and `/history`. Mock `/appointments` with a scheduled row and assert its service text; mock the same resource with the `in` query for history and return a completed row, then assert:

```ts
await expect(page.getByRole("heading", { name: "Appointment history" })).toBeVisible();
await expect(page.getByText("Browser Cut · completed")).toBeVisible();
```

- [x] **Step 5: Run focused customer tests**

Run: `npx playwright test tests/e2e/booking.web.spec.ts tests/e2e/customer-lifecycle.web.spec.ts --config=playwright.config.ts`

Expected: booking success/error, role redirect, rescheduling, cancellation, appointment list, profile, and history tests pass.

- [x] **Step 6: Commit the focused change when repository metadata is available**

Run: `git add tests/e2e/booking.web.spec.ts tests/e2e/customer-lifecycle.web.spec.ts && git commit -m "test: cover customer appointment journeys"`

Expected: one commit is created, or the missing `.git` condition is reported.

### Task 3: Cover owner appointment status transitions

**Files:**
- Modify: `tests/e2e/owner-agenda.web.spec.ts`

**Interfaces:**
- Consumes: existing owner agenda mock, `set_owner_appointment_status`, `cancel_appointment`, and agenda refresh responses.
- Produces: proof that owner status controls call the correct endpoint and show the updated appointment state.

- [x] **Step 1: Write the failing status-transition test**

Add `an owner can mark an appointment as no-show or cancelled`. Return two scheduled agenda rows with distinct ids. Capture status RPC bodies and cancellation bodies. Return a `no_show` row from `set_owner_appointment_status`; return a cancelled row from `cancel_appointment`.

```ts
await page.getByRole("button", { name: "No-show" }).first().click();
await expect(page.getByText("no_show")).toBeVisible();
expect(statusPayload).toEqual({ appointment_id: "appointment-no-show", new_status: "no_show" });

await page.getByRole("button", { name: "Cancel" }).click();
await expect(page.getByText("cancelled")).toBeVisible();
expect(cancelPayload).toEqual({ appointment_id: "appointment-cancelled" });
```

The route mock must return the updated rows on the subsequent agenda refresh so the visible status assertion reflects the UI's actual refresh behavior.

- [x] **Step 2: Run the owner agenda spec**

Run: `npx playwright test tests/e2e/owner-agenda.web.spec.ts --config=playwright.config.ts`

Expected: the existing manual-booking/agenda test and the new `no_show`/cancel test pass.

- [x] **Step 3: Verify request and view assertions**

Confirm the existing test still checks day/week/month range labels, owner booking payload `source: "owner"`, and `Appointment created.`. Do not replace it with the new status test.

- [x] **Step 4: Commit the focused change when repository metadata is available**

Run: `git add tests/e2e/owner-agenda.web.spec.ts && git commit -m "test: cover owner appointment statuses"`

Expected: one commit is created, or the missing `.git` condition is reported.

### Task 4: Cover recurrence mutations and conflict action

**Files:**
- Modify: `tests/e2e/recurrence.web.spec.ts`

**Interfaces:**
- Consumes: `/monthly-customers`, existing recurrence series response, `edit_recurrence_series`, `cancel_recurrence_occurrence`, `end_recurrence_series`, `ensure_recurrence_window`, and recurrence conflict listing.
- Produces: proof that the owner UI sends the correct mutation payloads and reflects update/cancel/end state after refresh.

- [x] **Step 1: Write the failing recurrence-mutation test**

Add route branches backed by a mutable `series` object. The list RPC returns `[series]`; edit returns the updated series; cancellation returns HTTP 204 with an empty body; end returns the series with `active: false` and `ended_at` set.

```ts
if (path.endsWith("/rpc/edit_recurrence_series")) {
  const payload = request.postDataJSON() as Record<string, unknown>;
  editPayload = payload;
  series = { ...series, interval_weeks: 5, local_start_time: "10:00:00", special_price_cents: 4000 };
  return json([series]);
}

if (path.endsWith("/rpc/cancel_recurrence_occurrence")) {
  cancelOccurrencePayload = request.postDataJSON() as Record<string, unknown>;
  return route.fulfill({ body: "", status: 204 });
}

if (path.endsWith("/rpc/end_recurrence_series")) {
  endPayload = request.postDataJSON() as Record<string, unknown>;
  series = { ...series, active: false, ended_at: "2026-08-17T12:00:00Z" };
  return json([series]);
}
```

Open `monthly-customers`, click `Edit`, change `Every N weeks` to `5`, local time to `10:00`, and special price to `4000`; save and assert `Recurring booking updated.` plus the exact edit payload. Fill `Occurrence date`, click `Cancel occurrence`, assert its series/date payload, and assert `Unable to update recurring booking.` is not visible. Click `End series` and assert the series becomes inactive after refresh.

- [x] **Step 2: Run the recurrence spec and verify the mutation assertions**

Run: `npx playwright test tests/e2e/recurrence.web.spec.ts --config=playwright.config.ts`

Expected: creation, edit, occurrence cancellation, series ending, conflict listing, and WhatsApp button tests pass.

- [x] **Step 3: Preserve the existing conflict action coverage**

Keep the existing `list_owner_recurrence_conflicts` response and assert `Open WhatsApp` remains visible. Do not attempt to launch an external WhatsApp application from Playwright.

- [x] **Step 4: Commit the focused change when repository metadata is available**

Run: `git add tests/e2e/recurrence.web.spec.ts && git commit -m "test: cover recurrence mutations"`

Expected: one commit is created, or the missing `.git` condition is reported.

### Task 5: Document coverage and run the complete verification gate

**Files:**
- Modify: `docs/testing.md`
- Modify: `scripts/run-e2e-web.mjs`

**Interfaces:**
- Consumes: focused Playwright commands and the existing project verification scripts.
- Produces: documented functional coverage and reproducible final verification.

- [x] **Step 1: Update the testing document**

Add a `Web functional coverage` section stating that Playwright covers anonymous/authenticated routing, customer booking/error/lifecycle, owner agenda/manual booking/status, schedule mutation, and recurrence mutation/conflicts. State that REST is mocked for Web E2E and pgTAP/Jest cover backend rules.

Use host-agnostic Playwright route patterns (`**/auth/v1/**` and `**/rest/v1/**`) in the E2E specs. Expo can compile a developer's `.env.local` Supabase URL into the Web bundle, so mocks must match the API path without assuming a specific host. The runner disables dotenv loading and starts Expo with `--clear` so the bundle does not retain a stale local URL.

- [x] **Step 2: Add the focused command**

Document:

```bash
npx playwright test tests/e2e/auth.web.spec.ts tests/e2e/booking.web.spec.ts tests/e2e/customer-lifecycle.web.spec.ts tests/e2e/owner-agenda.web.spec.ts tests/e2e/recurrence.web.spec.ts tests/e2e/schedule.spec.ts tests/e2e/smoke.spec.ts --config=playwright.config.ts
```

- [x] **Step 3: Run the project gates**

Run:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:e2e:runner
npm run test:e2e:web
npm run test:db
npm run export:web
```

Expected: every command exits successfully; the Web suite includes the existing tests plus the new functional scenarios.

- [x] **Step 4: Commit documentation and final test changes when repository metadata is available**

Run: `git add tests/e2e scripts/run-e2e-web.mjs docs/testing.md && git commit -m "test: expand functional web coverage"`

Expected: one final commit is created, or the missing `.git` condition is reported without initializing or rewriting repository history.
