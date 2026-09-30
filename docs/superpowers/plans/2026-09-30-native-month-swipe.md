# Native Month Swipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the month swipe in `MonthCalendar` work on Android inside the tab pager, where the current responder-based swipe is cancelled after ~8 dp.

**Architecture:** `react-native-pager-view` (Android `NestedScrollableHost`) calls `NativeGestureUtil.notifyNativeGestureStarted` as soon as a touch passes the touch slop, even with `scrollEnabled=false`; React Native then cancels the JS touch (`touchCancel`), so any JS responder or `PanResponder` gesture inside the pager dies. A native gesture survives it. `MonthCalendar` therefore drives the month swipe with `react-native-gesture-handler`'s `Gesture.Pan()` inside a `GestureDetector`, and the app root is wrapped in `GestureHandlerRootView`. The thresholds and direction logic stay in `swipeDirection`.

**Tech Stack:** `react-native-gesture-handler` `~2.32.0` (the version Expo Go 57 embeds), Jest + RNTL + gesture-handler's `jest-utils`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-swipe-navigation-design.md` (this plan replaces its "Month swipe" mechanism; a spec amendment is part of Task 3).

## Global Constraints

- Install the SDK-matched version with `npx expo install react-native-gesture-handler` (`~2.32.0`). The `3.1.0` that was in `node_modules` is only a transitive dev dependency of `react-native-screens` and does not match Expo Go's native module; it must not be imported.
- Keep the behaviour from the design: the pan claims a drag only when it is clearly horizontal, commits at `|dx| >= 40` with `|dx| > 2*|dy|` (`swipeDirection`), switches on release, respects `canGoBack` / `canGoForward`, and the arrow buttons keep working.
- Taps on day cells and arrows must still work.
- Callbacks call `setState`, so the gesture uses `.runOnJS(true)`.
- No hardcoded UI text; TDD; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Evidence that the fix works on Android comes from the device log (Metro output), not from the web e2e.

---

### Task 1: Dependency, jest setup, gesture root

**Files:**
- Modify: `package.json`, `package-lock.json` (already done while planning: `react-native-gesture-handler ~2.32.0`)
- Modify: `jest.setup.ts` (load the gesture-handler jest mocks)
- Modify: `app/_layout.tsx` (wrap `RootLayout` in `GestureHandlerRootView`)
- Test: `tests/unit/root-layout.test.ts`

**Interfaces:**
- Produces: `RootLayout` renders `<GestureHandlerRootView style={{ flex: 1 }}>` around `AppProviders`.

- [ ] **Step 1: Confirm the dependency.** `node -e "console.log(require('react-native-gesture-handler/package.json').version)"` prints `2.32.0`; `git diff package.json` shows the single added line.

- [ ] **Step 2: Write the failing test.** In `tests/unit/root-layout.test.ts` extend the `jest.mock("../../src/providers/AppProviders", ...)` factory with `AppProviders: ({ children }: { children: unknown }) => children`, import `RootLayout` next to `RootNavigator`, and add:

```ts
import { GestureHandlerRootView } from "react-native-gesture-handler";

it("wraps the app in a gesture root so native gestures work inside the pager", async () => {
  mockedUseFonts.mockReturnValue([true, null] as never);
  mockedUseSupabaseSession.mockReturnValue({ isLoading: false, profile: null, session: null, supabase: {} as never });

  const view = await render(React.createElement(RootLayout));

  expect(view.UNSAFE_getByType(GestureHandlerRootView)).toBeTruthy();
});
```

- [ ] **Step 3: Run it and confirm failure.** `npx jest tests/unit/root-layout.test.ts` → the new test fails (no `GestureHandlerRootView` in the tree).

- [ ] **Step 4: Implement.** In `app/_layout.tsx`:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";
```
and

```tsx
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </GestureHandlerRootView>
  );
}
```
with `root: { flex: 1 }` added to `styles`. In `jest.setup.ts` add `import "react-native-gesture-handler/jestSetup";` after the existing imports.

- [ ] **Step 5: Run it and confirm it passes.** `npx jest tests/unit/root-layout.test.ts` → PASS; `npm run typecheck` clean.

- [ ] **Step 6: Commit.**

```bash
git add package.json package-lock.json jest.setup.ts app/_layout.tsx tests/unit/root-layout.test.ts
git commit -m "feat(navigation): gesture-handler root so native gestures work inside the pager"
```

---

### Task 2: Month swipe with a native pan gesture

**Files:**
- Modify: `src/components/domain/MonthCalendar.tsx`
- Test: `tests/unit/month-calendar-component.test.ts` (replace the responder-driven `drag` helper and the `MonthCalendar swipe` tests)

**Interfaces:**
- Consumes: `swipeDirection` from `src/lib/gestures/swipe.ts`; `Gesture`, `GestureDetector`, `State` from `react-native-gesture-handler`; `fireGestureHandler`, `getByGestureTestId` from `react-native-gesture-handler/jest-utils`.
- Produces: `MonthCalendar` root is wrapped in `<GestureDetector gesture={pan}>`; the pan has test id `month-swipe`.

- [ ] **Step 1: Write the failing tests.** Replace the `drag` helper and the `MonthCalendar swipe` describe block at the end of `tests/unit/month-calendar-component.test.ts` with:

```ts
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

