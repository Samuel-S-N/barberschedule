# Feedback round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three leftovers from the first feedback round, one PR: (1) `DateField` becomes a single bordered box with the arrows inside; (2) restructure the colour-wheel pop-up so its drag has a chance to work in Expo Go (restructure only, **not verifiable here**); (3) tapping the active tab returns that tab's nested stack to its root.

**Architecture:** (1) Markup change in one component. (2) The pop-up's backdrop becomes a sibling `Pressable` behind a plain `View` card, and the wheel gets its start colour once at open. (3) `selectTab` emits the `tabPress` event through the `emitter` that expo-router passes to a custom `tabBar`, then navigates only if the event was not prevented and the tab is not already focused; React Navigation's own native-stack listener pops the nested stack. No dependency, no SQL.

**Tech Stack:** Expo SDK 58 / expo-router 58.0.27 (`Tabs`, `expo-router/js-top-tabs`), React Native 0.88 / react-native-web, `react-native-gesture-handler` 3.3.0, `reanimated-color-picker` 5.1.4, NativeWind, Jest (jest-expo, RNTL 14 async `render`), Playwright (system Chrome).

**Spec:** `docs/superpowers/specs/2026-11-19-feedback-2-design.md`

**Branch:** `feat-feedback-2-fixes`, cut from `main` (after PRs #104–#107). One PR.

## Findings that change the brief (spec/orchestrator text vs the code)

1. **There is no `navigation` prop in a custom `tabBar`.** The brief said to "pass `navigation` from the three layouts' tabBar props". In expo-router 58 the props are `{ state, descriptors, emitter, navigateToTab, insets }` (`BottomTabBarProps`, `node_modules/expo-router/build/react-navigation/bottom-tabs/types.d.ts:334`; `MaterialTopTabBarProps` adds the pager props, `…/material-top-tabs/types.d.ts:239`). Both tab views build them from `emitter` and `navigateToTab` (`BottomTabView.js:213`, `MaterialTopTabView.js:57`) for `Tabs` **and** for `expo-router/js-top-tabs`' `TopTabs`. The event is therefore emitted with `emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true })`, exactly like the stock bars (`BottomTabBar.js:321`, `MaterialTopTabBar.js:123`). `navigation.emit` is not available, and not needed.
2. **The nested stack really does listen**, in both stack implementations: `createNativeStackNavigator.js:91` (`navigation.addListener('tabPress', …)` → `StackActions.popToTop()` when `state.index > 0`, the stack is focused and `!e.defaultPrevented`, run in the next animation frame) and `standard-navigation/subscribePopToTopOnParentTabPress.js`. So the alternative from the brief (`router.dismissTo(tabRootHref)`) is **not** needed; it stays the documented fallback if a device test shows the event does not reach the stack.
3. **Do not call `preventDefault()`** on the event: that is the one thing that would cancel the pop.
4. **The stock bar does not navigate to the already focused tab** (`BottomTabBar.js:324`: `if (!focused && !event.defaultPrevented)`); our `selectTab` did, which is harmless but redundant. The new `selectTab` copies the stock rule.
5. **Owner "Profile" is a nested stack too** (`app/(owner)/owner-profile/_layout.tsx`, declared as a `Tabs.Screen` in `ACCOUNT_SCREENS`), yet already behaves because the bar item `settings` is a *different* route (`highlight()` maps `owner-profile` to the `settings` item): pressing it navigates there. With the new code the event is emitted for the **target** route (`settings`), which is never the focused one while the user is inside `owner-profile`, so nothing changes for the owner. The e2e in Task 3 pins that.
6. **Customer `me/*` screens are outside the tabs** (root `Stack` of `(customer)`), so nothing to do there; the **Book** tab is the only nested stack of the customer (`app/(customer)/(tabs)/book/_layout.tsx`), plus nothing else.
7. **The colour-wheel "taps work, drag does not" pattern has a specific meaning in the picker's code:** every panel/slider calls its update function in `onBegin` (touch down), then `onUpdate` while panning; `Gesture.Exclusive(pan, tap, longPress)`. A tap therefore always moves the thumb; a drag that moves nothing means the **Pan never activates** — something else holds the touch. See Task 4.

## Open questions for the orchestrator

1. **Which OS was the wheel tested on in Expo Go (iOS, Android, both)?** The nested-`Pressable` hypothesis and the Modal-root-view hypothesis behave differently per platform; the device checklist in Task 4 asks the user to note it.
2. **Tapping Book mid-flow restarts the booking flow** (the flow state lives in the URL/params of the nested stack). That is the standard meaning of "tap the active tab" and the user asked for it; flagging it because a customer could lose a half-made booking with one tap.
3. **If the wheel still does not drag after steps 1–2 of Task 4,** the next move (inline panel instead of a pop-up, or a wheel built without gesture-handler) changes the look/behaviour and needs the user's decision; the plan stops there and reports.
4. **Task 2 changes `selectTab`'s signature** (from `(state, navigateToTab, name)` to `({ emitter, navigateToTab, state }, name)`); it has three callers, all updated in the same commit.

## Global Constraints

- `DateField`: one bordered box, same look as an `Input` (`h-input-height` = 52px, `rounded-xl`, `border border-neutral-200`, `bg-surface`); date centred; arrows **inside** at the left/right edges as ghost buttons (no own border), each **44px** tap target; tapping the date opens the calendar pop-up; keep `step`, `min`/`max` (arrow dimmed + disabled when its step leaves the range), `disabledDates`, testIDs `<id>`, `<id>-prev`, `<id>-next`, and the a11y labels. Only the owner Agenda uses it.
- Colour wheel: tap-outside-closes, X top-right, Done, centred card (project pop-up style) all stay. **Not verifiable in Jest or the browser**; the PR says "restructured, needs Expo Go test", never "fixed".
- Tab press: tapping the **active** tab returns its nested stack to the root; other tabs keep switching exactly as before; never `preventDefault()` the event.
- Project conventions: no hard-coded text; colours by tokens; `className` only on plain RN elements; tests in `tests/unit/*.test.ts` with `React.createElement` and async `render`; Playwright with the system Chrome and `.env.local` moved aside (see `reference_local_dev_gotchas`).
- **Gate per task:** `npm run typecheck`, `./node_modules/.bin/eslint app src tests scripts`, the Jest files named (read the `Test Suites:` line, not only `Tests:`; a suite that fails to run shows there). **Final gate (Task 5):** `npm run typecheck`, ROOT `npm run lint` (read the real output and exit code; `npm run lint; echo exit=$?`, never `| tail`), whole `npx jest --runInBand`, whole Playwright suite, **all re-run after the last commit**, then browser screenshots.

## File structure

| File | Responsibility |
|---|---|
| `src/components/ui/DateField.tsx` (modify) | one bordered box, arrows inside |
| `tests/unit/date-field.test.ts` (modify) | structure tests added; behaviour tests unchanged |
| `src/lib/navigation/select-tab.ts` (modify) | emit `tabPress`, navigate unless prevented / focused |
| `tests/unit/select-tab.test.ts` (modify) | new signature and the four behaviours |
| `app/(owner)/_layout.tsx`, `app/(professional)/_layout.tsx`, `app/(customer)/(tabs)/_layout.tsx` (modify) | pass `{ emitter, navigateToTab, state }` |
| `tests/e2e/tab-press-root.web.spec.ts` (new) | professional Profile + Clients, customer Book, owner unchanged |
| `src/components/domain/ColorWheelPopup.tsx` (modify) | sibling backdrop, plain-`View` card, start colour fixed at open |
| `tests/unit/color-wheel-popup.test.ts` (modify) | structure + fixed start colour |
| `docs/superpowers/plans/2026-11-19-feedback-2-fixes.md` | this plan (device checklist in Task 4) |

---

### Task 1: `DateField` as a single box

**Files:**
- Modify: `src/components/ui/DateField.tsx`
- Test: `tests/unit/date-field.test.ts`

**Interfaces:** unchanged props (`DateFieldProps`). New testID `${testID}-box` on the single container. Existing `${testID}`, `${testID}-prev`, `${testID}-next` keep their meaning.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe("DateField", …)` of `tests/unit/date-field.test.ts`; it already has the `show()` helper and `i18n` set up)

```ts
  const isInside = (node: { parent: unknown }, testID: string) => {
    let current = node as { parent: { props?: { testID?: string }; parent: unknown } | null };

    while (current.parent) {
      if (current.parent.props?.testID === testID) return true;
      current = current.parent as typeof current;
    }

    return false;
  };

  it("is ONE bordered box with the date and both arrows inside it", async () => {
    const { view } = await show();

    expect(view.getByTestId("df-box").props.className).toContain("border");
    for (const id of ["df-prev", "df", "df-next"]) expect(isInside(view.getByTestId(id), "df-box")).toBe(true);
  });

  it("the arrows are ghost buttons inside the box: no border of their own, 44px tap targets", async () => {
    const { view } = await show();

    for (const id of ["df-prev", "df-next"]) {
      const className = view.getByTestId(id).props.className as string;

      expect(className).not.toContain("border");
      expect(className).toContain("h-11");
      expect(className).toContain("w-11");
    }
  });

  it("the date button has no border of its own and centres the date", async () => {
    const { view } = await show();
    const className = view.getByTestId("df").props.className as string;

    expect(className).not.toContain("border");
    expect(className).toContain("items-center");
    expect(className).toContain("justify-center");
    expect(className).toContain("flex-1");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/date-field.test.ts`
Expected: FAIL (`df-box` not found; the arrows still carry `border`).

- [ ] **Step 3: Implement.** In `src/components/ui/DateField.tsx` replace the `arrow` constant and the row markup (the label, the `CalendarPopup` and every prop stay):

```tsx
  // The arrows are ghost buttons inside the single box (44px targets in a 52px box); only the box has the border.
  const arrow = "h-11 w-11 items-center justify-center rounded-lg";
```

```tsx
      <View className="h-input-height flex-row items-center rounded-xl border border-neutral-200 bg-surface px-1" testID={`${testID}-box`}>
        <Pressable accessibilityLabel={t(PREVIOUS[step])} accessibilityRole="button" accessibilityState={{ disabled: !canGoBack }} className={`${arrow} ${canGoBack ? "" : "opacity-30"}`} disabled={!canGoBack} onPress={() => onChange(previous)} testID={`${testID}-prev`}>
          <ChevronLeft color={colors.ink} size={20} />
        </Pressable>
        <Pressable accessibilityLabel={`${label}: ${formatDateNumeric(value, language)}. ${t("dateField.choose")}`} accessibilityRole="button" className="h-11 flex-1 items-center justify-center" onPress={() => setOpen(true)} testID={testID}>
          <Text className="text-base font-sans-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(value, language)}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t(NEXT[step])} accessibilityRole="button" accessibilityState={{ disabled: !canGoForward }} className={`${arrow} ${canGoForward ? "" : "opacity-30"}`} disabled={!canGoForward} onPress={() => onChange(next)} testID={`${testID}-next`}>
          <ChevronRight color={colors.ink} size={20} />
        </Pressable>
      </View>
```

(The old outer `<View className="flex-row items-center gap-2">` is replaced by the box above.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/date-field.test.ts tests/unit/calendar-popup.test.ts`
Expected: PASS (the earlier arrow/step/min/max/pop-up tests are untouched and still green).

- [ ] **Step 5: Browser check and e2e** — `npm run e2e:export`, serve it (`npm run e2e:serve`), run `npx playwright test tests/e2e/owner-agenda.web.spec.ts --config playwright.chrome.config.ts` (the arrow/pop-up tests use only testIDs and must still pass). Then a scratch spec (do not commit) at 390×844 on `/agenda`: screenshot and computed styles —

```ts
const box = page.getByTestId("owner-agenda-date-box");
const metrics = await page.evaluate(() => {
  const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const style = (id: string) => getComputedStyle(el(id));
  const rect = (id: string) => el(id).getBoundingClientRect();
  return {
    boxBorder: style("owner-agenda-date-box").borderTopWidth,
    boxHeight: rect("owner-agenda-date-box").height,
    prevBorder: style("owner-agenda-date-prev").borderTopWidth,
    nextBorder: style("owner-agenda-date-next").borderTopWidth,
    prev: [rect("owner-agenda-date-prev").width, rect("owner-agenda-date-prev").height],
    dateCentre: rect("owner-agenda-date").left + rect("owner-agenda-date").width / 2,
    boxCentre: rect("owner-agenda-date-box").left + rect("owner-agenda-date-box").width / 2,
  };
});
```

Expected: `boxBorder` `1px`, `boxHeight` 52, both arrow borders `0px`, `prev` `[44, 44]`, `|dateCentre - boxCentre| < 2`. Also check the dimmed state: open `/agenda`, in week view set a `min` is not exposed there, so rely on the unit test for disabled arrows.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "fix(ui): DateField is a single box with the arrows inside" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `selectTab` emits `tabPress`

**Files:**
- Modify: `src/lib/navigation/select-tab.ts`, `app/(owner)/_layout.tsx`, `app/(professional)/_layout.tsx`, `app/(customer)/(tabs)/_layout.tsx`
- Test: `tests/unit/select-tab.test.ts`

**Interfaces:**
- Consumes: the `tabBar` props of expo-router's `Tabs` and `TopTabs`: `emitter.emit({ type: "tabPress", target: routeKey, canPreventDefault: true })` returns `{ defaultPrevented: boolean }`; `navigateToTab(routeKey)`; `state.index`, `state.routes[]`.
- Produces: `selectTab(tabBar: { emitter: TabPressEmitter; navigateToTab: (routeKey: string) => void; state: TabState }, name: string): void` where

  ```ts
  type TabState = { index: number; routes: { key: string; name: string }[] };
  type TabPressEmitter = { emit: (event: { canPreventDefault: true; target: string; type: "tabPress" }) => { defaultPrevented: boolean } };
  ```

  Behaviour: unknown `name` → nothing. Otherwise emit `tabPress` for that route; then call `navigateToTab(route.key)` only if the event was not prevented **and** `route.key` is not the focused route's key.

- [ ] **Step 1: Write the failing tests** — replace `tests/unit/select-tab.test.ts`:

```ts
import { selectTab } from "../../src/lib/navigation/select-tab";

const routes = [{ key: "home-abc", name: "home" }, { key: "book-def", name: "book" }, { key: "profile-ghi", name: "profile" }];

function bar(index = 0, prevented = false) {
  const emit = jest.fn().mockReturnValue({ defaultPrevented: prevented });
  const navigateToTab = jest.fn();

  return { emit, navigateToTab, tabBar: { emitter: { emit }, navigateToTab, state: { index, routes } } };
}

describe("selectTab", () => {
  it("emits tabPress for the tab with that name, so a nested stack can pop to its root", () => {
    const { emit, tabBar } = bar();

    selectTab(tabBar, "book");

    expect(emit).toHaveBeenCalledWith({ canPreventDefault: true, target: "book-def", type: "tabPress" });
  });

  it("then navigates by the route key when the event was not prevented", () => {
    const { navigateToTab, tabBar } = bar();

    selectTab(tabBar, "book");

    expect(navigateToTab).toHaveBeenCalledWith("book-def");
  });

  it("does not navigate when the event was prevented", () => {
    const { emit, navigateToTab, tabBar } = bar(0, true);

    selectTab(tabBar, "book");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it("tapping the focused tab emits tabPress but does not navigate again (the nested stack pops itself)", () => {
    const { emit, navigateToTab, tabBar } = bar(1);

    selectTab(tabBar, "book");

    expect(emit).toHaveBeenCalledWith({ canPreventDefault: true, target: "book-def", type: "tabPress" });
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it("does nothing for a name that is not a tab", () => {
    const { emit, navigateToTab, tabBar } = bar();

    selectTab(tabBar, "missing");

    expect(emit).not.toHaveBeenCalled();
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/select-tab.test.ts`
Expected: FAIL (old signature; `emit` never called).

- [ ] **Step 3: Implement** `src/lib/navigation/select-tab.ts`:

```ts
type TabState = { index: number; routes: { key: string; name: string }[] };
type TabPressEmitter = { emit: (event: { canPreventDefault: true; target: string; type: "tabPress" }) => { defaultPrevented: boolean } };

// A custom tab bar must do what the stock bars do (BottomTabBar.js / MaterialTopTabBar.js in expo-router): emit `tabPress` first. A
// nested stack inside the tab listens for it and pops to its root when its tab is pressed while already focused. Never call
// preventDefault() on the event: that cancels the pop. The bar items are keyed by route name, navigation by route key.
export function selectTab({ emitter, navigateToTab, state }: { emitter: TabPressEmitter; navigateToTab: (routeKey: string) => void; state: TabState }, name: string) {
  const route = state.routes.find((candidate) => candidate.name === name);

  if (!route) return;
  const event = emitter.emit({ canPreventDefault: true, target: route.key, type: "tabPress" });

  // Like the stock bar: the focused tab is not navigated to again, and a prevented press does not navigate.
  if (route.key !== state.routes[state.index]?.key && !event.defaultPrevented) navigateToTab(route.key);
}
```

Callers (same commit). Owner and professional layouts: change `tabBar={({ navigateToTab, state }) => (` to `tabBar={({ emitter, navigateToTab, state }) => (` and `onSelect={(key) => selectTab(state, navigateToTab, key)}` to `onSelect={(key) => selectTab({ emitter, navigateToTab, state }, key)}`. Customer `(tabs)/_layout.tsx` (a `TopTabs`): the same two changes (its `onSelect` is spread over lines: keep the layout, replace the call). If `tsc` rejects passing expo-router's `emitter` to the structural `TabPressEmitter` (its `emit` is generic over the event map), type the parameter as `Pick<BottomTabBarProps, "emitter" | "navigateToTab" | "state"> | Pick<MaterialTopTabBarProps, "emitter" | "navigateToTab" | "state">` with `import type { BottomTabBarProps } from "expo-router"` / `import type { MaterialTopTabBarProps } from "expo-router/js-top-tabs"` (both are re-exported: `build/layouts/Tabs.d.ts:6`, `build/layouts/TopTabs.d.ts:4`), keeping the same body.

- [ ] **Step 4: Run the tests and the neighbours**

Run: `npx jest tests/unit/select-tab.test.ts tests/unit/bottom-tab-bar.test.ts tests/unit/tab-swipe.test.ts tests/unit/owner-layout-declares-screens.test.ts tests/unit/root-layout.test.ts`
Expected: PASS (all `Test Suites:` green). Then `npm run typecheck`.

- [ ] **Step 5: Gate and commit**

```bash
./node_modules/.bin/eslint app src tests scripts
git add -A app src tests
git commit -m "fix(nav): tapping the active tab pops its nested stack to the root" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Browser regression for the tab press (professional, customer, owner)

**Files:**
- Create: `tests/e2e/tab-press-root.web.spec.ts`

Reuse the mocks of `tests/e2e/professional-clients.web.spec.ts` (`signIn`, `professionalProfile`, `mockProfessionalRest`, `clientRows`, the `get_my_customer` handler), `tests/e2e/booking.web.spec.ts` (`mockCustomerRest` with the `professional_services` handler) and `tests/e2e/owner-shell.web.spec.ts` (`signInAsOwner`, `mockOwnerRest`): copy the small helpers you need into the new file (specs do not share helpers across files except `customer-helpers.ts`, `fixtures.ts`).

- [ ] **Step 1: Write the tests** (they fail on `main`-plus-Task-1 because the tab press does nothing; run first to see them red)

```ts
test("professional: tapping the active Profile tab inside Settings returns to the Profile hub", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile");
  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/my-profile\/settings/);

  await page.getByTestId("tab-my-profile").click();

  await expect(page).toHaveURL(/\/my-profile$/);
  await expect(page.getByTestId("menu-settings")).toBeVisible();
});

test("professional: tapping the active Clients tab inside a client returns to the list", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) return json(route, clientRows).then(() => true);
    if (url.pathname.endsWith("/rpc/get_my_customer")) {
      return json(route, {
        customer: { email: null, full_name: "Ana Souza", has_account: false, id: "c1", phone: "11988887777" },
        history: [], note: null,
        stats: { cancelled: 0, favorite_service: null, last_visit_at: null, next_visit_at: null, no_show: 0, visits: 0 },
      }).then(() => true);
    }
  });

  await page.goto("/clients");
  await page.getByText("Ana Souza").click();
  await expect(page).toHaveURL(/\/clients\/c1/);

  await page.getByTestId("tab-clients").click();

  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByText("Bia Lima")).toBeVisible();
});

