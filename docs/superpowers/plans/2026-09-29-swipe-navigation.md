# Swipe Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dragging sideways changes month in `MonthCalendar` and moves between the customer tabs Home, Agendar, Agenda and Perfil, with the page following the finger.

**Architecture:** Two pure helpers decide what a drag means and when tab swiping is locked. `MonthCalendar` uses plain responder handlers (no dependency) to turn a horizontal drag into the existing next/previous month actions. The customer tab layout moves into a `(tabs)` sub-group and switches from `Tabs` to expo-router's `TopTabs` (pager), keeping `BottomTabBar`; `(customer)/_layout` keeps the bootstrap guard and hosts `reschedule` as a stack screen above the tabs.

**Tech Stack:** Expo Router 57 (`TopTabs`), `react-native-tab-view`, `react-native-pager-view`, React Native responder events, Jest + RNTL, Playwright (web).

**Spec:** `docs/superpowers/specs/2026-09-29-swipe-navigation-design.md`

## Global Constraints

- Scope: customer app only. Owner screens untouched.
- Dependencies: only `react-native-tab-view` and `react-native-pager-view`, installed with `npx expo install` so versions match SDK 57. Do not add `@react-navigation/*` packages (expo-router vendors them).
- URLs stay `/home`, `/book`, `/appointments`, `/profile`, `/reschedule`; `(tabs)` is a route group and does not appear in URLs.
- Tab swipe follows the finger; month swipe switches on release. Month swipe claims a drag only when `|dx| > 20` and `|dx| > 2*|dy|`, and commits at `|dx| >= 40`.
- Tab swipe is disabled only while the `book` tab shows its `date` step (the calendar owns horizontal drags there).
- `resolveAuthRedirect` reads the first `(group)` segment; every customer route stays under `(customer)`.
- No hardcoded UI text (`tests/unit/no-hardcoded-text.test.ts` stays green). Colours and icons follow the existing tokens.
- TDD: test first, watch it fail, then implement.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

---

### Task 1: Gesture and tab-swipe helpers

**Files:**
- Create: `src/lib/gestures/swipe.ts`
- Create: `src/lib/navigation/tab-swipe.ts`
- Test: `tests/unit/swipe.test.ts`, `tests/unit/tab-swipe.test.ts`

**Interfaces:**
- Produces:
  - `isHorizontalDrag(dx: number, dy: number): boolean`
  - `swipeDirection(dx: number, dy: number): "next" | "previous" | null` (`dx < 0` is `next`, the finger moving left)
  - `nestedRouteName(route: unknown): string | undefined` (focused screen name of a nested navigator, from `route.state`)
  - `isTabSwipeEnabled(routeName: string, nestedName?: string): boolean`

- [ ] **Step 1: Write the failing tests**

`tests/unit/swipe.test.ts`:

```ts
import { isHorizontalDrag, swipeDirection } from "../../src/lib/gestures/swipe";

describe("isHorizontalDrag", () => {
  it.each([
    [30, 0, true],
    [-30, 5, true],
    [20, 0, false],
    [30, 20, false],
    [0, 60, false],
  ])("dx %p dy %p -> %p", (dx, dy, expected) => {
    expect(isHorizontalDrag(dx, dy)).toBe(expected);
  });
});

describe("swipeDirection", () => {
  it.each([
    [-40, 0, "next"],
    [-120, 30, "next"],
    [40, 0, "previous"],
    [90, -20, "previous"],
    [-39, 0, null],
    [39, 0, null],
    [-80, 60, null],
    [0, 0, null],
  ])("dx %p dy %p -> %p", (dx, dy, expected) => {
    expect(swipeDirection(dx, dy)).toBe(expected);
  });
});
```

`tests/unit/tab-swipe.test.ts`:

