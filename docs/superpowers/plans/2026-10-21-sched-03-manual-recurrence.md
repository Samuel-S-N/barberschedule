# Manual Recurrence as Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff create a recurring plan for a customer through **Cliente › Plano › [Barbeiro] › Dia › Horário › Revisão › Enviar** (full screens with the step bar), replacing the inline card with typed date and time.

**Architecture:** One component `ManualRecurrenceFlow` (`src/features/recurrence/ManualRecurrenceFlow.tsx`) used by two hidden routes (owner `/recurrence-manual`, barber `/my-profile/recurrence-manual`). Plans per barber come from `list_recurrence_plans_for_barber` and are merged with `buildPlanOffers`; the weekday availability queries are extracted to a hook shared with the customer's flow. `ManualRecurrenceForm` is deleted.

**Tech Stack:** Expo Router, React Query (`useQueries`), NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-scheduling-standard-design.md`

## Global Constraints
- Branch `feat-manual-recurrence-steps` from `feat-owner-booking-steps`; PR base `main`, merge after the other two. No database/API change (`createRecurrenceForCustomer` reused).
- Steps keys `customer, plan, barber, weekday, time, review, send`; the `barber` step is shown only when the chosen plan is offered by more than one barber (so the barber role never sees it); the "Step N of M" numbers follow the steps actually in the flow. Labels: Cliente/Plano/Barbeiro/Dia/Horário/Revisão/Enviar (en Customer/Plan/Barber/Day/Time/Review/Send) in `recurrence.manualSteps`.
- Routes: owner hidden tab `recurrence-manual` (in `MANAGE_SCREENS`, parent `/monthly-customers`), barber `app/(barber)/my-profile/recurrence-manual.tsx` (parent `/my-profile/recurrence`); add both to `ROUTE_PARENTS`.
- First date = `nextDateForWeekday(today, weekday)` (never today), the same rule as the customer's flow.
- Success returns to the originating list with the toast `owner.recurring.saved` through a `created` param.
- Test ids: `recurring-manual` (the button that opens the route, kept), `manual-customer-search`, `manual-customer-<id>`, `offer-<planId>`, `offer-barber-<barberId>`, `weekday-<n>`, `manual-continue`, `manual-summary`, `manual-recurrence-save`.
- Verify at 375px; Expo restart before e2e; commit trailer; CI watched; the user merges.

---

### Task 1: Shared weekday availability hook (behaviour-preserving)

**Files:** Create `src/features/recurrence/customer-flow/use-weekday-slots.ts`; modify `app/(customer)/me/recurrence.tsx`.

**Produces:** `useWeekdaySlots({ barberId, barberServiceId, enabled, today }) → { dates: Record<number, string>; disabledDays: number[]; queries: UseQueryResult<AvailableSlot[]>[] }` (the `dates`, `weekdaySlots` and `disabledDays` logic now inline in the customer screen).
- [ ] Move the logic into the hook, use it in the customer screen, run `tests/e2e/recurrence-request.web.spec.ts tests/e2e/plan-change.web.spec.ts` → PASS; commit `refactor: weekday availability hook`.

### Task 2: E2E first, then the flow and the two routes

**Files:** Create `src/features/recurrence/ManualRecurrenceFlow.tsx`, `app/(owner)/recurrence-manual.tsx`, `app/(barber)/my-profile/recurrence-manual.tsx`, `tests/e2e/manual-recurrence-steps.web.spec.ts`; modify `app/(owner)/monthly-customers.tsx`, `app/(barber)/my-profile/recurrence.tsx`, `app/(owner)/_layout.tsx`, `src/lib/navigation/parents.ts`, `src/i18n/locales/{en,pt,es}.ts`, `tests/e2e/owner-recurring.web.spec.ts`, `tests/e2e/barber-recurrence.web.spec.ts`, `tests/e2e/recurrence.web.spec.ts`; delete `src/features/recurrence/ManualRecurrenceForm.tsx` and the narrow-phone alignment test of the old fields.

**Interfaces — Produces:**
```tsx
ManualRecurrenceFlow(props: {
  barbers: { avatarUrl: string | null; id: string; name: string }[];   // owner: active barbers; barber: just themself
  customers: { id: string; name: string }[];
  onCreated: () => void;                                              // navigate back with the toast
  onExit: () => void;                                                 // back on the first step
  onSearch?: (term: string) => void;                                  // barber: server-side customer search
})
```
- [ ] **Step 1: Failing e2e** `manual-recurrence-steps.web.spec.ts` for the owner and the barber (mocks: customers, barbers, `list_recurrence_plans_for_barber` per barber with two barbers offering one plan and one offering another, `get_available_slots`, `create_recurrence_for_customer` recording its body): the "Add manually" button goes to the route; owner flow "Step 1 of 7 · Customer" (search filters rows) → a customer row → Plan (offers with title, value and sessions per month) → a plan offered by two barbers shows the Barber step; a plan offered by one skips it (the step count changes to 6) → Day (vertical weekday list, a day without times disabled) → Time → Review (`PlanSummary`, customer, barber, "Every Monday", first date) → `manual-recurrence-save` sends `{ target_barber_service_id, target_customer_id, target_interval_weeks, target_start_date, target_start_time }` and returns to `/monthly-customers` with "Recurring booking saved."; barber flow has no Barber step; back/finished steps; a failing create returns to the Time step with the error. Update the three existing specs to drive the new route instead of the inline card (`recurring-manual` click → flow) and delete the alignment test. Run → FAIL.
- [ ] **Step 2: Implement** the flow (trail of steps, `StepBar` with the dynamic list, `ScreenHeader`, customer step with `SearchInput` + rows that move on, plan step with `PlanCard`s from `buildPlanOffers`, barber step with `BarberCard`s, day step with `WeekdayList` + `useWeekdaySlots`, time step with `TimeSlotPicker`, review with `PlanSummary` + rows, create mutation with the invalidations of the old form (`owner-recurring`, `barber-agenda`, `owner-agenda`)). Routes: owner loads `listOwnerCustomers`+`listOwnerBarbers` (active); barber loads `getMyBarberProfile` and `searchMyCustomers(term)`; both pass `onCreated={() => router.navigate({ pathname: <list>, params: { created: "1" } })}`; the list screens read `created` (owner `/monthly-customers`, barber `/my-profile/recurrence`), show the toast once and clear the param; their "Add manually" button becomes `router.push("/recurrence-manual")` / `("/my-profile/recurrence-manual")`.
- [ ] **Step 3: Strings** `recurrence.manualSteps` and step titles in three languages; delete the strings only the old form used (`recurrence.manualCustomer`, `manualService` if unused, `owner.recurring.startDateLabel`/`timeLabel` if unused).
- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx eslint . && npx jest` (route-parents coverage); restart Expo; `npx playwright test tests/e2e/manual-recurrence-steps.web.spec.ts tests/e2e/owner-recurring.web.spec.ts tests/e2e/barber-recurrence.web.spec.ts tests/e2e/recurrence.web.spec.ts tests/e2e/recurrence-request.web.spec.ts tests/e2e/field-examples.web.spec.ts` → PASS; 375px screenshots (plan, day, review).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: manual recurrence follows the booking steps"`

### Task 3: Review, push, PR, CI (as in the previous plans; PR base `main`).