test("professional: the other tabs still switch (Agenda -> Clients -> Profile)", async ({ page }) => {
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) return json(route, clientRows).then(() => true);
  });

  await page.goto("/my-agenda");
  await page.getByTestId("tab-clients").click();
  await expect(page).toHaveURL(/\/clients$/);
  await page.getByTestId("tab-my-profile").click();
  await expect(page).toHaveURL(/\/my-profile$/);
});

test("customer: tapping the active Book tab mid-flow returns to the first step; the other tabs are unchanged", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/professional_services")) {
      await json(route, [{ duration_override_minutes: null, id: professionalServiceId, price_override_cents: null, service_id: "service-1", services: { duration_minutes: 30, name: "Browser Cut", price_cents: 4000 } }]);

      return true;
    }
  });

  await page.goto("/book");
  await page.getByRole("button", { name: "Browser Professional" }).click();
  await expect(page).toHaveURL(/\/book\/service/);

  await page.getByTestId("tab-book").click();

  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole("button", { name: "Browser Professional" })).toBeVisible();

  await page.getByTestId("tab-profile").click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByTestId("tab-home").click();
  await expect(page).toHaveURL(/\/home$/);
});

test("owner: the Manage tab still returns from a Manage screen, and Account from Settings", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page);

  await page.goto("/manage");
  await page.getByTestId("menu-services").click();
  await expect(page).toHaveURL(/\/services/);
  await page.getByTestId("tab-manage").click();
  await expect(page).toHaveURL(/\/manage/);

  await page.goto("/settings");
  await page.getByTestId("menu-settings").click();
  await expect(page).toHaveURL(/\/owner-profile\/settings/);
  await page.getByTestId("tab-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
});
```

(Imports at the top: `expect, test` from `./fixtures`, `Page` type, `json`, `professionalId`, `professionalServiceId`, `shopId`, `mockCustomerRest`, `signInAsCustomer` from `./customer-helpers`. If `/book` shows a shop picker or different first-step buttons, follow `walkToReview` in `booking.web.spec.ts` ("One shop: the picker is skipped"). If the client list rows are not plain text, use the testID the list renders (`rtk grep -n "testID" src/features/clients`).)

- [ ] **Step 2: Run them**

`npm run e2e:export`, then `npx playwright test tests/e2e/tab-press-root.web.spec.ts --config playwright.chrome.config.ts`.
Expected after Task 2 is in the build: the three "returns to the root" assertions PASS; the "other tabs still switch" and owner tests PASS. To see them red once, run the same spec against an export built from the commit before Task 2 (`git stash` is not allowed here: use `git worktree add ../zenc-before <commit>` or temporarily check out the previous commit on a scratch branch) and record "fails without the fix" in the PR description.

- [ ] **Step 3: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A tests
git commit -m "test(nav): tapping the active tab returns to the tab root (browser)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Colour wheel pop-up — restructure for the native drag (NOT verifiable here)

**Files:**
- Modify: `src/components/domain/ColorWheelPopup.tsx`
- Test: `tests/unit/color-wheel-popup.test.ts`
- Read, do not change unless a step says so: `src/components/ui/ColorWheel.tsx`

**What I found reading `ColorWheel.tsx` and the picker** (answer to "check ColorWheel for anything that would reset the thumb mid-drag"):
- `onCompleteJS` fires only on release, so our `onChange` (which updates the Appearance draft) is **not** called during a drag; nothing we render changes `value` mid-drag. No reset mid-drag.
- After release, `value` changes (the hex round-trips through the draft). The picker re-syncs its thumbs with `withTiming`, skipping the update when the parsed channels already match (`ColorPicker.js` effect on `value`). A hex round trip can still nudge hue at very low saturation/brightness: a small visual snap **after** release. Fixing this (passing the colour once at open) is part of Step 3 because it also removes any dependency on our re-renders.
- `ColorWheel` wraps the picker in a `GestureHandlerRootView`, and `ColorPicker` renders its own `GestureHandlerRootView` as well: two nested root views inside the `Modal`. Not a known fault, but a candidate (Step 5, B).
- The `Modal` card is wrapped by **two nested `Pressable`s** in `ColorWheelPopup.tsx` (backdrop and card). RN `Pressable` is a JS-responder touchable; the picker's panel/slider use native `Gesture.Pan()` composed as `Exclusive(pan, tap, longPress)` and call their update in `onBegin`, so **a tap always moves the thumb, while a drag that never activates the Pan looks exactly like "only taps work"**. A parent touchable that keeps the drag is the leading hypothesis, but it is a hypothesis.

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/color-wheel-popup.test.ts`; the file already mocks `ColorWheel` with a stub that prints its `value`)