```ts
import { isTabSwipeEnabled, nestedRouteName } from "../../src/lib/navigation/tab-swipe";

describe("nestedRouteName", () => {
  it("returns the focused screen of a nested navigator", () => {
    expect(nestedRouteName({ name: "book", state: { index: 1, routes: [{ name: "index" }, { name: "date" }] } })).toBe("date");
  });

  it("defaults to the first route when the index is missing", () => {
    expect(nestedRouteName({ name: "book", state: { routes: [{ name: "index" }] } })).toBe("index");
  });

  it("returns undefined before the nested navigator has state", () => {
    expect(nestedRouteName({ name: "book" })).toBeUndefined();
  });
});

describe("isTabSwipeEnabled", () => {
  it("locks the pager on the booking date step only", () => {
    expect(isTabSwipeEnabled("book", "date")).toBe(false);
    expect(isTabSwipeEnabled("book", "index")).toBe(true);
    expect(isTabSwipeEnabled("book", "review")).toBe(true);
    expect(isTabSwipeEnabled("book")).toBe(true);
    expect(isTabSwipeEnabled("home", "date")).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx jest tests/unit/swipe.test.ts tests/unit/tab-swipe.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/lib/gestures/swipe.ts`:

```ts
const CLAIM_PX = 20;
const COMMIT_PX = 40;

export function isHorizontalDrag(dx: number, dy: number) {
  return Math.abs(dx) > CLAIM_PX && Math.abs(dx) > 2 * Math.abs(dy);
}

export function swipeDirection(dx: number, dy: number): "next" | "previous" | null {
  if (!isHorizontalDrag(dx, dy) || Math.abs(dx) < COMMIT_PX) return null;

  return dx < 0 ? "next" : "previous";
}
```

`src/lib/navigation/tab-swipe.ts`:

```ts
type NestedState = { index?: number; routes: { name: string }[] };

export function nestedRouteName(route: unknown) {
  const state = (route as { state?: NestedState }).state;

  return state?.routes[state.index ?? 0]?.name;
}

// The book date step hosts MonthCalendar, which needs horizontal drags for itself.
export function isTabSwipeEnabled(routeName: string, nestedName?: string) {
  return !(routeName === "book" && nestedName === "date");
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx jest tests/unit/swipe.test.ts tests/unit/tab-swipe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib tests/unit/swipe.test.ts tests/unit/tab-swipe.test.ts
git commit -m "feat(navigation): swipe and tab-swipe lock helpers"
```

---

### Task 2: Month swipe in MonthCalendar

**Files:**
- Modify: `src/components/domain/MonthCalendar.tsx`
- Test: `tests/unit/month-calendar-component.test.ts`

**Interfaces:**
- Consumes: `isHorizontalDrag`, `swipeDirection` from Task 1.
- Produces: `MonthCalendar` root `View` now has `testID` default `month-calendar` and responder handlers: `onStartShouldSetResponderCapture` records the touch start and returns `false`; `onMoveShouldSetResponderCapture` returns `isHorizontalDrag(dx, dy)`; `onResponderRelease` calls next or previous month by `swipeDirection`, guarded by `canGoForward`/`canGoBack`.

