# Unavailable days in the booking calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dim, in every booking calendar, the days the chosen professional cannot work, and show a short message when one is tapped.

**Architecture:** One read-only SQL function (`list_unavailable_dates`, migration 0076) that reuses the range arithmetic of `get_available_slots` per date and returns only dates. A small API + `useUnavailableDates` hook (one react-query per month: visible and neighbours). `MonthCalendar` learns `unavailableDates` (dimmed, still receives the press, shows the message). `AvailabilityCalendar` joins the calendar and the hook; `DateStep` and the customer date screen use it, so the five flows share one wiring.

**Tech Stack:** Supabase (Postgres 17 range types + pgTAP), TanStack Query (`useQueries`), Expo/React Native + react-native-web, react-i18next (pt/es/en), Jest (jest-expo, RNTL 14), Playwright (system Chrome).

**Spec:** `docs/superpowers/specs/2026-11-19-unavailable-days-design.md`

**Branch:** `feat-unavailable-days`, cut from `main` (after PR #108). One PR. Migration **0076**, pgTAP **058**.

## Findings (read from the code first)

1. **The rule lives in `get_available_slots` (0048):** openings = weekly `working_periods` for `isodow` + that date's `opening` overrides; blocks = that date's `block` overrides (no times = whole day) + the professional's daily lunch break; slots come from openings minus blocks. A date has no slot-able time when **openings − blocks is empty**; that is the rule `list_unavailable_dates` uses, so the calendar and the time list cannot disagree (apart from the service length, the 15-minute grid and booked appointments, deliberately ignored: a day that only lacks a long-enough gap or is fully booked stays selectable).
2. **"Shop closed" needs no separate rule:** the owner's closed date inserts an all-day `block` for **every active professional** (`ClosedDatesCard` / `closedDates()`), so for the chosen professional it is the all-day block.
3. **Error code:** `P0042` is the last used (`0070`); the new range error uses **`P0043`** (`UNAVAILABLE_DATES_RANGE_TOO_LARGE`).
4. **`from`/`to` are reserved in SQL:** the parameters are `from_date` / `to_date`.
5. **Toast is inline, not an overlay** (`src/components/domain/Toast.tsx`): `MonthCalendar` renders it under its own grid, so the five flows get the message with no per-flow code. It auto-dismisses after 3 s.
6. **All five flows have the professional id at the date step** (table in the spec): customer booking (route param), owner form (`choice.professionalService.professionalId`, since the professional step comes before the date step), `RescheduleFlow` (prop `professionalId`) used by customer reschedule, professional move and owner conflict-reschedule. None picks the professional later.
7. **The calendar window is today … +30 days** (`BOOKING_DAYS_AHEAD`): at most two months, so the hook's visible + neighbour months are at most three single-month requests, each far under the 120-day limit.

## Open questions

1. **Range limit: reject (chosen) vs clamp.** Rejecting with `P0043` is explicit; the app never gets near it. If a clamp is preferred, only Task 1's SQL and its pgTAP assertion change.
2. **Staleness:** `staleTime` is 5 minutes, so a block created meanwhile appears after at most 5 minutes or on the next mutation by the same owner (closure/reopen invalidate `["unavailable-dates"]`). A customer with the calendar open will not see a block created seconds ago; the time list (always live) still tells the truth.
3. **Not dimmed on purpose:** fully booked days; a day where only a gap shorter than the service is left.

## Global Constraints

- The function returns **only dates**; `security definer`, `set search_path = pg_catalog, public, pg_temp`, `revoke all … from public, anon`, `grant execute … to authenticated`.
- Dimmed days are **not selectable** but still **receive the press** (no native `disabled`) to show the message; accessibility state `disabled: true`.
- Texts in pt/es/en with parity: `book.dateUnavailable` = "Unavailable on this date" / "Indisponível nesta data" / "No disponible en esta fecha".
- Fully booked days stay selectable. With no professional nothing is dimmed.
- Conventions: no hard-coded text; colours by tokens; `className` only on plain RN elements; tests in `tests/unit/*.test.ts` with `React.createElement` and async `render`; **never `supabase db reset`** (apply with `npx supabase migration up`; run pgTAP files by path).
- **Gate per task:** `npm run typecheck`, `./node_modules/.bin/eslint app src tests scripts`, the tests named (read the `Test Suites:` line). **Final gate (Task 5):** `npm run typecheck`, ROOT `npm run lint` (real output + exit code), `npx jest --runInBand`, the new and touched pgTAP files, the whole Playwright suite, all **re-run after the last commit**, then screenshots.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0076_list_unavailable_dates.sql` (new) | the function |
| `supabase/tests/058_list_unavailable_dates.sql` (new) | pgTAP |
| `src/features/availability/unavailable-api.ts` (new) | `listUnavailableDates` |
| `src/features/availability/use-unavailable-dates.ts` (new) | `useUnavailableDates`, `monthWindow` |
| `src/components/domain/MonthCalendar.tsx` (modify) | `unavailableDates`, `onVisibleMonthChange`, dimmed + message |
| `src/features/availability/AvailabilityCalendar.tsx` (new) | calendar + hook |
| `src/features/availability/steps.tsx` (modify) | `DateStep` optional `professionalId` |
| `app/(customer)/(tabs)/book/date.tsx`, `app/(owner)/appointment-form.tsx`, `src/features/appointments/RescheduleFlow.tsx` (modify) | pass the professional id |
| `app/(owner)/shop.tsx` (modify) | invalidate `["unavailable-dates"]` on closure changes |
| `src/i18n/locales/{en,es,pt}.ts` (modify) | `book.dateUnavailable` |
| `tests/unit/unavailable-dates.test.ts`, `month-calendar-unavailable.test.ts`, `availability-calendar.test.ts` (new) | Jest |
| `tests/e2e/unavailable-days.web.spec.ts` (new) | Playwright |

---

### Task 1: SQL function + pgTAP

**Files:** `supabase/migrations/0076_list_unavailable_dates.sql`, `supabase/tests/058_list_unavailable_dates.sql`

**Interfaces:** `public.list_unavailable_dates(professional_id uuid, from_date date, to_date date) returns setof date`, ascending; empty for an unknown/inactive professional or `to_date < from_date`; `P0043` when `to_date - from_date > 120`.

- [ ] **Step 1: Write the failing pgTAP** `supabase/tests/058_list_unavailable_dates.sql` (fixture in the style of `056`: one owner, shop, two professionals, a customer, working periods Mon–Fri 09:00–18:00 for professional 1 and Mon–Sat for professional 2, a block on one date for professional 1, an all-day block for both on another date (shop closed), an `opening` override on a Sunday, a lunch break only on professional 2, a timed block covering a whole day's opening on one date). Assertions (`plan(12)`): weekly day off returned; professional block returned; shop-closed date returned for professional 1; normal weekday not returned; Sunday with an `opening` override not returned; lunch break alone does not make a day unavailable; timed block covering the whole opening makes it unavailable; customer cannot `select` from `schedule_overrides` but the function works for them; `anon` is refused (`42501`); unknown professional → empty; range of 121 days → `P0043`; `to_date < from_date` → empty. Use dates computed from `date_trunc('week', now())` so the test does not rot. Run: `npx supabase test db supabase/tests/058_list_unavailable_dates.sql` → FAIL (function missing).

- [ ] **Step 2: Implement** `supabase/migrations/0076_list_unavailable_dates.sql`:

```sql
-- The dates (a range of at most 120 days) on which a professional has NO working time left, by the same rules as get_available_slots
-- (0048): openings = weekly periods of that weekday + that date's opening overrides; blocks = that date's blocks (no times = the whole
-- day) + the daily lunch break; a date is unavailable when openings minus blocks is empty. Dates only: no times, no reasons.
-- Fully booked days are not unavailable (appointments are not part of the rule).
create function public.list_unavailable_dates(professional_id uuid, from_date date, to_date date)
returns setof date
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target public.professionals%rowtype;
begin
  if to_date < from_date then
    return;
  end if;

  if to_date - from_date > 120 then
    raise exception using errcode = 'P0043', message = 'UNAVAILABLE_DATES_RANGE_TOO_LARGE';
  end if;

  select * into target from public.professionals where id = professional_id and active;

  if not found then
    return;
  end if;

  return query
  select day::date
  from generate_series(from_date::timestamp, to_date::timestamp, interval '1 day') as day
  where isempty(
    coalesce(
      (
        select range_agg(opening_range)
        from (
          select tsrange(day + working_periods.start_time, day + working_periods.end_time, '[)') as opening_range
          from public.working_periods
          where working_periods.shop_id = target.shop_id
            and working_periods.professional_id = target.id
            and working_periods.weekday = extract(isodow from day)::smallint
          union all
          select tsrange(day + schedule_overrides.start_time, day + schedule_overrides.end_time, '[)')
          from public.schedule_overrides
          where schedule_overrides.shop_id = target.shop_id
            and schedule_overrides.professional_id = target.id
            and schedule_overrides.local_date = day::date
            and schedule_overrides.kind = 'opening'
        ) as openings
      ),
      '{}'::tsmultirange
    )
    - coalesce(
      (
        select range_agg(block_range)
        from (
          select case
            when schedule_overrides.start_time is null then tsrange(day, day + interval '1 day', '[)')
            else tsrange(day + schedule_overrides.start_time, day + schedule_overrides.end_time, '[)')
          end as block_range
          from public.schedule_overrides
          where schedule_overrides.shop_id = target.shop_id
            and schedule_overrides.professional_id = target.id
            and schedule_overrides.local_date = day::date
            and schedule_overrides.kind = 'block'
          union all
          select tsrange(day + target.lunch_start, day + target.lunch_end, '[)')
          where target.lunch_start is not null
        ) as blocks
      ),
      '{}'::tsmultirange
    )
  )
  order by day;
end;
$$;

revoke all on function public.list_unavailable_dates(uuid, date, date) from public, anon;
grant execute on function public.list_unavailable_dates(uuid, date, date) to authenticated;
```

- [ ] **Step 3: Apply and run** `npx supabase migration up` then `npx supabase test db supabase/tests/058_list_unavailable_dates.sql supabase/tests/011_availability_hardening.sql` (or the pgTAP files that cover `get_available_slots`: `rtk grep -ln get_available_slots supabase/tests`). Expected PASS. Cross-check one extra assertion in 058 that for a date the function returns, `get_available_slots` returns zero rows (the two must never disagree).

- [ ] **Step 4: Commit** (`feat(db): list_unavailable_dates`).

---

### Task 2: API, hook and `MonthCalendar`

**Files:** `src/features/availability/unavailable-api.ts`, `src/features/availability/use-unavailable-dates.ts`, `src/components/domain/MonthCalendar.tsx`, `src/i18n/locales/{en,es,pt}.ts`; tests `tests/unit/unavailable-dates.test.ts`, `tests/unit/month-calendar-unavailable.test.ts`.

**Interfaces:**
- `listUnavailableDates(supabase: Pick<SupabaseClient, "rpc">, input: { from: string; professionalId: string; to: string }): Promise<string[]>` (RPC `list_unavailable_dates`, args `professional_id`, `from_date`, `to_date`; errors become `AvailabilityError` via `toAvailabilityError`).
- `monthWindow(visibleMonth: string): string[]` → `[previous, visible, next]` as `YYYY-MM`.
- `useUnavailableDates(professionalId: string, visibleMonth: string): readonly string[]`.
- `MonthCalendar` new props: `unavailableDates?: readonly string[]`, `onVisibleMonthChange?: (month: string) => void`.

- [ ] **Step 1: Write failing tests.**
  - `unavailable-dates.test.ts`: `listUnavailableDates` calls the RPC with `{ professional_id, from_date, to_date }` and returns the date strings; an RPC error throws `AvailabilityError`; `monthWindow("2026-12")` = `["2026-11","2026-12","2027-01"]`; `useUnavailableDates` (renderHook with a `QueryClientProvider`, the API mocked) requests one call per month of the window with the month's first and last day, returns the sorted union, does not call the API when the professional id is empty, and when the visible month changes only the **new** month is fetched (the other two come from cache).
  - `month-calendar-unavailable.test.ts` (wrapper `GestureHandlerRootView` as in `month-calendar-component.test.ts`; `today = 2026-09-28`): a dimmed day (`unavailableDates: ["2026-09-30"]`) does **not** call `onSelectDate` when pressed and shows the message "Unavailable on this date" (testID `month-calendar-unavailable-message`); a normal day still selects and shows no message; the dimmed day has `accessibilityState.disabled === true` but is not natively disabled (`props.disabled` falsy) and carries reduced opacity (`opacity-40` in its className); `onVisibleMonthChange` is called with `"2026-10"` after pressing next month.
- [ ] **Step 2: Run, see red** (`npx jest tests/unit/unavailable-dates.test.ts tests/unit/month-calendar-unavailable.test.ts`).
- [ ] **Step 3: Implement.** `unavailable-api.ts` as above (reuse `toAvailabilityError`). `use-unavailable-dates.ts`:

```ts
import { useQueries } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { addMonths } from "../../lib/dates/month-calendar";
import { listUnavailableDates } from "./unavailable-api";

export const monthWindow = (visibleMonth: string) => [addMonths(visibleMonth, -1), visibleMonth, addMonths(visibleMonth, 1)];

const lastDay = (month: string) => {
  const [year, number] = month.split("-").map(Number);

  return `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`;
};

// The days the professional cannot work in the visible month and its neighbours (one cached request per month, so swiping to a
// neighbour finds it ready). Nothing is dimmed without a professional, while loading, or if a request fails.
export function useUnavailableDates(professionalId: string, visibleMonth: string): readonly string[] {
  const { supabase } = useSupabaseSession();
  const results = useQueries({
    queries: monthWindow(visibleMonth).map((month) => ({
      enabled: Boolean(professionalId),
      queryFn: () => listUnavailableDates(supabase, { from: `${month}-01`, professionalId, to: lastDay(month) }),
      queryKey: ["unavailable-dates", professionalId, month],
      retry: false,
      staleTime: 5 * 60_000,
    })),
  });

  return results.flatMap((result) => result.data ?? []).sort();
}
```

`MonthCalendar`: add the two props; compute `const unavailable = new Set(unavailableDates)`; in `MonthGrid` a day is `dimmed = bookable && unavailable.has(date)`; its `Pressable` keeps `disabled={!bookable}` (out of window, as today) but for dimmed: `onPress={() => onUnavailable()}` instead of `onSelectDate`, `accessibilityState={{ disabled: true, selected }}`, class `opacity-40`, text `text-neutral-400`. `MonthCalendar` holds `const [message, setMessage] = useState(false)` and renders under the strip `<Toast message={t("book.dateUnavailable")} onDismiss={() => setMessage(false)} testID="month-calendar-unavailable-message" variant="info" visible={message} />`; it calls `onVisibleMonthChange?.(month)` in an effect on `pickedMonth` (initial value included). Add the i18n key in the three locales under `book`. Export `MonthCalendarProps` additions.
- [ ] **Step 4: Run green** the two test files + `tests/unit/month-calendar-component.test.ts tests/unit/month-calendar.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts`; typecheck; lint.
- [ ] **Step 5: Commit** (`feat(calendar): dim unavailable days and explain when tapped`).

---

### Task 3: Wire the five flows

**Files:** `src/features/availability/AvailabilityCalendar.tsx` (new), `src/features/availability/steps.tsx`, `app/(customer)/(tabs)/book/date.tsx`, `app/(owner)/appointment-form.tsx`, `src/features/appointments/RescheduleFlow.tsx`, `app/(owner)/shop.tsx`; test `tests/unit/availability-calendar.test.ts`.

**Interfaces:** `AvailabilityCalendar(props: MonthCalendarProps & { professionalId?: string })`; `DateStep` gains optional `professionalId?: string`.

- [ ] **Step 1: Failing test** `availability-calendar.test.ts`: with `useUnavailableDates` mocked, `AvailabilityCalendar` passes its result to `MonthCalendar` (a mocked day is dimmed and its press shows the message), calls the hook with the professional id and the visible month, and with no `professionalId` calls it with `""` (nothing dimmed).
- [ ] **Step 2: Implement.** `AvailabilityCalendar` keeps `const [month, setMonth] = useState(props.selectedDate.slice(0, 7))`, calls `useUnavailableDates(professionalId ?? "", month)` and renders `<MonthCalendar {...rest} onVisibleMonthChange={setMonth} unavailableDates={dates} />`. `DateStep` renders `AvailabilityCalendar` with `professionalId`. Customer `book/date.tsx` renders `AvailabilityCalendar` with `professionalId`. Owner form: `<DateStep professionalId={choice?.professionalService.professionalId} …>`. `RescheduleFlow`: `<DateStep professionalId={professionalId} …>`. `shop.tsx` `refreshClosures` also invalidates `["unavailable-dates"]`.
- [ ] **Step 3: Run** the new test, `tests/unit/owner-appointment-form-steps.test.ts`, `booking-steps.test.ts`, `reschedule-current.test.ts`, typecheck, lint; then Playwright for the touched flows: `booking`, `owner-appointment-form`, `owner-conflicts`, `professional-booking`, `swipe`, `owner-shop` (their REST mocks abort unknown calls: add `list_unavailable_dates` → `[]` handling where a mock aborts it, or rely on the hook swallowing failures — the hook must never break a flow).
- [ ] **Step 4: Commit** (`feat(booking): dim the professional's unavailable days in every calendar`).

---

### Task 4: Browser e2e

**Files:** `tests/e2e/unavailable-days.web.spec.ts`

- [ ] Mock `/rpc/list_unavailable_dates` (return a date inside the next 30 days). Customer: walk to the date step, the dimmed day has `aria-disabled`, tapping it does not change the selected day and shows "Unavailable on this date"; a normal day selects; the message is also shown after swiping to the next month for a date there. Owner booking form: professional chosen, same assertion. Run; commit (`test(e2e): unavailable days`).

---

### Task 5: Final gate, screenshots, handoff

- [ ] **Step 1:** `npm run typecheck; echo $?`, `npm run lint; echo $?`, `npx jest --runInBand`, `npx supabase test db supabase/tests/058_list_unavailable_dates.sql` (+ every pgTAP file that covers availability), whole Playwright suite; re-run after the last commit.
- [ ] **Step 2: Screenshots** (390×844): the customer date step with dimmed days and the message; computed styles of a dimmed day (`opacity` `0.4`) vs a normal day (`1`).
- [ ] **Step 3:** report; push/PR by the orchestrator only.