```ts
  const ancestors = (node: { parent: unknown }) => {
    const found: Array<{ props?: Record<string, unknown> }> = [];
    let current = node as { parent: { props?: Record<string, unknown>; parent: unknown } | null };

    while (current.parent) {
      found.push(current.parent);
      current = current.parent as typeof current;
    }

    return found;
  };

  it("the backdrop is a SIBLING behind the card, not an ancestor of the wheel (no touchable around the gesture)", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    expect(ancestors(view.getByTestId("wheel-stub")).some((node) => node.props?.testID === "color-wheel-backdrop")).toBe(false);
    expect(ancestors(view.getByTestId("color-wheel-popup")).some((node) => node.props?.testID === "color-wheel-backdrop")).toBe(false);
  });

  it("no touch handler wraps the wheel: the card is a plain view", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));
    const wrapping = ancestors(view.getByTestId("wheel-stub")).filter((node) => typeof node.props?.onPress === "function" || typeof node.props?.onStartShouldSetResponder === "function");

    expect(wrapping).toEqual([]);
  });

  it("gives the wheel its colour once, when the pop-up opens (later prop changes do not re-feed it)", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    expect(view.getByText("#DB9A34")).toBeTruthy();
    await view.rerender(React.createElement(ColorWheelPopup, { ...base, value: "#2F6FDB" }));

    expect(view.getByText("#DB9A34")).toBeTruthy();
    expect(view.queryByText("#2F6FDB")).toBeNull();
  });

  it("starts from the new colour the next time it opens", async () => {
    const view = await render(React.createElement(ColorWheelPopup, { ...base, visible: false }));

    await view.rerender(React.createElement(ColorWheelPopup, { ...base, value: "#2F6FDB" }));

    expect(view.getByText("#2F6FDB")).toBeTruthy();
  });
```

