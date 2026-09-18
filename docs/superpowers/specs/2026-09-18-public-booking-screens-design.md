# Public Booking Screens Retrofit — Design

**Date:** 2026-09-18
**Status:** Draft

## Goal

Replace every screen in `app/(public)/book/*` with a full rewrite that uses
the design-system component library from
`docs/superpowers/specs/2026-09-17-design-system-foundation-design.md`
instead of raw React Native primitives and inline hex styles. This is the
first of four screen-group retrofits (public booking, auth, customer,
owner) that the foundation spec deferred; each is erased and rebuilt from
scratch against the design system rather than patched incrementally.

## Scope

In scope: `app/(public)/book/index.tsx`, `barber.tsx`, `service.tsx`,
`date.tsx`, `review.tsx` — full rewrites, not incremental edits. Each
screen keeps its existing route, params contract, and Supabase
query/mutation logic; only the presentation layer changes.

Also in scope, as small justified extensions to the shared library
discovered while wiring it into a real screen (per the foundation spec's
own note that manual verification happens "once a real screen renders
these components"):

- `BarberCard.rating` becomes optional (`rating?: number`) — the `barbers`
  table has no rating column, so there is no real value to pass. The star
  row simply doesn't render when `rating` is absent. No other prop
  changes.
- `Input` gains an optional `multiline?: boolean` prop for the booking
  notes field — the design system defines one text-field component, not
  a separate textarea; multiline is a rendering mode of the same field,
  matching how `TextInput` itself represents it in React Native.

Out of scope: auth/customer/owner screen-group retrofits (next specs, same
process), the Bottom Tab Bar / nav architecture spec, adding rating data
to the schema (that's a product/data decision, not a styling one), and
`AppointmentCard`/`StatusBadge`/`RatingStars` (not consumed by this flow).

## Screen-by-screen design

### `index.tsx` — shop list

No domain component covers a shop-selection list. Each shop becomes a
`Button` (`variant="primary"`, `size="lg"`) labeled `Start booking at
{shop.name}`, navigating with `router.push` (`expo-router`'s `useRouter`)
instead of `Link` styling. Loading state: three `SkeletonBlock` rows
(height matching button height). Empty state (no shops): `EmptyState`
with title `"No shops available"`.

### `barber.tsx` — barber list

One `BarberCard` per barber (`name`, `onPress` navigates to `/book/service`,
`selected` unused — this is a navigating list, not a persistent selection).
`specialty`/`distanceKm`/`rating` all omitted (no backing data). Loading:
two `SkeletonBlock` rows (72px tall, matching `BarberCard`'s rendered
height). Empty: `EmptyState` title `"No barbers available"`.

### `service.tsx` — service list

One `ServiceCard` per service, `onPress` navigates to `/book/date`.
Requires expanding the existing query — currently
`barber_services.select("id, services(name)")` — to also select
`duration_override_minutes, price_override_cents` from `barber_services`
and `duration_minutes, price_cents` from the joined `services`, then
resolve the effective duration/price the same way
`resolveEffectiveService` already does (override value wins when
non-null, else the base service value). This resolution is pure logic
(row in, `{durationMinutes, priceCents}` out) — a natural target for a
unit test before wiring it into the screen. Loading: two `SkeletonBlock`
rows (76px tall). Empty: `EmptyState` title `"No services available"`.

### `date.tsx` — date picker

Replaces the free-text `YYYY-MM-DD` `TextInput` with `CalendarStrip` over
a generated 14-day window starting "today" in shop time
(`America/Sao_Paulo`, via the existing `formatInstantInShopTime` helper).
A new pure helper, `buildCalendarStripDays(startInstant: Date, count:
number): CalendarStripDay[]`, computes each day's `date` (`YYYY-MM-DD`)
and `weekdayLabel` (short weekday, shop timezone) — this is exactly the
kind of pure date-math function the codebase already unit-tests
(`src/lib/dates/shop-time.ts` has direct test coverage), so it gets its
own test file. `hasAppointment` is left `undefined` for every day — it
has no meaning for a customer who hasn't booked yet.

The screen defaults `selectedDate` to the first (today's) entry, so a
`Button` labeled `"Continue to review"` is enabled immediately and
navigates using whichever date is currently selected — the user can
change the date first, but doesn't have to.

### `review.tsx` — slot selection, notes, confirm

`TimeSlotPicker` replaces the list of raw `Button`s for available times
(mapping `AvailableSlot.localTime` → `{time, status: "selected" | "free"}`
based on whether it matches the currently chosen `startsAt`; the
booking flow never receives occupied slots from `get_available_slots`,
so `"occupied"` is simply never produced here — that's expected, not a
gap). `Input` (`multiline`) replaces the raw `TextInput` for notes.
`Toast` (`variant="success"` / `"error"`) replaces the raw feedback
`Text` for the booking mutation's result. Loading availability: two
`SkeletonBlock` rows (56px tall, matching slot height). Empty (no slots
for the chosen date): `EmptyState` title `"No times available this
day"`. `Button` (`variant="primary"`) replaces the raw `Button` for
"Confirm booking", `disabled` under the same conditions as today.

## Testing

TDD per the existing convention (`tests/unit/<name>.test.ts`,
`React.createElement`, `@testing-library/react-native`):

- `buildCalendarStripDays` — pure function, direct unit tests (day count,
  date sequence, weekday labels, shop-timezone correctness around
  midnight).
- The service duration/price override-resolution helper — pure function,
  direct unit tests (override present vs. absent, both fields
  independently overridable).
- `BarberCard`'s now-optional `rating` — extend
  `tests/unit/barber-card.test.ts` with a case asserting the star row is
  absent when `rating` is omitted.
- `Input`'s new `multiline` — extend `tests/unit/input.test.ts` with a
  case asserting the underlying `TextInput` receives `multiline`.
- Screens themselves are exercised end-to-end, not unit tested (matching
  the existing convention — no other `app/*` route has a unit test
  today).

`tests/e2e/booking.web.spec.ts` gets rewritten selectors to match the new
interaction model (this is expected, called out in the foundation spec):
`getByRole("link", {name: "Start booking at Browser Shop"})` →
`getByRole("button", ...)` (same pattern for barber/service selection);
the date step drops `getByPlaceholder(...).fill(...)` entirely (the
default-selected date is used) and goes straight to "Continue to
review"; the time-slot step keeps working via `getByRole("button", {name:
"09:00"})` since `TimeSlotPicker` slots already expose that role/label.
No new e2e test scenarios are added — this spec changes presentation,
not booking behavior.

Before this work is considered complete, run the full gate (`npm run
verify`, including `npm run test:e2e:runner`'s Playwright suite) and
request a code review of the diff.

## Error handling

Unchanged from today: Supabase/query errors surface as an inline
`EmptyState`-adjacent message or the `Toast` error variant, matching each
screen's existing error branch — this spec changes *how* errors render,
not when they occur or what triggers them.

## Out of scope / next specs

- Auth screens retrofit (`app/(auth)/*`).
- Customer screens retrofit (`app/(customer)/*`) — consumes
  `AppointmentCard`, `StatusBadge`.
- Owner screens retrofit (`app/(owner)/*`) — largest group, consumes most
  domain components.
- Bottom Tab Bar / navigation architecture — separate spec.
- Adding real barber rating/specialty/distance data — a product/schema
  decision, independent of this styling work.
