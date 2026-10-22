# Shared Scheduling Steps and Conflict Reschedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Date and Time steps, generalise `RescheduleFlow`, and turn the owner's conflict "Remarcar" pop-up into the same step-by-step flow.

**Architecture:** `DateStep`/`TimeStep` live in `src/features/availability/steps.tsx`. `RescheduleFlow` gets a `submit` prop (the customer and barber screens pass `rescheduleAppointment`, the conflict screen passes `resolveRecurrenceConflict`) plus `initialDate`, `currentLabel`, `currentTitle`. A new hidden owner route `/conflict-reschedule` hosts it. The pop-up (`ConflictRescheduleSheet`) is removed.

**Tech Stack:** Expo Router, React Query, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-scheduling-standard-design.md`

## Global Constraints
- Branch `feat-conflict-steps` from `main`. No database or API change.
- Existing ids kept: customer `reschedule-*`, barber `move-*` (including `-current`, `-continue`, `-summary`, `-confirm`, `-keep`); conflict flow `conflict-*` with the same suffixes; `conflict-reschedule-<id>` stays the button on each open conflict, `conflict-dismiss-<id>` and `conflict-whatsapp-<id>` unchanged.
- `tests/unit/stale-slot-recovery.test.ts` reads `RescheduleFlow.tsx`'s `onError`/`onSuccess` handlers: keep `setStartsAt(null)` and `invalidateQueries({ queryKey: ["available-slots"] })` in them.
- New route: owner hidden tab `conflict-reschedule` (add to `MANAGE_SCREENS`), `ROUTE_PARENTS["/conflict-reschedule"] = "/recurrence-conflicts"`.
- i18n: en is the type source; es/pt match. Verify at 375px; web e2e needs `.env.local` moved aside and an Expo restart (`/tmp/claude-1000/restart.sh`; wait for it to print `up`; restore `.env.local` and the user's Metro at the end). Use `rtk`. Commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR via `gh api` REST, CI watched with one background waiter; never force-push; the user merges.

---

### Task 1: Extract the steps and generalise `RescheduleFlow` (behaviour-preserving)

**Files:** Create `src/features/availability/steps.tsx`; modify `src/features/appointments/RescheduleFlow.tsx`, `app/(customer)/reschedule.tsx`, `app/(barber)/move-appointment.tsx`.

**Produces:**
```tsx
export function DateStep(props: { children?: ReactNode; localDate: string; onChange: (date: string) => void; onContinue: () => void; testID: string; today: string }): JSX.Element
export function TimeStep(props: { barberId: string; barberServiceId: string; localDate: string; onContinue: () => void; onSelect: (startsAt: string | null) => void; startsAt: string | null; testID: string }): JSX.Element
// RescheduleFlow props: appointmentId removed; submit: (startsAt: string) => Promise<unknown>; initialDate?: string; currentLabel?: string; currentTitle?: string
```
`DateStep` renders `children` (the current card block) above the `MonthCalendar` and the Continue button. `TimeStep` renders the date line, the skeleton/error/empty states, the `TimeSlotPicker` (times as `HH:MM`) and the Continue button (disabled without `startsAt`); it owns the `useQuery(getAvailableSlotsQueryOptions…)` and resolves a picked time to its `startsAt`.

- [ ] **Step 1: Safety net.** The existing specs `reschedule-steps`, `customer-lifecycle` (reschedule), `barber-booking` (move) already cover the behaviour; run them first to see them green on `main`.
- [ ] **Step 2: Extract** `DateStep`/`TimeStep` by moving the corresponding JSX and the availability query out of `RescheduleFlow` (the file keeps the trail, the step bar, the review and the mutation). Add the new props: `submit` replaces `appointmentId`+`rescheduleAppointment`; `initialDate` (default today, clamped so it is never before today) seeds `localDate`; `currentLabel` (default `t("reschedule.currentSlot")`) labels the review's "current" row; `currentTitle` (default `t("reschedule.current")`) titles the block above the calendar.
- [ ] **Step 3: Callers.** Customer screen: `submit={(startsAt) => rescheduleAppointment(supabase, appointmentId, startsAt)}`; barber screen likewise (import `rescheduleAppointment` and `useSupabaseSession`).
- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx eslint src app && npx jest`; restart Expo; the three specs above plus `back-navigation` → PASS (nothing visible changes).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor: shared date and time steps; RescheduleFlow takes the final action as a prop"`

---

### Task 2: Conflict reschedule as steps

