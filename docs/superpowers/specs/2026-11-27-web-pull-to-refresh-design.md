# Pull-to-refresh on the web: design

Date: 2026-11-27
Status: approved by the user (design); implementation follows `docs/superpowers/plans/2026-11-27-web-pull-to-refresh.md`

## Problem

On the live dev site from a phone browser (and in the installed PWA), pulling down at the top of a screen does nothing. Home, Appointments
and Book > professional pass a React Native `RefreshControl` to their `ScrollView`; react-native-web ignores `refreshControl`, so the gesture
only exists on native. The staff agendas (owner Agenda, professional My agenda) pass `pullToRefresh(pull)` (also a `RefreshControl`) to a
`KeyboardAwareScrollView`, with the same result.

## Goal

A pull-down at the top of a screen refetches what the screen shows, on web, with a visible indicator, without breaking normal scrolling,
taps or the horizontal swipes of the agenda calendars. Native behaviour does not change at all.

## Non-goals

The top bar and greeting layout (the user said to leave them), the other ~20 screens that already pass `refreshControl={pullToRefresh(pull)}`
(they keep working on native; the new component makes moving them a one-line change, a follow-up), a custom animation library.

## Design

**One shared component, `RefreshableScrollView`**, same props as the screens pass today (`onRefresh`, `refreshing`, `children`, `className`, any
`ScrollView` prop) plus an optional `as` to wrap another scroll component (the agendas use `KeyboardAwareScrollView`).

- **Native** (`RefreshableScrollView.tsx`): `<Scroll refreshControl={<RefreshControl onRefresh refreshing />} {...props}>`, exactly what the screens
  render today.
- **Web** (`RefreshableScrollView.web.tsx`, picked by Metro's platform extension, so no DOM code ships to native): a wrapper `View` with
  `overflow: hidden`, an indicator (the app's `ActivityIndicator`) absolutely positioned at its top, and the scroll component inside a
  container that is translated down by the pull offset. Native `touchstart` / non-passive `touchmove` / `touchend` listeners are attached to the
  wrapper's DOM node (React's own touch listeners are passive and cannot `preventDefault`, which is needed to stop the browser's overscroll while
  our pull is active).

**Pure gesture logic in `src/lib/pull-to-refresh.ts`** (no DOM, no React): a small state machine fed with touch points and an `atTop` flag.

| Rule | Value |
|---|---|
| A pull can only start | at `touchstart` with every scrollable ancestor of the touch target (up to the wrapper) at `scrollTop <= 0`, one finger, not while `refreshing` |
| A pull becomes active | when the finger moved down by at least 6 px and the move is more vertical than horizontal (`dy >= |dx|`); the browser starts its own scroll only after ~15 px, so `preventDefault` still works |
| The pull is cancelled | for the rest of that touch, when the finger moves up, moves more horizontally than vertically (calendar swipes), or any scrollable ancestor is no longer at the top (mid-scroll) |
| `preventDefault` | only while the pull is active |
| Trigger | on release, when the finger travelled at least **70 px** downward (`PULL_THRESHOLD`) |
| Indicator offset | `min(90, 0.5 * distance)` while dragging (resistance), held at 56 px while `refreshing`, 0 otherwise; eased with a CSS transition when not dragging |
| Spinner | opacity follows `min(1, distance / 70)` while dragging, fully visible while `refreshing` |

Screens: Home, Appointments, Book > professional (customer tabs) and the owner Agenda and professional My agenda (staff agendas, where
refreshing matters most; the latter lives in `ProfessionalAgenda`). Each keeps its existing refetch (`useRefresh` / `useRefreshAll`).

## Testing

- Unit (`tests/unit/pull-to-refresh.test.ts`): the state machine (threshold, only at top, short pull does nothing, upward / horizontal / mid-scroll
  cancel, no pull while refreshing, `preventDefault` only when active, offsets and spinner progress).
- Unit (`tests/unit/refreshable-scroll-view.test.ts`): the native component passes a `RefreshControl` with the same props and forwards `as` and other props.
- E2E on web (Chromium touch emulation; Firefox and WebKit if their touch emulation allows dispatching `TouchEvent`s, otherwise the spec is
  skipped there with the reason): a pull at the top of Home refetches (the mocked appointments request is made again), a short pull does not,
  a pull while scrolled down does not, and normal scrolling still works.
- A 390 px screenshot of the indicator.

## Risks

- Synthetic touch events in Playwright are not a real finger: iOS Safari's rubber-band and Chrome Android's overscroll are verified only by the owner on a
  phone (not verifiable here).
- The browser's native pull-to-refresh (Chrome Android on a non-PWA page) could race ours; `preventDefault` from the first qualifying move and
  `overscroll-behavior-y: contain` on the scroll container are the mitigations.