The existing tests ("renders nothing while hidden", "reports a pick", "closes from the X, from Done and from a tap outside, not from a tap on the card", "shows the current colour in the preview") must stay green unchanged. Note the old assertion "tap on the card does not close" now passes because the card has no handler and is not under the backdrop.

- [ ] **Step 2: Run them to verify the new ones fail**

Run: `npx jest tests/unit/color-wheel-popup.test.ts`
Expected: FAIL on the three structure tests (backdrop is an ancestor; the card `Pressable` has `onPress`) and on "fixed at open" (the stub shows the new value).

- [ ] **Step 3: Implement** `src/components/domain/ColorWheelPopup.tsx`:

```tsx
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { ColorWheel } from "../ui/ColorWheel";
import { useColors } from "../../lib/design/theme/ThemeProvider";

export type ColorWheelPopupProps = { onChange: (hex: string) => void; onClose: () => void; title: string; value: string; visible: boolean };

// A centred floating pop-up (X top-right, tap outside closes) around the colour wheel. Every pick is applied at once, so closing
// keeps the last colour. Structure matters on a phone: the backdrop is a SIBLING behind the card and the card is a plain View, so no
// touchable wraps the wheel's native pan gesture; and the wheel gets its colour once, when the pop-up opens, so our re-renders never
// re-feed it while a finger is on it.
export function ColorWheelPopup({ onChange, onClose, title, value, visible }: ColorWheelPopupProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const [start, setStart] = useState(value);
  const [shown, setShown] = useState(value);

  // The colour shown in the preview follows the picks; the wheel's own start colour is taken only at each opening (the dependency
  // list is `[visible]` on purpose: later `value` changes must not re-feed the wheel while a finger is on it).
  useEffect(() => {
    if (visible) {
      setStart(value);
      setShown(value);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View className="flex-1 items-center justify-center p-5">
        <Pressable accessibilityLabel={t("colorWheel.close")} accessibilityRole="button" className="absolute inset-0 bg-black/40" onPress={onClose} testID="color-wheel-backdrop" />
        <View className="w-full max-w-[360px] gap-4 rounded-2xl bg-surface p-5" testID="color-wheel-popup">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("colorWheel.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="color-wheel-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <ColorWheel
            onChange={(hex) => {
              setShown(hex);
              onChange(hex);
            }}
            value={start}
          />
          {/* The preview colour is the data the owner is choosing, the one literal colour in this file. */}
          <View className="h-11 w-full rounded-xl border border-neutral-200" style={{ backgroundColor: shown }} testID="color-wheel-preview" />
          <Button label={t("colorWheel.done")} onPress={onClose} testID="color-wheel-done" />
        </View>
      </View>
    </Modal>
  );
}
```