**Files:** Create `app/(owner)/conflict-reschedule.tsx`; modify `app/(owner)/recurrence-conflicts.tsx`, `app/(owner)/_layout.tsx`, `src/lib/navigation/parents.ts`, `src/i18n/locales/{en,pt,es}.ts`, `tests/e2e/owner-conflicts.web.spec.ts`; delete `src/features/recurrence/ConflictRescheduleSheet.tsx`.

- [ ] **Step 1: Failing e2e** — rewrite the two reschedule tests of `owner-conflicts.web.spec.ts`: clicking `conflict-reschedule-<id>` goes to `/conflict-reschedule`; "Step 1 of 4 · Date", the calendar starts on the month of the conflicted date, the block above the calendar names the customer and the conflicted occurrence, `conflict-continue` → "Step 2 of 4 · Time", the slot `11:00` is listed (mock `get_available_slots`), Continue disabled until picked → "Step 3 of 4 · Review" whose `conflict-summary` has the customer, service, "Conflicted date" and "New time" → `conflict-confirm` sends `resolve_recurrence_conflict` `{ new_starts_at, target_conflict_id }` and lands on `/recurrence-conflicts` with the toast "Rescheduled." and the card resolved; header back steps back and, from the first step, returns to the conflicts list; with no free times the Time step shows "No free times on this date." (existing key `reschedule.noTimes` text: "No times available this day") and Continue stays disabled; a failing `resolve_recurrence_conflict` returns to the Time step with the error. Run → FAIL.
- [ ] **Step 2: Route** `conflict-reschedule.tsx`: params `conflictId, barberId, barberServiceId, occurrenceDate, localStartTime, customerName, serviceName`; renders

```tsx
<RescheduleFlow
  barberId={barberId}
  barberServiceId={barberServiceId}
  current={{ localDate: occurrenceDate, localTime: localStartTime }}
  currentLabel={t("owner.conflicts.flowCurrent")}
  currentTitle={t("owner.conflicts.flowTitle")}
  currentCard={<Card testID="conflict-current">…customerName · serviceName and the date/time…</Card>}
  initialDate={occurrenceDate}
  onExit={() => router.navigate("/recurrence-conflicts")}
  onMoved={async () => { await queryClient.invalidateQueries({ queryKey: ["owner-recurrence-conflicts"] }); void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] }); router.navigate({ params: { done: "rescheduled" }, pathname: "/recurrence-conflicts" }); }}
  submit={(startsAt) => resolveRecurrenceConflict(supabase, { id: conflictId, startsAt })}
  summaryRows={[[t("agendaCard.customer"), customerName], [t("book.summary.service"), serviceName]]}
  testPrefix="conflict"
/>
```
- [ ] **Step 3: Conflicts screen.** `conflict-reschedule-<id>` now `router.push({ pathname: "/conflict-reschedule", params: { … } })` with the ids/names from the conflict (`conflict.id`, `barberId`, `barberServiceId`, `occurrenceDate`, `localStartTime`, `customerName`, `serviceName`); remove the sheet and its state; read `done` with `useLocalSearchParams` and, when `rescheduled`, show the existing `owner.conflicts.rescheduled` toast once, then `router.setParams({ done: undefined })`. Keep Dismiss as is. Delete `ConflictRescheduleSheet.tsx` and the sheet-only strings (`sheetTitle, sheetDate, sheetTimes, sheetConfirm`, and `noTimes` only if unused).
- [ ] **Step 4: Layout, parents, strings.** `MANAGE_SCREENS` gets `"conflict-reschedule"`; `ROUTE_PARENTS["/conflict-reschedule"] = "/recurrence-conflicts"`. Strings (`owner.conflicts`): `flowCurrent` ("Conflicted date" / "Data do conflito" / "Fecha del conflicto"), `flowTitle` ("Conflicted occurrence" / "Ocorrência em conflito" / "Ocurrencia en conflicto").
- [ ] **Step 5: Verify** — `npx tsc --noEmit && npx eslint . && npx jest` (route-parents coverage must pass); restart Expo; `npx playwright test tests/e2e/owner-conflicts.web.spec.ts tests/e2e/owner-recurring.web.spec.ts tests/e2e/recurrence.web.spec.ts tests/e2e/reschedule-steps.web.spec.ts` → PASS; 375px screenshots of the three steps.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: owner conflict reschedule follows the booking steps"`

---

### Task 3: Review, push, PR, CI
- [ ] `npx tsc --noEmit && npx eslint . && npx jest`, full web e2e (`--workers=2`; rerun only failures if Expo dies near the end); restore `.env.local`, restart the user's Metro; push; PR with base `main` via `gh api`; one background waiter for CI; fix failures; report.
