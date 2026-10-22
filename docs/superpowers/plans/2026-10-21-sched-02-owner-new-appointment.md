# Owner New Appointment as Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner's "Novo agendamento" becomes **Cliente › Serviço › Data › Horário › Revisão › Confirmar** with the step bar on top, using the shared Date/Time steps.

**Architecture:** The route `app/(owner)/appointment-form.tsx` keeps its data loading and gains a local step trail; the Date and Time steps are the shared `DateStep`/`TimeStep`; the review holds the summary, the notes field and the create button. The agenda shows a "created" toast via a param.

**Tech Stack:** Expo Router, React Query, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-scheduling-standard-design.md`

## Global Constraints
- Branch `feat-owner-booking-steps` from `feat-conflict-steps` (needs the shared steps); PR base `main`, merge after the conflict PR. No database/API change (`bookOwnerAppointment` reused).
- Test ids: `owner-customer-search`, `owner-customer-<id>` (a row), `owner-service-<id>`, `owner-continue` (Date and Time steps), `owner-summary`, `owner-form-notes`, `owner-form-create`; step bar `step-*`.
- Steps `customer, service, date, time, review, confirm`; labels Cliente/Serviço/Data/Horário/Revisão/Confirmar (en Customer/Service/Date/Time/Review/Confirm) in `owner.appointmentForm.steps`; step text uses `book.stepOf`.
- Route unchanged (`/appointment-form`, parent `/agenda`). The agenda reads `created` and shows `owner.appointmentForm.created`.
- Verify at 375px; Expo restart before e2e; commit trailer; CI watched; the user merges.

---

### Task 1: E2E first, then the flow

**Files:** Modify `app/(owner)/appointment-form.tsx`, `app/(owner)/agenda.tsx`, `src/i18n/locales/{en,pt,es}.ts`, `tests/e2e/owner-appointment-form.web.spec.ts`.

- [ ] **Step 1: Failing e2e** — update `owner-appointment-form.web.spec.ts` (keep its mocks): "Step 1 of 6 · Customer" with the search field and rows; filtering by the search narrows the rows; tapping `owner-customer-<id>` goes to "Step 2 of 6 · Service" (rows `owner-service-<id>`, labelled "Barber · Service"); tapping one goes to "Step 3 of 6 · Date" (calendar, `owner-continue`) → "Step 4 of 6 · Time" (times, Continue disabled until picked) → "Step 5 of 6 · Review" with `owner-summary` (customer, barber · service, date, time), `owner-form-notes` and `owner-form-create`; create sends `book_owner_appointment` (the existing payload: service, customer, notes, `starts_at`) and lands on `/agenda` showing "Appointment created."; back steps back and a finished step is tappable; a failing create returns to the Time step with the error and refetched times; **no** typed date field and **no** "Load times" button remain. Run (Expo restarted) → FAIL.
- [ ] **Step 2: Implement.** In `appointment-form.tsx` keep the catalog query, `choices`, filtering; replace the form body by the step trail (`type Step = "customer" | "service" | "date" | "time" | "review"`), `StepBar` (`FLOW` with `confirm` last), `ScreenHeader` back (back one step; first step → `back()`), and:
  - customer step: the search `Input` + a list of pressable rows (use the `RadioBlock` item style with `testID`s `owner-customer-<id>`), a tap selects and `go("service")`;
  - service step: rows `owner-service-<id>` ("Barber · Service"), a tap selects (clears date/time) and `go("date")`;
  - date step: `<DateStep … testID="owner-continue">`; time step: `<TimeStep … testID="owner-continue">` using the chosen barber service's `barberId`/`id`;
  - review: a summary card (rows customer / barber / service / date / time from the choices), the notes `Input`, `Button` create. The create mutation: on success `queryClient.invalidateQueries(["owner-agenda"])` and `router.navigate({ pathname: "/agenda", params: { created: "1" } })`; on error: toast, `setSelectedStartsAt(null)`, trail cut back to `time`, `invalidateQueries(["available-slots"])`.
  Agenda: `useLocalSearchParams<{ created?: string }>()`; when `created`, `setFeedback({ message: t("owner.appointmentForm.created"), variant: "success" })` once and `router.setParams({ created: undefined })`.
  Strings: `owner.appointmentForm.steps`, `…dateTitle`/`timeTitle`/`reviewTitle`/`customerTitle`/`serviceTitle` as needed (en "Choose the customer" / "Choose the service" / "Choose the date" / "Choose the time" / "Review the appointment"; pt "Escolha o cliente" / "Escolha o serviço" / "Escolha a data" / "Escolha o horário" / "Revise o agendamento"; es "Elige el cliente" / "Elige el servicio" / "Elige la fecha" / "Elige la hora" / "Revisa la cita"); remove the strings of the deleted controls (`loadTimes`, and `common.localDate` only if unused elsewhere — it is used by the schedule screens, keep it).
- [ ] **Step 3: Verify** — typecheck, lint, jest; restart Expo; `npx playwright test tests/e2e/owner-appointment-form.web.spec.ts tests/e2e/owner-agenda.web.spec.ts tests/e2e/owner-shell.web.spec.ts tests/e2e/back-navigation.web.spec.ts` → PASS; 375px screenshots (customer step, date, review).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: owner new appointment follows the booking steps"`

### Task 2: Review, push, PR, CI (as in the previous plan; PR base `main`).
