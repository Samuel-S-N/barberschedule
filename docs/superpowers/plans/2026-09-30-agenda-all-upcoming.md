# Agenda: all upcoming appointments + date filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Customer Agenda tab lists every upcoming appointment; picking a day filters to that day; tapping it again (or "Ver todos") clears the filter.

**Architecture:** One pure helper `visibleAppointments(grouped, selectedDate)` in `agenda-view.ts` (TDD). The screen keeps `pickedDate: string | null` (null = no filter), toggles on strip tap, and renders the helper result. `pickInitialDate` becomes unused and is removed.

**Tech Stack:** Expo/React Native, NativeWind, react-query, jest, playwright.

**Spec:** design approved in chat 2026-09-30 (no spec file; bounded path). Deviation: no per-day group headers, because `AppointmentCard` already shows `dateLabel · timeLabel`.

## Global Constraints

- Strings in pt, en, es locales (`src/i18n/locales/*.ts`).
- History segment unchanged. Calendar strip horizon (`DAYS_AHEAD = 30`) is visual only.
- className only on plain RN elements; verify UI in browser (screenshot + computed CSS).

---

### Task 1: Pure helper (TDD)

**Files:** Modify `src/features/appointments/agenda-view.ts`, `tests/unit/agenda-view.test.ts`

**Produces:** `visibleAppointments<T extends Appointment>(grouped: Map<string, T[]>, selectedDate: string | null): T[]`

- [ ] Step 1: In the test, replace the `pickInitialDate` import/test with:
```ts
it("lists every appointment in order when no date is selected, else only that day", () => {
  const grouped = groupByLocalDate([
    appointment("b", "2026-08-18T13:00:00Z"), appointment("a", "2026-08-17T12:00:00Z"), appointment("c", "2026-08-18T15:00:00Z"),
  ]);

  expect(visibleAppointments(grouped, null).map((a) => a.id)).toEqual(["a", "b", "c"]);
  expect(visibleAppointments(grouped, "2026-08-18").map((a) => a.id)).toEqual(["b", "c"]);
  expect(visibleAppointments(grouped, "2026-08-19")).toEqual([]);
});
```
- [ ] Step 2: `rtk npx jest tests/unit/agenda-view.test.ts` → FAIL (not exported).
- [ ] Step 3: In `agenda-view.ts` replace `pickInitialDate` with:
```ts
export function visibleAppointments<T extends Appointment>(grouped: Map<string, T[]>, selectedDate: string | null) {
  return selectedDate ? grouped.get(selectedDate) ?? [] : [...grouped.values()].flat();
}
```
- [ ] Step 4: run test → PASS.

### Task 2: Screen + i18n

**Files:** Modify `app/(customer)/(tabs)/appointments.tsx`, `src/i18n/locales/{pt,en,es}.ts`

- [ ] Step 1: Add keys in `appointments` namespace: `emptyUpcoming` (pt "Nenhum agendamento futuro", en "No upcoming appointments", es "No hay citas próximas") and `showAll` (pt "Ver todos", en "Show all", es "Ver todas").
- [ ] Step 2: In the screen: import `visibleAppointments` instead of `pickInitialDate`; replace `selectedDate`/`dayAppointments` with
```ts
const selectedDate = pickedDate;
const shown = visibleAppointments(grouped, selectedDate);
const selectDate = (date: string) => setPickedDate((current) => (current === date ? null : date));
```
  Pass `selectedDate={selectedDate ?? ""}` and `onSelectDate={selectDate}` to `CalendarStrip`; add, under the strip, a `Button` (size sm, variant outline, testID `agenda-show-all`, label `t("appointments.showAll")`) rendered only when `selectedDate`, `onPress={() => setPickedDate(null)}`. Empty state: `t(selectedDate ? "appointments.emptyDay" : "appointments.emptyUpcoming")`; render `shown.map(...)`.
- [ ] Step 3: `rtk npx tsc --noEmit` and `rtk npx jest` → pass.

### Task 3: Verify + e2e + commit

- [ ] Step 1: Add e2e in `tests/e2e/customer-lifecycle.web.spec.ts` (mirroring existing seeded upcoming appointment): card visible without clicking a day; click its strip day → still visible; click an empty day → card hidden and `agenda-show-all` visible; click `agenda-show-all` → card visible.
- [ ] Step 2: Run e2e (move `.env.local` aside per memory), screenshot in browser, check computed CSS of the new button.
- [ ] Step 3: Commit `feat(agenda): list all upcoming appointments, date strip filters` (plan + code), push, open PR via `gh api` REST.