// Plays the native pan: began, active, then ended with the total translation.
async function drag(translationX: number, translationY = 0) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId("month-swipe"), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX, translationY },
      { state: State.END, translationX, translationY },
    ]);
  });
}

describe("MonthCalendar swipe", () => {
  it("goes to the next month when dragged left", async () => {
    const view = await renderCalendar();

    await drag(-120, 5);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("goes back when dragged right", async () => {
    const view = await renderCalendar();

    await fireEvent.press(view.getByTestId("month-calendar-next"));
    await drag(130);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("stops at the current month and at the last month of the window", async () => {
    const view = await renderCalendar();

    await drag(130);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");

    await drag(-120);
    await drag(-120);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("ignores a short drag and a mostly vertical one", async () => {
    const view = await renderCalendar();

    await drag(-30);
    await drag(-80, 60);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("does nothing when the gesture is cancelled", async () => {
    const view = await renderCalendar();

    await act(async () => {
      fireGestureHandler(getByGestureTestId("month-swipe"), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: -120, translationY: 0 },
        { state: State.CANCELLED, translationX: -120, translationY: 0 },
      ]);
    });

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });
});
```

Delete the two tests that only made sense for the responder handlers ("ignores a gesture that never started inside the calendar", "forgets the start once a gesture is released") together with the old `drag`. Drop the `jest.requireActual`-free imports that become unused.

- [ ] **Step 2: Run them and confirm failure.** `npx jest tests/unit/month-calendar-component.test.ts` → the swipe tests fail (no gesture with test id `month-swipe`); the non-swipe tests still pass.

- [ ] **Step 3: Implement.** In `src/components/domain/MonthCalendar.tsx` remove the `useRef`, `GestureResponderEvent` and `isHorizontalDrag` imports and everything responder-related (`start`, `delta`, the four `onMove/onResponder/onStart` props), import the gesture API, and build the pan:

```tsx
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { swipeDirection } from "../../lib/gestures/swipe";
```

```tsx
  // A native gesture: inside the Android pager a JS responder is cancelled after ~8 dp (see the plan for why).
  const swipe = Gesture.Pan()
    .withTestId("month-swipe")
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-25, 25])
    .onEnd((event, success) => {
      if (!success) return;

      const direction = swipeDirection(event.translationX, event.translationY);

      if (direction === "next" && canGoForward) goForward();
      if (direction === "previous" && canGoBack) goBack();
    });
```

and return `<GestureDetector gesture={swipe}><View className="w-full max-w-[420px] select-none gap-2" testID={testID ?? "month-calendar"}>…</View></GestureDetector>` (same children as today).

- [ ] **Step 4: Run and confirm pass.** `npx jest tests/unit/month-calendar-component.test.ts tests/unit/no-hardcoded-text.test.ts tests/unit/swipe.test.ts` → PASS; `npm run typecheck && npm run lint` clean. If `fireGestureHandler` does not reach `onEnd` with `success`, log the calls before changing the test's intent.

- [ ] **Step 5: Commit.**

```bash
git add src/components/domain/MonthCalendar.tsx tests/unit/month-calendar-component.test.ts
git commit -m "fix(calendar): month swipe as a native pan gesture that survives the Android pager"
```

---

### Task 3: Prove it on web and on the device, document, ship

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-swipe-navigation-design.md`, `docs/project-status.md`

- [ ] **Step 1: Web e2e.** `npm run test:e2e:web` must stay at 38 passed. The existing `swipe.web.spec.ts` "on the booking date step a drag changes the month, not the tab" now exercises the gesture-handler pan (pointer events). If it fails on web, gesture-handler needs `touch-action` handling: fix before continuing.
- [ ] **Step 2: Device evidence.** With the Metro on port 8082 running the current branch, add one temporary `console.log("SWIPEDBG end", ...)` in the pan `onEnd` (not committed), ask the user to drag left on the date step, and read the Metro log. Expected: `SWIPEDBG end` with `success true`, `translationX` near the drag length, and the title moves to the next month. Remove the log.
- [ ] **Step 3: Docs.** In the spec, replace the "Month swipe" mechanism paragraph with the gesture-handler design and the root-cause note (pager `NestedScrollableHost` cancels JS touches); add the dependency to the list. In `docs/project-status.md`, add the verification lines with real numbers and what was checked on the device.
- [ ] **Step 4: Full gate, review, ship.** `npm run verify`, `npm run test:e2e:web`, `npm run export:web`; request a code review of `4b77c4e..HEAD`; fix findings; push `feat-month-calendar` (PR #5 updates); do not merge without being asked.