- [ ] **Step 1: Write the failing tests.** Add to `tests/unit/month-calendar-component.test.ts` (uses the file's existing `renderCalendar`, today `2026-09-28`; a `drag` helper drives the handlers exactly as the responder system would):

```ts
import { act } from "@testing-library/react-native";

async function drag(view: Awaited<ReturnType<typeof renderCalendar>>, from: [number, number], to: [number, number]) {
  const props = view.getByTestId("month-calendar").props;
  const at = ([pageX, pageY]: [number, number]) => ({ nativeEvent: { pageX, pageY } });

  props.onStartShouldSetResponderCapture(at(from));
  const claimed = props.onMoveShouldSetResponderCapture(at(to));

  await act(async () => props.onResponderRelease(at(to)));

  return claimed;
}

describe("MonthCalendar swipe", () => {
  it("goes to the next month when dragged left", async () => {
    const view = await renderCalendar();

    expect(await drag(view, [300, 200], [180, 205])).toBe(true);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("goes back when dragged right", async () => {
    const view = await renderCalendar();

    await fireEvent.press(view.getByTestId("month-calendar-next"));
    await drag(view, [100, 200], [230, 200]);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("stops at the last month of the window and at the current month", async () => {
    const view = await renderCalendar();

    await drag(view, [100, 200], [230, 200]);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");

    await drag(view, [300, 200], [180, 200]);
    await drag(view, [300, 200], [180, 200]);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("ignores a mostly vertical drag and a short one", async () => {
    const view = await renderCalendar();

    expect(await drag(view, [300, 100], [250, 300])).toBe(false);
    expect(await drag(view, [300, 200], [280, 200])).toBe(false);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx jest tests/unit/month-calendar-component.test.ts`
Expected: FAIL, `getByTestId("month-calendar")` finds no element (no default testID / handlers).

- [ ] **Step 3: Implement.** In `src/components/domain/MonthCalendar.tsx`:

Add imports: `import { useRef } from "react";` (merge with the existing `react` import), `import type { GestureResponderEvent } from "react-native";` (merge with the `react-native` import) and `import { isHorizontalDrag, swipeDirection } from "../../lib/gestures/swipe";`.

Inside the component, after `canGoForward`:

```tsx
  const start = useRef({ x: 0, y: 0 });
  const delta = (event: GestureResponderEvent) => ({
    dx: event.nativeEvent.pageX - start.current.x,
    dy: event.nativeEvent.pageY - start.current.y,
  });
  const goForward = () => setMonth(addMonths(month, 1));
  const goBack = () => setMonth(addMonths(month, -1));
```

Change the two arrow `onPress` handlers to `onPress={goBack}` and `onPress={goForward}`. Change the root element to:

```tsx
    <View
      className="w-full max-w-[420px] select-none gap-2"
      onMoveShouldSetResponderCapture={(event) => {
        const { dx, dy } = delta(event);

        return isHorizontalDrag(dx, dy);
      }}
      onResponderRelease={(event) => {
        const { dx, dy } = delta(event);
        const direction = swipeDirection(dx, dy);

        if (direction === "next" && canGoForward) goForward();
        if (direction === "previous" && canGoBack) goBack();
      }}
      onStartShouldSetResponderCapture={(event) => {
        start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };

        return false;
      }}
      testID={testID ?? "month-calendar"}
    >
```

(The capture handlers let the calendar take a horizontal drag away from a day cell while taps still reach the cells.)

- [ ] **Step 4: Run and confirm pass**

Run: `npx jest tests/unit/month-calendar-component.test.ts tests/unit/no-hardcoded-text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/domain/MonthCalendar.tsx tests/unit/month-calendar-component.test.ts
git commit -m "feat(calendar): swipe sideways to change month"
```

---

### Task 3: Swipeable tabs

**Files:**
- Modify: `package.json`, `package-lock.json` (two dependencies)
- Move: `app/(customer)/{home,appointments,profile}.tsx` and `app/(customer)/book/` into `app/(customer)/(tabs)/`
- Create: `app/(customer)/(tabs)/_layout.tsx`
- Modify: `app/(customer)/_layout.tsx` (guard + Stack)
- Test: `tests/e2e/swipe.web.spec.ts`

**Interfaces:**
- Consumes: `isTabSwipeEnabled`, `nestedRouteName` from Task 1; `BottomTabBar`, `Screen`.
- Produces: routes unchanged; tab bar test ids `tab-home|book|appointments|profile` unchanged.

- [ ] **Step 1: Write the failing e2e** in `tests/e2e/swipe.web.spec.ts`

```ts
import { expect, test } from "@playwright/test";

import { isHistoryQuery, json, appointmentRow, mockCustomerRest, signInAsCustomer } from "./customer-helpers";

async function drag(page: import("@playwright/test").Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(...to, { steps: 4 });
  await page.mouse.up();
}

test.use({ viewport: { height: 700, width: 390 } });

test("dragging sideways moves between the tabs", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/appointments")) {
      await json(route, isHistoryQuery(url) ? [] : [appointmentRow()]);
      return true;
    }
  });
  await page.goto("/home");
  await expect(page.getByTestId("tab-home")).toBeVisible();

  await drag(page, [330, 300], [60, 300]);
  await expect(page.getByTestId("tab-book")).toHaveAttribute("aria-selected", "true");

  await drag(page, [60, 300], [330, 300]);
  await expect(page.getByTestId("tab-home")).toHaveAttribute("aria-selected", "true");

  await drag(page, [60, 300], [330, 300]);
  await expect(page.getByTestId("tab-home")).toHaveAttribute("aria-selected", "true");
});

test("on the booking date step a drag changes the month, not the tab", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/barber_services")) {
      await json(route, [{ duration_override_minutes: null, id: "33333333-3333-4333-8333-333333333333", price_override_cents: null, service_id: "s", services: { duration_minutes: 30, name: "Corte", price_cents: 4000 } }]);
      return true;
    }
  });
  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Corte" }).click();
  await expect(page.getByTestId("month-calendar-title")).toBeVisible();
  const before = await page.getByTestId("month-calendar-title").innerText();

  await drag(page, [330, 300], [60, 300]);

  await expect(page.getByTestId("month-calendar-title")).not.toHaveText(before);
  await expect(page.getByTestId("tab-book")).toHaveAttribute("aria-selected", "true");
});
```

Before running, open `src/components/domain/BottomTabBar.tsx` and confirm the tab `Pressable` exposes `aria-selected` on web (via `accessibilityState={{ selected }}`); if it does not, assert on `accessibilityState` through `toHaveAttribute("aria-selected", ...)` after adding that state to the item (it is a one-line accessibility improvement) or assert the visible heading of the target screen instead.

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:e2e:web`
Expected: the two new tests FAIL (no pager: the first drag does nothing, the second changes the month only if the calendar handles it, but the first test's assertion on `tab-book` fails); the other 36 pass. Restore `tsconfig.json` afterwards with `git checkout tsconfig.json`.

- [ ] **Step 3: Install the pager dependencies**

Run: `npx expo install react-native-tab-view react-native-pager-view`
Expected: both added to `package.json` at SDK 57 versions (`react-native-pager-view` 8.0.2). Then `git checkout tsconfig.json` if Expo edited it.

- [ ] **Step 4: Move the tab screens into `(tabs)`**

```bash
mkdir "app/(customer)/(tabs)"
git mv "app/(customer)/home.tsx" "app/(customer)/appointments.tsx" "app/(customer)/profile.tsx" "app/(customer)/book" "app/(customer)/(tabs)/"
sed -i 's#"\.\./\.\./src/#"../../../src/#g' "app/(customer)/(tabs)/home.tsx" "app/(customer)/(tabs)/appointments.tsx" "app/(customer)/(tabs)/profile.tsx"
sed -i 's#"\.\./\.\./\.\./src/#"../../../../src/#g' "app/(customer)/(tabs)/book/"*.tsx
```

Then check no relative import is left pointing at the old depth: `npm run typecheck` must report no "Cannot find module" errors in `app/`.

- [ ] **Step 5: Create `app/(customer)/(tabs)/_layout.tsx`**

```tsx
import { TopTabs } from "expo-router/js-top-tabs";
import { CalendarDays, CalendarPlus, House, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { BottomTabBar } from "../../../src/components/domain/BottomTabBar";
import { Screen } from "../../../src/components/ui/Screen";
import { isTabSwipeEnabled, nestedRouteName } from "../../../src/lib/navigation/tab-swipe";

export default function TabsLayout() {
  const { t } = useTranslation();
  const items = [
    { icon: House, key: "home", label: t("tabs.home") },
    { icon: CalendarPlus, key: "book", label: t("tabs.book") },
    { icon: CalendarDays, key: "appointments", label: t("tabs.agenda") },
    { icon: User, key: "profile", label: t("tabs.profile") },
  ];

  return (
    <TopTabs
      screenOptions={({ route }) => ({
        lazy: true,
        swipeEnabled: isTabSwipeEnabled(route.name, nestedRouteName(route)),
      })}
      tabBar={({ navigation, state }) => (
        // Tab screens skip the bottom edge; the bar owns it so the system navigation area isn't padded twice.
        <Screen className="bg-surface" edges={["bottom", "left", "right"]}>
          <BottomTabBar
            activeKey={state.routes[state.index].name}
            items={items}
            onSelect={(key) => navigation.navigate(key)}
          />
        </Screen>
      )}
      tabBarPosition="bottom"
    >
      <TopTabs.Screen name="home" />
      <TopTabs.Screen name="book" />
      <TopTabs.Screen name="appointments" />
      <TopTabs.Screen name="profile" />
    </TopTabs>
  );
}
```

- [ ] **Step 6: Slim `app/(customer)/_layout.tsx`** to the guard plus a stack: remove the `Tabs`, `BottomTabBar`, `items`, `ACTIVE_TAB`, `useTranslation` icon imports that are no longer used (keep `useTranslation` for the two texts in the error state), and replace the final `return <Tabs ...>` with:

```tsx
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reschedule" />
    </Stack>
  );
```

with `import { Stack } from "expo-router";` replacing `import { Tabs } from "expo-router";`.

- [ ] **Step 7: Run everything and fix what breaks**

Run: `npm run typecheck && npm run lint && npx jest tests/unit/route-collisions.test.ts tests/unit/no-hardcoded-text.test.ts && npm run test:e2e:web`
Expected: all PASS, including the two new specs and the existing booking, lifecycle (reschedule) and i18n specs. If the mouse drag does not move the web pager, log what `react-native-tab-view` renders on web (`swipeEnabled`, `PanResponderAdapter`) before changing the test. `git checkout tsconfig.json` afterwards.

- [ ] **Step 8: Commit**

```bash
git add app tests package.json package-lock.json
git commit -m "feat(navigation): swipeable customer tabs with a pager"
```

---

> **Amendment (during execution):** `screenOptions` receives `route` with only `name` and `key`, so `nestedRouteName` could not work. The lock became `isTabSwipeEnabled(pathname: string)` (false for `/book/date`), fed by `usePathname()` in `(tabs)/_layout.tsx`; `nestedRouteName` was dropped. `BottomTabBar` also gained `aria-selected` because React Native Web does not map `accessibilityState.selected`, which the e2e needs. The e2e drag for the tab test starts in an empty area (a drag that starts and ends on one button is a DOM click).

### Task 4: Verify, document, review, ship

**Files:**
- Modify: `docs/project-status.md`

- [ ] **Step 1: Visual check.** Start the web app with the local env, open Home at 390x700: the tab bar is at the bottom with safe-area padding, the page slides while dragging, and the Agenda tab's horizontal strip still scrolls. Screenshot each tab; check computed styles rather than trusting screenshots alone. Note honestly what was only checked on web.
- [ ] **Step 2: Bundle check.** With Metro running, `curl` the Android bundle URL and expect HTTP 200 (catches a missing native module or import error), then serve it to the phone from the port-8082 Metro for the user to confirm on the device.
- [ ] **Step 3: Full gate.** `npm run verify`, `npm run test:e2e:web`, `npm run export:web`; restore `tsconfig.json`. If pgTAP still fails only on the extra local customer, say so; do not reset the user's database.
- [ ] **Step 4: Docs.** Add a "Task 17 — swipe navigation" line and a verification block (real numbers) to `docs/project-status.md`.
- [ ] **Step 5: Review.** Invoke `requesting-code-review` on `origin/main..HEAD` with the spec and this plan as requirements; fix Critical and Important findings; re-run the gate.
- [ ] **Step 6: Ship.** Push `feat-month-calendar` and open a PR against `main` (no force-push; merge only when the user asks).
