# Swipe Navigation — Design

**Date:** 2026-09-29
**Status:** Approved in chat, ready for planning
**Branch:** `feat-month-calendar` (adds to the month calendar work, one PR)

## Goal

Dragging sideways navigates:

1. Between the customer tabs Home, Agendar, Agenda and Perfil, with the page following the finger.
2. Between months in the month calendar (Agendar date step and Reschedule), which today only works through the arrow buttons.

## Decisions (from brainstorming)

- Tab swipe follows the finger (pager), not "switch on release".
- Month swipe: first built as "switch on release"; after testing on a phone the calendar now follows the finger like the tabs do (see "Month swipe").
- Scope is the customer app. The owner screens have no tab bar.

## Findings that shaped this design

- `expo-router` 57 vendors `@react-navigation/*`; there is no top-level `@react-navigation` package. Installing `@react-navigation/material-top-tabs` from npm would create a second navigation context, so it must not be added.
- `expo-router` ships the same navigator as `TopTabs` (`import { TopTabs } from "expo-router/js-top-tabs"`). It loads `react-native-tab-view` lazily and throws if it is missing, and `react-native-tab-view` needs `react-native-pager-view`. Neither is installed. `react-native-pager-view` 8.0.2 is the SDK 57 version and Expo Go bundles it, so no native rebuild is needed for Expo Go.
- On web `react-native-tab-view` falls back to a `PanResponder` pager, so dragging can be tested in Playwright.
- `TopTabs.Screen` has no `href: null`, so a screen cannot be a hidden tab. Today `app/(customer)/reschedule.tsx` is one (`ACTIVE_TAB` maps it to "Agenda").
- `TopTabs` accepts `swipeEnabled`, `lazy`, `tabBarPosition` and a custom `tabBar`, so the existing `BottomTabBar` (with its safe-area wrapper) is reused unchanged.
- The Agenda tab has a horizontal `ScrollView` (`CalendarStrip`) inside the pager. The book date step and Reschedule will have the `MonthCalendar`, which also handles horizontal drags.

## Design

### Route structure

`reschedule` cannot be a hidden tab, and it must stay under `(customer)` because `resolveAuthRedirect` decides access by the first `(group)` segment. So a `(tabs)` sub-group is added:

```
app/(customer)/_layout.tsx        bootstrap gating (ensureMyCustomer) + <Stack headerShown:false>
app/(customer)/reschedule.tsx     unchanged file, now a stack screen above the tabs
app/(customer)/(tabs)/_layout.tsx TopTabs + BottomTabBar (the current tab layout code)
app/(customer)/(tabs)/home.tsx, appointments.tsx, profile.tsx, book/*   moved with `git mv`
```

URLs do not change (groups are not part of the URL): `/home`, `/book`, `/appointments`, `/profile`, `/reschedule`. Relative imports in moved files gain one `../`. `ACTIVE_TAB` and the `reschedule` `Tabs.Screen` are deleted; while on `/reschedule` no tab bar is shown (a full-screen task with its own "Keep current time" action).

*Amendments (from code review):* the return after rescheduling uses `router.dismissTo("/appointments")`, because `router.replace` pushed a second tab navigator on top of the first (checked in the e2e by counting tab bars); `app/(customer)/_layout.tsx` exports `unstable_settings = { initialRouteName: "(tabs)" }` so a cold start or web refresh on `/reschedule` still has the tabs underneath; the reschedule `Screen` now includes the bottom edge because the tab bar no longer pads it.

### Tabs

`app/(customer)/(tabs)/_layout.tsx` uses `TopTabs`:

- `tabBarPosition="bottom"`, `tabBar` renders the current `BottomTabBar` inside the same `Screen edges={["bottom","left","right"]}` wrapper; `onSelect` still calls `navigation.navigate(key)`.
- `screenOptions`: `lazy: false` and `sceneStyle` with the `canvas` colour. *Amendment (during implementation):* the first draft used `lazy: true`, but a lazy page only mounts once the gesture reaches it, so the incoming page was blank while the finger dragged it in. All four screens now mount at startup (four light screens; their queries start together). A `ThemeProvider` in `app/_layout.tsx` sets the navigation theme background to `canvas`, because the default grey showed between pages.
- The bootstrap gating (`ensureMyCustomer`, error and loading states) stays in `app/(customer)/_layout.tsx`.

### Swipe lock on the calendar step

`MonthCalendar` needs horizontal drags, so on the book date step the pager must not steal them (the pager sits above the calendar and its capture handlers run first). The layout sets `swipeEnabled: isTabSwipeEnabled(usePathname())`, a small pure function that returns false for `/book/date` and true otherwise, with a unit test. The other booking steps (shop, barber, service, review) keep tab swipe: the nested stack state survives leaving and returning to the tab. Reschedule is outside the pager, so it needs no lock.

*Amendment (during implementation):* the first version read the nested stack state from `route.state` inside `screenOptions`, but expo-router only passes `{ name, key }` there, so the lock never engaged. The pathname is the reliable source.

