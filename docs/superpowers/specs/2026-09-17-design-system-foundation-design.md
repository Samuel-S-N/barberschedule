# Design System Foundation — Design

**Date:** 2026-09-17
**Status:** Draft

## Goal

Stand up the visual design system described in `DESIGN_SYSTEM.md` as a
reusable component library — styling infrastructure, base components, and
domain components — without touching any existing screen. Every screen-group
retrofit that follows (public booking, auth, customer, owner) builds on this
library instead of re-deriving tokens or duplicating component code.

## Scope

In scope: NativeWind/Tailwind setup, font/icon registration, color and motion
token mirrors, the base components from `DESIGN_SYSTEM.md` §11
(`Button`, `Input`, `Card`), and the domain components from §12 except the
Bottom Tab Bar (§12.9):
`BarberCard`, `ServiceCard`, `TimeSlotPicker`, `AppointmentCard`,
`StatusBadge`, `CalendarStrip`, `RatingStars`, `EmptyState`, `Toast`,
`SkeletonLoader`.

Out of scope: any `app/` route, navigation structure, dark mode (already
deferred by `DESIGN_SYSTEM.md` §10). The Bottom Tab Bar is deferred to a
future navigation-architecture spec — introducing tab navigation changes how
routes are grouped, which is a structural decision independent of styling.

## Deviations from `DESIGN_SYSTEM.md` §0

The doc's setup section assumes a root-level `lib/` and a `@/` import alias.
Neither exists in this project: there is no `paths` entry in `tsconfig.json`,
no module-resolver plugin in `babel.config.js`, and every existing import
(`src/features/*`, `src/lib/*`, `app/*`) is relative. Introducing a new
aliasing mechanism solely for the design system would add infrastructure the
rest of the codebase doesn't use. Token mirrors live under `src/lib/design/`
instead, imported with relative paths like every other module.

## File structure

```
tailwind.config.ts        # root — NativeWind v4 / Tailwind v3, tokens from §2–§7
global.css                 # root — Tailwind directives
babel.config.js            # + nativewind/babel preset
metro.config.js            # + withNativeWind

src/lib/design/colors.ts   # JS mirror of §2 tokens, for SVG/Reanimated consumers
src/lib/design/motion.ts   # §7 duration/easing tokens

src/components/ui/
  Button.tsx
  Input.tsx
  Card.tsx

src/components/domain/
  BarberCard.tsx
  ServiceCard.tsx
  TimeSlotPicker.tsx
  CalendarStrip.tsx
  AppointmentCard.tsx
  StatusBadge.tsx
  RatingStars.tsx
  EmptyState.tsx
  Toast.tsx
  SkeletonLoader.tsx
```

## Setup

```bash
npx expo install nativewind tailwindcss@^3
npx expo install expo-font @expo-google-fonts/oswald @expo-google-fonts/inter
npx expo install lucide-react-native react-native-svg
npx expo install react-native-reanimated
```

- `tailwind.config.ts`: color scale from §2, spacing/semantic tokens from §4,
  border radii from §5, font family mapping from §3 (`font-sans*` → Inter,
  `font-display*` → Oswald, per the §1.1 weight-to-family rule).
- Fonts registered once in `app/_layout.tsx` via `useFonts` (touches the root
  layout only to add the font-loading call — no visual/route change).
- `lib/colors.ts`/`lib/motion.ts` (at `src/lib/design/`) export plain JS
  objects mirroring the Tailwind tokens, for `react-native-svg` fill/stroke
  props and Reanimated values, per §1.3 (no inline hex outside these files).

## Components

All components are presentational: props in, JSX out, no Supabase/query
calls, no navigation. This keeps them independently testable and reusable
across every future screen-group spec.

**Base (§11):**
- `Button` — variants `primary | dark | outline | ghost | danger`, sizes
  `sm | md | lg`, press feedback via Reanimated (`scale 0.97`, `duration.fast`,
  per §7 — intrinsic to the component, not to callers).
- `Input` — states rest/focused/error, per §5 border rules.
- `Card` — variants `elevated | outlined | flat`, per §6 shadow levels.

**Domain (§12, minus §12.9):**
- `BarberCard`, `ServiceCard`, `AppointmentCard`, `StatusBadge`,
  `RatingStars`, `EmptyState`, `Toast`, `SkeletonLoader` — structural/visual
  components per their §12 specs, no embedded animation beyond what §12
  states (e.g., `AppointmentCard` status swap is the consuming screen's
  concern, not the card's).
- `TimeSlotPicker` — grid of slots (free/selected/occupied per §12.3), owns
  the selection scale+border-fade micro-interaction (§7) since it's the
  slot's own selected-state behavior.
- `CalendarStrip` — horizontal date selector (§12.6), selection state is
  controlled via props (selected date, has-appointment dates); no internal
  date math beyond rendering.

Each component gets an `accessibilityRole`/`accessibilityLabel` per §8 where
it wraps an icon-only or interactive element, and respects the §1.4 44×44
hit-target minimum.

## Testing

Every component is built test-first (red/green/refactor): write the failing
test for a variant/state, implement until it passes, refactor, then move to
the next variant. Run `npm run typecheck` and the focused Jest file after
each component, not only at the end — the same incremental-verification
discipline the backend tasks already use (see `docs/project-status.md`).

Test files follow the existing flat convention: `tests/unit/<component>.test.ts`,
using `React.createElement` (not JSX) with `@testing-library/react-native`,
matching `tests/unit/smoke.test.ts`. This avoids changing `jest.config.js`'s
`testMatch`, which currently only matches `.test.ts`.

Coverage per component: each documented variant/state renders (e.g. `Button`
variants and sizes; `Input` rest/focused/error; `TimeSlotPicker`
free/selected/occupied — occupied is non-interactive and asserted as such);
`accessibilityRole`/`accessibilityLabel`/`accessibilityState` assertions
where applicable; icon-only interactive elements assert their
`accessibilityLabel` is present.

No visual regression tooling is introduced — it's not in the current stack
and isn't justified for a first component pass. There is no consuming screen
in this spec, so there is nothing to click through in a browser yet;
RTL render/assertion tests are the verification for this spec. Manual visual
verification (`npm run web`) happens in the next spec, once a real screen
renders these components.

Before this work is considered complete, run the full gate
(`npm run verify`) and request a code review of the diff.

## Error handling

Components are pure/presentational and trust their props (internal
callers, not a system boundary) — no runtime prop validation beyond
TypeScript types, consistent with `CLAUDE.md`-level conventions already in
this codebase (validate at boundaries, trust internal contracts).

## Out of scope / next specs

- Public booking flow retrofit (`app/(public)/book/*`) — first consumer of
  `TimeSlotPicker`, `CalendarStrip`, `BarberCard`, `ServiceCard`; updates
  `tests/e2e/booking.web.spec.ts` to match the new interaction structure.
- Auth screens retrofit (`app/(auth)/*`).
- Customer screens retrofit (`app/(customer)/*`) — consumes `AppointmentCard`,
  `StatusBadge`.
- Owner screens retrofit (`app/(owner)/*`) — largest group, consumes most
  domain components.
- Bottom Tab Bar / navigation architecture — separate spec, not part of any
  of the above.