Notes for the implementer: (a) the repo's ESLint has no `react-hooks` plugin, so the `[visible]`-only dependency list needs no disable comment (and an unknown-rule disable comment fails lint, seen in PR B); (b) `absolute inset-0` on a plain RN `Pressable` is allowed (className only on plain RN elements); if NativeWind on web does not resolve `inset-0`, use `className="absolute bottom-0 left-0 right-0 top-0 bg-black/40"`; (c) the unit test "reports a pick" must still see `onChange` called with the stub's value; (d) the existing a11y label on the backdrop duplicates the X's label: that is intended (screen readers get a "Close" target behind the card on native).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/color-wheel-popup.test.ts tests/unit/color-field.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts`
Expected: PASS. Then `npm run e2e:export` and `npx playwright test tests/e2e/owner-appearance.web.spec.ts --config playwright.chrome.config.ts` (the browser drag test from PR D must still pass: this restructure must not break the web, where the wheel already works). Check by screenshot (390×844) that the pop-up is still centred with the X top-right, and that a tap on the dimmed area closes it while a tap on the card does not.

- [ ] **Step 5: Device isolation checklist — to be run by the USER in Expo Go; record the answers in the PR**

Ask the user to test in this order and stop at the first that works, writing down iOS/Android and the result of each:

  A. **This commit (restructure).** Appearance → Primary → "Other colour": drag the wheel thumb and the brightness thumb without lifting the finger. Expected if the nested-`Pressable` hypothesis was right: the thumb follows the finger.
  B. **If A fails: drop our extra root view.** Change `src/components/ui/ColorWheel.tsx` to return the `ColorPicker` without the surrounding `GestureHandlerRootView` (the picker renders its own, `ColorPicker.js`), run again.
  C. **If B fails: take the `Modal` out of the equation.** Add a temporary route `app/zz-wheel.tsx` rendering `<ColorWheel value="#DB9A34" onChange={() => undefined} />` directly in a screen (no `Modal`, no `Pressable`), open it on the phone. If it drags there, the `Modal` (its separate native window and root view) is the problem; if it does not, the problem is gesture-handler 3.3.0 / the picker with the legacy `Gesture.*` API on that device. (Delete the route afterwards; never commit it.)
  D. **Decision point, not a coding step:** report C's result to the orchestrator. If the `Modal` is the problem: an inline panel on the Appearance screen instead of a pop-up (changes the agreed pop-up style: needs the user's OK). If gesture-handler is the problem: a wheel/sliders built on React Native's own `PanResponder` (no gesture-handler), or pin another gesture-handler version: also the user's call.