### Month swipe

`MonthCalendar` wraps its root `View` in a `GestureDetector` with a native `Gesture.Pan()` from `react-native-gesture-handler` (`~2.32.0`, the version Expo Go 57 embeds; `GestureHandlerRootView` wraps the app in `app/_layout.tsx`):

- `activeOffsetX([-12, 12])` claims the gesture after 12 dp sideways, `failOffsetY([-25, 25])` lets vertical movement fail it, so taps on day cells and the arrows are untouched.
- **The calendar follows the finger.** The months of the booking window (two, sometimes three) sit side by side in a strip inside an `overflow: hidden` viewport (measured with `onLayout`); the strip's `translateX` is a Reanimated shared value driven from the pan's `onUpdate` on the UI thread, so the current month slides out and the neighbour slides in under the finger with no JS round trip. The claim distance is subtracted (`onStart` records it) so the strip does not jump when the pan activates.
- On end, `settleIndex` picks the page to settle on: a flick faster than 600 px/s decides the direction (the last movement wins over the distance dragged), otherwise the page changes once the drag passes 30% of a page, otherwise it snaps back. The strip animates there (`withTiming`, 220 ms) and the chosen month goes to React state through `runOnJS`; a cancelled gesture also snaps back. Dragging past the first or last month is damped (`rubberBand`, a quarter of the drag) and never changes month.
- The month arrows call the same `goTo` and animate the same strip. The month title and the arrows' enabled state follow the React state, so the title changes when the page is chosen (release), not mid-drag.
- Neighbouring pages are hidden from assistive technology and ignore touches (`importantForAccessibility`, `accessibilityElementsHidden`, `pointerEvents`). Before the first layout only the current month is rendered.
- Pure helpers in `src/lib/gestures/swipe.ts` (`rubberBand`, `settleIndex`, both `"worklet"` because they run on the UI thread) and `monthRange` in `src/lib/dates/month-calendar.ts`, unit tested. The component test plays whole pans with gesture-handler's `fireGestureHandler` and reaches the middle of a drag through the gesture's own `onStart`/`onUpdate` callbacks, because `fireGestureHandler` always closes the gesture.

*Amendment (found on a device):* the first version used React Native responder handlers, which worked on web but never on Android. Inside the tab pager, `react-native-pager-view`'s `NestedScrollableHost` calls `NativeGestureUtil.notifyNativeGestureStarted` as soon as a touch passes the touch slop, even with `scrollEnabled=false`, and React Native then sends `touchCancel` to the JS touch system: every JS responder or `PanResponder` gesture inside the pager is cancelled after about 8 dp (seen in the device log). A native pan is not cancelled. Verified on the device log: `gh active` then `gh end` with `success true` and translations of about ±120 to ±175 dp.

On web gesture-handler sets `touch-action: none` on the detector's view by default, which would stop a touch browser from scrolling the page over the calendar; the detector uses `touchAction="pan-y"` (asserted in the e2e with `toHaveCSS`).

The Jest reanimated mock gained `useEvent`, because gesture-handler takes its Reanimated path when a gesture callback is a worklet (the Babel plugin makes every inline `Gesture.X().onY(...)` one).

## Testing

- Jest: `swipeDirection` (thresholds, vertical-dominant, sign), the swipe-lock rule, `MonthCalendar` drag next/previous and limits.
- Playwright (web, touch-like drag with the mouse): dragging left on Home lands on Agendar and the tab bar updates; dragging right on Home stays put (first tab); on `/book/date` dragging left changes the month and does not change the tab; `/reschedule` still opens from an appointment and returns to Agenda.
- Existing e2e for booking, lifecycle and i18n must stay green.
- Full gate: `npm run verify`, `npm run test:e2e:web`, `npm run export:web`, then code review.

## Risks and open items

- The pager, and a horizontal `ScrollView` inside it (Agenda strip), behave differently on Android and iOS than on web. I can only verify web here; the user checks on the phone through Expo Go.
- Native checklist for the phone: on Android the pager may take horizontal drags from the Agenda day strip; on iOS the edge-back gesture of the nested `book` stack (barber, service, review steps) competes with the pager's right swipe.
- Web touch devices: neither the pager nor the calendar sets `touch-action`; the e2e drags with the mouse, not real touch events.
- `react-native-tab-view` is loaded through a dynamic `require` in `expo-router`; Metro must resolve it (checked by the bundle build).
- `reschedule` becomes a stack screen above the tabs (no tab bar underneath, back gesture returns to the previous screen). This is intended.
- Moving the tab screens into `(tabs)/` is a file move only; `git mv` keeps history, and the route-collision test guards URLs.
- Adds three dependencies: `react-native-tab-view`, `react-native-pager-view` and `react-native-gesture-handler` (installed with `npx expo install` so versions match SDK 57; the `3.1.0` that was in `node_modules` only as a transitive dev dependency of `react-native-screens` does not match Expo Go's native module).

## Out of scope

Owner navigation, animated month transitions, swipe between days, tab-bar indicator animation.
