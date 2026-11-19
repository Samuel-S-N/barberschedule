# Unavailable days in the booking calendar — design

Date: 2026-11-19
Status: approved in chat by the user on 2026-11-19 (relayed by the orchestrator session)

## Why

Today every day of the booking calendar looks bookable. A customer picks a day the chosen professional does not work
(weekly day off, a block, a closed shop), continues to the time step and only then sees "no times". The calendar should
dim those days up front and say why when one is tapped.

## Behaviour

- In **every booking calendar** (customer booking, owner booking form, customer reschedule, professional move,
  owner conflict-reschedule) the days the chosen professional **cannot work** are dimmed (reduced opacity) and cannot be
  selected.
- Tapping a dimmed day shows a short message under the calendar (the existing `Toast`, info variant):
  pt "Indisponível nesta data", es "No disponible en esta fecha", en "Unavailable on this date".
- A day is **unavailable** when the professional has **no working time left that day**, using exactly the rules of
  `get_available_slots` (`0011`, `0012`, `0048`) so the calendar never disagrees with the time list:
  - no weekly working period for that ISO weekday **and** no `opening` override that date (weekly day off);
  - an all-day `block` of theirs (`schedule_overrides`, kind `block`, no times);
  - a shop closure (the owner's "closed date" is an all-day block on **every** active professional, so for one
    professional it is that same all-day block: no separate rule needed);
  - more generally, the day's openings minus every block (timed blocks and the daily lunch break) are empty.
- **Fully booked days stay selectable** (out of scope: appointments are not part of the rule).
- With no professional chosen nothing is dimmed.

## Design

### Database: migration `0076_list_unavailable_dates.sql`

```
list_unavailable_dates(professional_id uuid, from_date date, to_date date) returns setof date
```

- Parameter names: `from`/`to` are reserved words in SQL, so the function uses `from_date`/`to_date`.
- Returns **only dates** (no times, no reasons), ascending.
- `security definer`, `set search_path = pg_catalog, public, pg_temp`, `revoke all … from public, anon`,
  `grant execute … to authenticated` (booking needs a signed-in user). Customers cannot read `schedule_overrides`
  directly (RLS); the function exposes nothing but "not available that day".
- Unknown or inactive professional, or `to_date < from_date` → **empty** result (nothing is dimmed; no information
  about whether the professional exists).
- A range longer than **120 days** is **rejected** with `P0043 / UNAVAILABLE_DATES_RANGE_TOO_LARGE` (rejecting is
  explicit and keeps the cost bounded; the app asks one month at a time, never close to the limit).
- Implementation: per date of the range, openings = `range_agg` of the weekly periods of that ISO weekday plus that
  date's `opening` overrides; blocks = `range_agg` of that date's blocks (all-day = the whole day) plus the
  professional's lunch break; the date is unavailable when `openings - blocks` is empty. Same range arithmetic as
  `get_available_slots`, without the service duration, the 15-minute grid or appointments.

### App

- `src/features/availability/unavailable-api.ts`: `listUnavailableDates(supabase, { professionalId, from, to })` → `string[]`.
- `src/features/availability/use-unavailable-dates.ts`: `useUnavailableDates(professionalId, visibleMonth)` — one
  react-query per month for the **visible month and its neighbours** (`useQueries`), keyed
  `["unavailable-dates", professionalId, "YYYY-MM"]`, `staleTime` 5 minutes, disabled without a professional; returns the
  union as a sorted array. Swiping to a neighbour month finds it already cached (no flicker). The owner's closed-date and
  schedule mutations invalidate `["unavailable-dates"]`.
- `MonthCalendar` gets `unavailableDates?: readonly string[]` and `onVisibleMonthChange?: (month: string) => void`.
  Dimmed days keep **receiving the press** (no native `disabled`): they report `accessibilityState.disabled` and show
  the message; they never call `onSelectDate`.
- `src/features/availability/AvailabilityCalendar.tsx`: `MonthCalendar` + the hook, so the five flows share one wiring.
  `DateStep` gets an optional `professionalId` and uses it.

### The five flows and where the professional id comes from

| Flow | Screen | Professional id at the date step |
|---|---|---|
| customer booking | `app/(customer)/(tabs)/book/date.tsx` | route param `professionalId` (chosen on the first step) |
| owner booking form | `app/(owner)/appointment-form.tsx` | `choice.professionalService.professionalId` (the professional step precedes the date step since PR #106) |
| customer reschedule | `app/(customer)/reschedule.tsx` → `RescheduleFlow` | `professionalId` prop (route param) |
| professional move | `app/(professional)/move-appointment.tsx` → `RescheduleFlow` | `professionalId` prop (the professional's own id) |
| owner conflict-reschedule | `app/(owner)/conflict-reschedule.tsx` → `RescheduleFlow` | `professionalId` prop |

All five have it at the date step.

## Out of scope

Dimming fully booked days, showing the reason (day off vs block vs closed), the professional's own booking sheet (it
lists slots, not a calendar), changing the 30-day booking window.

## Testing

- pgTAP `058_list_unavailable_dates.sql`: weekly day off, professional block, shop closed (both professionals blocked),
  a normal working day (not returned), an `opening` override on a day off (not returned), lunch break alone does not
  make a day unavailable, timed block covering the whole opening does, a customer cannot read `schedule_overrides`
  but the function works for them, anon rejected, unknown professional → empty, range limit rejected.
- Jest: API mapping; hook (months, neighbours, staleTime/keys, disabled without a professional); `MonthCalendar`
  (dimmed day: no `onSelectDate`, shows the message; normal day selects; a11y state); `AvailabilityCalendar`; locale parity.
- Playwright (web): customer taps a dimmed day and sees the message; an owner flow dims the day off; screenshots at
  390px wide with computed-style checks (dimmed opacity, message).
- Gates: typecheck, ROOT `npm run lint`, full Jest, the new and touched pgTAP and Playwright specs, re-run after the last commit.
