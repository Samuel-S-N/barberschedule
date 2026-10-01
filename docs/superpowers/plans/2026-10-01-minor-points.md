# Minor Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix five small robustness gaps: duplicated 90-minute window, stale `open`/`today`, strip not covering far recurring appointments, unbounded history, and `t as never` casts.

**Architecture:** One shared `useNow` hook feeds both the lifecycle window and the booking calendar's `today`. Pure helpers (`stripLength`) and a paginated `listMyAppointments` carry the logic so they are unit-testable. `errorMessage` takes the single cast so screens stop casting.

**Tech Stack:** Expo/React Native, expo-router, TanStack Query, i18next, Jest, Supabase.

**Spec:** Approved in chat 2026-10-01 (bounded design, no spec file).

## Global Constraints

- Branch `fix-minor-points` from `main`; one commit per task.
- Strict TDD; run `npm test`, `npm run typecheck`, `npm run lint` at the end.
- Locale files en/es/pt must stay in parity (`tests/unit/locale-parity.test.ts`).
- Run shell reads through `rtk`.

---

### Task 1: Single source for the 90-minute window

**Files:**
- Modify: `src/features/appointments/validation.ts`
- Test: `tests/unit/lifecycle-window-contract.test.ts` (create)

**Interfaces:**
- Produces: `export const LIFECYCLE_LOCK_MINUTES = 90`

- [ ] **Step 1: Failing test** — reads `supabase/migrations/0014_appointment_lifecycle.sql`, extracts every `interval 'N minutes'`, expects all equal `LIFECYCLE_LOCK_MINUTES`.
- [ ] **Step 2: Run** `npx jest tests/unit/lifecycle-window-contract.test.ts` → FAIL (export missing).
- [ ] **Step 3: Implement** — export the constant and use it in `isLifecycleWindowOpen` (`LIFECYCLE_LOCK_MINUTES * 60 * 1000`), with a comment pointing to migration 0014.
- [ ] **Step 4: Run** → PASS, plus existing lifecycle tests.
- [ ] **Step 5: Commit** `refactor(appointments): single constant for the 90-minute lifecycle window`

### Task 2: `useNow` hook; fresh `open` and `today`

**Files:**
- Create: `src/lib/use-now.ts`
- Test: `tests/unit/use-now.test.ts` (create)
- Modify: `app/(customer)/(tabs)/appointments.tsx` (`renderAppointment`), `app/(customer)/(tabs)/book/date.tsx`

**Interfaces:**
- Produces: `useNow(intervalMs = 60_000): Date` — re-renders on a timer and when AppState becomes `active`.

- [ ] **Step 1: Failing test** — fake timers; render hook, advance `jest.setSystemTime` + `advanceTimersByTime(60_000)` inside `act`, expect returned Date to move forward.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** — `useState(() => new Date())`; `useEffect` with `setInterval` and `AppState.addEventListener("change", s => s === "active" && setNow(new Date()))`; clean up both.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire** — `appointments.tsx`: `const now = useNow();` and `isLifecycleWindowOpen(appointment.startsAt, now)`. `date.tsx`: `today = formatInstantInShopTime(useNow()).localDate`; keep the state but derive `const selected = localDate < today ? today : localDate` and use `selected` for calendar and navigation.
- [ ] **Step 6: Commit** `fix(booking): refresh lifecycle window and today while a screen stays open`

### Task 3: Strip covers far recurring appointments

**Files:**
- Modify: `src/features/appointments/agenda-view.ts`, `app/(customer)/(tabs)/appointments.tsx`
- Test: `tests/unit/agenda-view.test.ts`

**Interfaces:**
- Produces: `stripLength(appointments: Appointment[], from: Date, min = 30, max = 90): number` — days from `from` (shop local date) to the last appointment, inclusive, clamped to `[min, max]`. 90 matches the server recurrence horizon (`ensureRecurrenceWindow`).

- [ ] **Step 1: Failing tests** — no appointments → 30; last appointment in 10 days → 30; in 60 days → 61; in 200 days → 90.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** using `formatInstantInShopTime(...).localDate` and `Date.UTC` day difference.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire** — replace `DAYS_AHEAD` with `stripLength(upcoming.data ?? [], now)` (memo deps include `now`); drop the constant.
- [ ] **Step 6: Commit** `fix(appointments): extend the agenda strip to far recurring appointments`

### Task 4: Paginated history

**Files:**
- Modify: `src/features/appointments/lifecycle.ts`, `app/(customer)/(tabs)/appointments.tsx`, `src/i18n/locales/{en,es,pt}.ts`
- Test: `tests/unit/list-my-appointments.test.ts`

**Interfaces:**
- Produces: `HISTORY_PAGE_SIZE = 20`; `listMyAppointments(supabase, history?, now?, range?: { from: number; to: number })` applying `.range(from, to)` after `.order(...)` when given.
- i18n: `appointments.loadMore` ("Load more" / "Cargar más" / "Carregar mais").

- [ ] **Step 1: Failing test** — fake `order` returns a promise carrying a `range` mock; expect `range` called with `(20, 39)` when passed `{from:20,to:39}`, and not called otherwise.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the optional range.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Screen** — history uses `useInfiniteQuery` (`initialPageParam: 0`, `getNextPageParam: (last, all) => last.length === HISTORY_PAGE_SIZE ? all.length * HISTORY_PAGE_SIZE : undefined`); list is `history.data?.pages.flat()`; "Load more" button (`testID="agenda-load-more"`) shown when `hasNextPage`, disabled while `isFetchingNextPage`. Add i18n keys.
- [ ] **Step 6: Run** locale parity + full unit tests; **Commit** `feat(appointments): paginate the history list`

### Task 5: Drop `t as never`

**Files:**
- Modify: `src/i18n/errors.ts`, every `app/**` file with `t as never` (about 45 sites; not `signup.tsx` line 31 `errors[key] as never`)
- Test: `tests/unit/error-message.test.ts` (existing), typecheck

- [ ] **Step 1:** change `errorMessage`'s `t` parameter to `(key: never) => string` and cast once inside (`t(\`errors.${group}.${code}\` as never)`, same for `errors.invalidDateTime`).
- [ ] **Step 2:** `sed -i 's/t as never, /t, /; s/t as never,$/t,/'` over `app/`; confirm `rtk grep "t as never" app` is empty.
- [ ] **Step 3:** `npm run typecheck` → clean. If `TFunction` is not assignable, fall back to `t: TFunction` import and adjust.
- [ ] **Step 4:** `npm test`, `npm run lint`.
- [ ] **Step 5: Commit** `refactor(i18n): centralize the translation-key cast in errorMessage`

### Final verification

- [ ] `npm test`, `npm run typecheck`, `npm run lint` all green; check the appointments and booking screens in the browser (history "Load more", strip, date screen).