**State plainly in the PR and in the report: this item was restructured and covered by unit tests of the new structure, and works in the browser as before; it was NOT verified on a device. It must not be described as fixed until the user's Expo Go test passes.**

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "fix(appearance): colour wheel pop-up without a touchable around the wheel (needs device test)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Final gate, browser checks, PR handoff

- [ ] **Step 1: Whole-suite gates**

```bash
npm run typecheck; echo typecheck_exit=$?
npm run lint; echo lint_exit=$?
npx jest --runInBand; echo jest_exit=$?
```

Expected: typecheck_exit=0, lint_exit=0 (read the real output), jest_exit=0 with `Test Suites: N passed, N total` (a suite that cannot start fails only there). Then the whole Playwright suite: `npm run e2e:export` and `npx playwright test --config playwright.chrome.config.ts --workers=4` (it is not in CI; PR D's run was 264/264, so any new failure is ours). Fix anything, commit, then **re-run all four after the last commit**. No SQL changed: no pgTAP.

- [ ] **Step 2: Browser verification** (system Chrome, `.env.local` moved aside and restored, mobile width 390×844, screenshots outside the repo and viewed):
  - Owner Agenda: the single-box `DateField` in day, week and month view (computed styles from Task 1 Step 5), and its calendar pop-up still opening from the date.
  - Professional: Profile → Settings → tap Profile (hub), Clients → client → tap Clients (list).
  - Customer: Book → a step → tap Book (first step).
  - Appearance: the wheel pop-up still centred, tap outside closes, drag works in the browser.

- [ ] **Step 3: Report honestly.** The final report states, per item: (1) done and verified in Jest and the browser; (3) done and verified in Jest and the browser (web uses the same JS tab bar and stack code as the phones, but a device pass is still advisable: tap the active Profile/Clients/Book tab on the phone); (2) **restructured only, NOT verified on a device**, with the Task 4 Step 5 checklist for the user. Mention which Playwright specs failed without the fix (Task 3 Step 2).

- [ ] **Step 4: Hand off** — push, open the PR, bind with `get_status`/`bind_pr`, turn on Auto-fix, never auto-merge (only when ordered; this plan itself does not push).
