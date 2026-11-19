# Feedback round 2 (after the 18/11 fixes) — design

Date: 2026-11-19
Status: approved in chat by the user on 2026-11-19 (relayed by the orchestrator session)
Source: the user tested PRs #104–#107 (feedback round 1) on the local stack, web and Expo Go

## Why

Everything from round 1 was confirmed working (login logo and eye, closed dates, two-step booking, colour persistence,
notification pop-up and taps, scheduled badge, switches). Three items remain; they ship as **one PR**.

## Scope

### 1. `DateField` is one box, not three

Today `src/components/ui/DateField.tsx` renders three separate bordered boxes: `[‹] [date] [›]`. It becomes **one**
bordered box with the same look as an `Input` (52px high, rounded, border, surface background):

- the date is centred in the box and tapping it still opens the calendar pop-up;
- the two arrows sit **inside** the same box at the left and right edges, as ghost buttons (no border of their own),
  each keeping a 44px tap target;
- unchanged: `step`, `min`/`max` (an arrow whose step leaves the range is dimmed and disabled), `disabledDates`,
  all testIDs (`<id>`, `<id>-prev`, `<id>-next`) and accessibility labels.

Only the owner Agenda uses it today.

### 2. Colour wheel does not drag in Expo (native)

In Expo Go the colour wheel and the brightness slider react to **taps** but not to a free **drag**. In the browser
(phone and PC) both work. The cause is **unknown** and only reproducible on a device.

What the code shows (read, not run):

- `src/components/domain/ColorWheelPopup.tsx` puts the wheel inside **two nested `Pressable`s** (backdrop, then card),
  both JS-responder touchables.
- The picker (`reanimated-color-picker`, `lib/module/components/Panels/PanelCore.js`, `Sliders/SliderCore.js`) builds
  `Gesture.Simultaneous(Gesture.Exclusive(pan, tap, longPress))` and moves the thumb in `onBegin` too, so a **tap works
  as soon as the touch begins** while the **pan never activates**: something else keeps the drag, which fits a parent
  touchable competing with the native gesture handler.
- The picker also wraps itself in its own `GestureHandlerRootView` (`ColorPicker.js`), and `ColorWheel.tsx` adds another
  one around it: two nested roots inside a `Modal`.
- The wheel is controlled (`value`), but `onCompleteJS` only fires on release, so nothing in our code changes `value`
  mid-drag; after release the picker re-syncs through a hex round trip (can nudge a thumb at very low saturation).

Plan of attack, cheapest first, stopping at the first one the user's Expo Go test confirms:

1. Restructure the pop-up: the backdrop is a **sibling** `Pressable` behind the card; the card is a plain `View` with no
   touch handlers; the wheel is given its colour **once at open** (not re-fed from the hex field).
2. If it still fails: drop our extra `GestureHandlerRootView` (the picker has its own).
3. If it still fails: render the picker **outside the `Modal`** (a temporary screen) to learn whether the `Modal` is the
   problem; then decide with the user (inline panel instead of a pop-up, or a wheel built without gesture-handler).

**This item cannot be verified in Jest or the browser** (the browser already works): it needs the user's Expo Go test.
The PR must say "restructured, awaiting device test", never "fixed".

### 3. Tapping the active tab goes back to that tab's root

Today, on the professional **Profile** tab, after opening Settings (`my-profile/settings`, a screen of a nested stack),
tapping the highlighted Profile icon does nothing. Same for the professional **Clients** tab (`clients/[id]`) and for the
customer **Book** flow (`book/service` … `book/review`).

Cause (verified in `node_modules/expo-router/build`): a nested stack pops to its root when the parent tab navigator emits
`tabPress` for its route and nobody calls `preventDefault()`
(`react-navigation/native-stack/navigators/createNativeStackNavigator.js:91`,
`standard-navigation/subscribePopToTopOnParentTabPress.js`). The stock tab bars emit `tabPress`
(`bottom-tabs/views/BottomTabBar.js:321`, `material-top-tabs/views/MaterialTopTabBar.js:123`). Our custom bars
(`app/(owner|professional|customer)/…/_layout.tsx` → `selectTab`) only call `navigateToTab`, which is a no-op on the
already focused tab, so the event never fires.

Fix: `selectTab` emits `tabPress` through the `emitter` the tab view passes to `tabBar`, then navigates only if the event
was not prevented **and** the tab is not already focused (the stock bar's behaviour). The nested stack then pops itself.

Behaviour per role afterwards:

- professional: Profile and Clients tabs return to their roots; Agenda and Earnings (no nested stack) unchanged;
- customer: Book returns to its first step (the flow lives in the URL, so tapping Book mid-flow restarts it — that is
  the standard "tap the active tab" meaning); Home, Agenda and Profile unchanged;
- owner: unchanged — its tab items already navigate to sibling routes (`highlight` in `app/(owner)/_layout.tsx`), and the
  event is emitted for the **target** route, which is never the focused one there.

## Decisions

- One PR, three independent commits-by-task; item 2 is shipped as a restructure plus a device checklist, not as a fix.
- No new dependency, no SQL.
- `DateField` keeps its public props; only its markup changes.

## Out of scope

Reworking the other pop-ups, a custom wheel without gesture-handler (only if the isolation steps point to
gesture-handler itself and the user agrees), changing what the Book flow remembers when restarted.

## Testing

- Jest/RNTL: `DateField` structure (one box containing both arrows and the date, tap targets, disabled state);
  `selectTab` (emits `tabPress`, navigates when not prevented, does not when prevented, does not re-navigate to the
  focused tab, unknown name does nothing); `ColorWheelPopup` structure (backdrop is a sibling, card has no handlers,
  wheel colour fixed at open).
- Playwright (web, mobile width): professional Profile → Settings → tap Profile → hub; professional Clients →
  client → tap Clients → list; customer Book → step 2 → tap Book → step 1; owner tab bar unchanged; `DateField`
  screenshot with computed-style checks (single border, arrows inside).
- Colour wheel on device: **manual**, by the user in Expo Go (checklist in the plan).
- Gates: typecheck, ROOT `npm run lint`, whole Jest suite, whole Playwright suite, re-run after the last commit.
