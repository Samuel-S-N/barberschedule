# Feedback 18/11 — PR B: bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every bug task starts with the **systematic-debugging** skill: reproduce, find the root cause, write the failing regression test, only then fix.

**Goal:** Fix the three bugs found in the 18/11 test round: the owner "new appointment" form reopens on the step where it was left; the Opening hours screen showed mixed colours and the web app seemed to freeze after changing and resetting the shop colours; tapping an "awaiting confirmation" notification does not open the appointment, and the owner cannot confirm appointments at all (decided with the user on 2026-11-19: the owner must be able to confirm, so this PR adds that).

**Architecture:** Three independent fixes, each with a regression test written first. (1) The form lives in an Expo Router `Tabs` screen that stays mounted when the user leaves, so its `useState` survives; the form resets itself when the screen loses focus. (2) The "mixed colours" are not a theme bug at all (root cause already found, below): react-native-web paints a switch's *on* knob from `activeThumbColor`, which two of our three switches never set. A shared `Toggle` fixes all three. The reported *freeze* could not be reproduced in the browser with mocked REST; the plan lists the investigation steps and what each outcome means. (3) The owner could not confirm an appointment (only the professional can, `set_owner_appointment_status` only accepts `completed` / `no_show`); a one-function migration lets the owner confirm a `scheduled` appointment, mirroring the professional rule, and the owner agenda shows the Confirm button. (4) The inbox row carries `appointmentId` and `params.startsAt`, but `inboxRoute` ignores them; staff rows now open the agenda on that day with that appointment's pop-up open.

**Tech Stack:** Expo SDK 58 / React Native 0.88 / react-native-web, Expo Router (`Tabs`, `useFocusEffect`, `useLocalSearchParams`), TanStack Query, react-i18next, Jest (jest-expo, RNTL 14 async `render`), Playwright (system Chrome).

**Spec:** `docs/superpowers/specs/2026-11-19-feedback-1811-design.md` (section "PR B — bugs")

**Branch:** `fix-feedback-b-bugs`, cut from `main` (after PR #103 `b68a4ff`). Independent of A and D; **must land before C** (C rewrites the same appointment form). See "Order between the four plans".

## First investigation (read-only, done while writing this plan)

Method: code reading plus a scratch Playwright spec on the production-style static export (`npm run e2e:export`, system Chrome, fixture `tests/e2e/fixtures.ts`, `interceptShops: false`, REST mocked like `tests/e2e/owner-appearance.web.spec.ts`). The scratch spec was deleted afterwards (not committed).

**B2 — mixed colours: ROOT CAUSE FOUND, it is not the theme.** On the *default* Zenc theme, before any colour change, `/shop` renders each day's switch with a track `rgb(219, 154, 52)` (our `colors.primary[400]`, the orange) and a knob `rgb(0, 150, 136)` (teal `#009688`). react-native-web's `Switch` paints the *on* knob from `activeThumbColor` (default teal) and uses `thumbColor` only for the *off* knob (`node_modules/react-native-web/dist/exports/Switch/index.js:80`). `app/(owner)/shop.tsx:189` and `app/(owner)/settings.tsx:53` pass only `thumbColor="#ffffff"`; `app/(professional)/my-profile/services.tsx:69` already works around it with `{...({ activeThumbColor: colors.white } as object)}` (not in RN's types). So the user saw "orange track, teal knob" because that is what the unpatched switch looks like; the colour change just made them look.

**B2 — freeze: NOT reproduced.** Scenarios run against the mocked backend, no page errors, no console errors, UI stayed clickable: save a custom primary then Reset; custom → default swatches (`#DB9A34` / `#F7F3EE`, which `deriveTheme` treats as "no choice" and returns `DEFAULT_THEME`) → Reset; swatch, Save, Reset, then Save again and cancel the confirm dialog; in-app navigation to `/shop` after Reset. After each change `document.documentElement.style` held the `--c-*` variables only while a custom theme was active (737 characters) and was empty after Reset/default, and the save button colour followed. So the web provider's set/remove cycle (`AppThemeProvider`, `src/lib/design/theme/ThemeProvider.tsx`) behaves. What the mock cannot cover: the real stack (local Supabase, owner session, `useShopTheme` refetch by slug, the AsyncStorage/localStorage theme cache `zenc.shop-theme.<slug>`), and the user's exact steps. Task 3 is the investigation for that.

**B1 — form keeps its step: cause identified by reading, to be proven in Task 1.** `app/(owner)/appointment-form.tsx` is a screen of the owner `Tabs` navigator (`app/(owner)/_layout.tsx`, listed in `MANAGE_SCREENS`). A tab screen stays mounted after the user leaves it, so `trail`, `selectedCustomerId`, `selectedProfessionalServiceId`, `selectedStartsAt`, `localDate`, `notes`, `search` and `feedback` (all `useState`) survive. After a successful booking the screen does `router.navigate({ params: { created: "1" }, pathname: "/agenda" })` and never resets, so the next "new appointment" opens on `review` ("the last checkout step"). The installed navigation version has no `unmountOnBlur` (verify in Task 1).

**B3 — notification target: cause identified by reading.** `src/features/notifications/inbox-route.ts` maps every appointment kind (including `appointment_awaiting_confirmation`) to the role's agenda root (`/my-agenda`, `/agenda`, `/appointments`) with no date and no appointment id, although `InboxItem` has `appointmentId` and `params.startsAt` (`inbox-api.ts`). The agenda opens on *today*, so an appointment on another day is simply not on screen, and nothing opens its pop-up. The same mapping is mirrored for web push in `supabase/functions/_shared/notification-path.ts`.

## Open questions for the orchestrator

1. **DECIDED (user, 2026-11-19): the owner must be able to confirm appointments.** Today only the professional can (`ProfessionalAgenda` uses `quickActions({ canConfirm: true })`; the owner agenda uses `canConfirm: false` and `set_owner_appointment_status` only accepts `completed` / `no_show`), yet the owner also receives `appointment_awaiting_confirmation` (`0046_notifications_inbox.sql`). **Plan does:** Task 4 (migration `0074`, API type, owner agenda button), and Task 5 sends the owner to `/agenda?date=…&open=<id>`, where the card has Confirm. Confirming notifies the customer through the existing `appointments_inbox_events` trigger (`scheduled → confirmed` UPDATE), no extra code.
2. **The freeze.** If Task 3 cannot reproduce it either, we need the exact steps the user took (which button: Reset or a swatch? which screen was open? did the whole tab become unclickable, or the page blank?) and a screenshot or the browser console. The plan ships the switch fix either way and keeps the freeze task open.
3. **DECIDED (user): web push taps are a follow-up, not in this PR.** Web push taps (the browser notification, not the inbox) open the role's agenda root, same as the inbox did. Fixing them needs the appointment's shop-local date in the push URL (`supabase/functions/_shared/notification-path.ts` has the role only), which means passing `starts_at` through `dispatch.ts`. The spec says "inbox" and "check the other types"; **plan does** the inbox (Task 5) and leaves web push as the follow-up below.
4. **Customer taps** open `/appointments` (the list), which already shows the customer's appointments; no deep link is added for customers.

## Global Constraints

- Owner booking form: "always starts at step 1 with empty state when opened anew". Root cause first, regression test written failing first.
- Theme: reproduce in the browser, find the cause, fix, regression test. (Mixed colours: root cause is the web switch knob; freeze: Task 3.)
- Notification tap on "awaiting confirmation" must open that appointment (the screen where the professional or owner confirms). Check the other notification types' targets while there (done in the table in Task 5).
- The owner can confirm a `scheduled` appointment (new, user decision): same transition rule as the professional (`scheduled → confirmed`), only for the owner of that shop.
- Project conventions: texts pt/es/en with parity; colours by tokens (`colors.white`, `colors.primary[400]`, never a literal except tokens' data); `className` only on plain RN elements; new routes need `parents.ts` (none here); tests in `tests/unit/*.test.ts` using `React.createElement` and async `render`; Playwright uses the system Chrome with `.env.local` moved aside (see `reference_local_dev_gotchas`).
- **Gate per task:** `npm run typecheck`, `./node_modules/.bin/eslint app src tests scripts`, the Jest files named. **Final gate (Task 6):** `npm run typecheck`, ROOT `npm run lint` (read the real output and exit code, never `| tail`), whole Jest suite, **re-run after the last commit**, browser screenshots of changed screens.

## Order between the four plans

- Migration numbers: B takes **0074** and pgTAP **056**; D then uses **0075** / **057** (merge order B before D; re-check with `ls supabase/migrations | tail -3` when starting).
- B first of the code PRs after A (or in parallel with A: no shared files except `app/(owner)/settings.tsx` Switch, which A does not touch).
- **C** replaces the form's `localDate` text step and splits service/professional; it must rebase on B's `useFocusEffect` reset (Task 1) and extend `reset()` with C's new state (`selectedServiceId`). C's plan says so.
- **D** edits `app/(owner)/appearance.tsx`; B does not touch it (Task 3 touches it only if the investigation finds the cause there).
- B's Tasks 4 and 5 change `app/(owner)/agenda.tsx` (new params effect). A's Task 6 and C's Task 5 also edit that file; each is a small, separate hunk.

## File structure

| File | Responsibility |
|---|---|
| `app/(owner)/appointment-form.tsx` (modify) | reset all form state when the screen loses focus |
| `src/components/ui/Toggle.tsx` (new) | the app's switch: theme tokens + web `activeThumbColor` |
| `app/(owner)/shop.tsx`, `app/(owner)/settings.tsx`, `app/(professional)/my-profile/services.tsx` (modify) | use `Toggle` |
| `supabase/migrations/0074_owner_confirm_appointment.sql`, `supabase/tests/056_owner_confirm_appointment.sql` (new) | `set_owner_appointment_status` also accepts `confirmed` for a `scheduled` appointment |
| `src/features/appointments/owner-api.ts` (modify) | `OwnerAppointmentStatus` gains `"confirmed"` |
| `src/features/notifications/inbox-route.ts` (modify) | `inboxRoute(kind, role, target?)` with date + appointment id for staff |
| `src/features/notifications/NotificationsScreen.tsx` (modify) | pass the target |
| `src/features/appointments/agenda-target.ts` (new) | `parseAgendaTarget(params)` validation shared by both agendas |
| `app/(owner)/agenda.tsx`, `src/features/appointments/ProfessionalAgenda.tsx` (modify) | apply `date` / `open` params once |
| `tests/unit/owner-appointment-form-reset.test.ts`, `owner-confirm.test.ts`, `toggle.test.ts`, `inbox.test.ts`, `agenda-target.test.ts` | regression tests |
| `tests/e2e/owner-appointment-form.web.spec.ts`, `owner-agenda.web.spec.ts`, `owner-shop.web.spec.ts`, `notifications.web.spec.ts` | browser regression |

---

### Task 1: B1 — the owner booking form starts fresh when opened anew

**Files:**
- Modify: `app/(owner)/appointment-form.tsx`
- Test: new `tests/unit/owner-appointment-form-reset.test.ts`, extend `tests/e2e/owner-appointment-form.web.spec.ts`

**Interfaces:**
- Consumes: `useFocusEffect` from `expo-router`.
- Produces: no new exports. Behaviour: when the screen loses focus (the user switches tab, or leaves after booking) every piece of form state returns to its initial value.

- [ ] **Step 1: Reproduce and prove the root cause in the browser**

Run `npm run e2e:export`, serve it (`npm run e2e:serve`), and with a scratch Playwright script (copy the owner sign-in and REST mocks from `tests/e2e/owner-appointment-form.web.spec.ts`, do not commit it): open `/appointment-form`, pick a customer (now on "Service"), click the "Calendar"/"Agenda" tab, click "New appointment" again. Expected today: the form is on the service step ("Service", step 2 of 6), not the customer step. Then confirm *why*: add a temporary `useEffect(() => { console.log("mount"); return () => console.log("unmount"); }, [])` to the screen, repeat, and check the console shows `mount` once and no `unmount` when switching tabs. Also run `rtk grep -n "unmountOnBlur" node_modules/@react-navigation node_modules/expo-router/build 2>/dev/null` to confirm the option does not exist in the installed version. Write the three observations (steps, console lines, grep result) in the PR description. Remove the temporary log.

- [ ] **Step 2: Write the failing regression test** `tests/unit/owner-appointment-form-reset.test.ts`

`useFocusEffect` is mocked so the test can play "the screen lost focus".

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const blurCallbacks: Array<() => void> = [];

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => {
  const react = jest.requireActual("react");

  return {
    // Runs the effect like a focused screen, and keeps its cleanup so a test can blur the screen.
    useFocusEffect: (effect: () => (() => void) | void) => {
      react.useEffect(() => {
        const cleanup = effect();
        if (cleanup) blurCallbacks.push(cleanup);
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
    },
    useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }),
  };
});
jest.mock("../../src/lib/navigation/use-back", () => ({ useBack: () => jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/use-owner-shop-id", () => ({ useOwnerShopId: () => ({ data: "shop-1", error: null, isLoading: false }) }));
jest.mock("../../src/features/professionals/api", () => ({ listOwnerProfessionals: jest.fn().mockResolvedValue([{ active: true, id: "p1", name: "Bruno" }]) }));
jest.mock("../../src/features/customers/api", () => ({ listOwnerCustomers: jest.fn().mockResolvedValue([{ active: true, email: null, fullName: "Ana Customer", id: "c1" }]) }));
jest.mock("../../src/features/services/api", () => ({
  listOwnerProfessionalServices: jest.fn().mockResolvedValue([{ active: true, id: "ps1", professionalId: "p1", serviceId: "s1" }]),
  listOwnerServices: jest.fn().mockResolvedValue([{ active: true, id: "s1", name: "Haircut" }]),
}));

import OwnerAppointmentFormScreen from "../../app/(owner)/appointment-form";
import i18n from "../../src/i18n";

const renderForm = () =>
  render(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }) },
      React.createElement(OwnerAppointmentFormScreen),
    ),
  );

describe("owner appointment form", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => { blurCallbacks.length = 0; });

  it("starts at the customer step again after the screen lost focus mid-way", async () => {
    const view = await renderForm();

    await waitFor(() => expect(view.getByText("Ana Customer")).toBeTruthy());
    await fireEvent.press(view.getByText("Ana Customer"));
    await waitFor(() => expect(view.getByTestId("owner-service-list")).toBeTruthy());

    await act(async () => { blurCallbacks.forEach((cleanup) => cleanup()); });

    await waitFor(() => expect(view.getByTestId("owner-customer-list")).toBeTruthy());
    expect(view.queryByTestId("owner-service-list")).toBeNull();
  });

  it("forgets the chosen customer, search text and notes", async () => {
    const view = await renderForm();

    await waitFor(() => expect(view.getByTestId("owner-customer-search")).toBeTruthy());
    await fireEvent.changeText(view.getByTestId("owner-customer-search"), "an");
    expect(view.getByTestId("owner-customer-search").props.value).toBe("an");

    await act(async () => { blurCallbacks.forEach((cleanup) => cleanup()); });

    expect(view.getByTestId("owner-customer-search").props.value).toBe("");
  });
});
```

(If a mocked API field name differs from the real types, adjust the mocked rows to the type returned by the real `list*` function; the assertions do not depend on them.)

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest tests/unit/owner-appointment-form-reset.test.ts`
Expected: FAIL (`owner-service-list` is still on screen after the blur; the search text is still `an`).

- [ ] **Step 4: Implement the minimal fix**

In `app/(owner)/appointment-form.tsx`: `import { useFocusEffect, useRouter } from "expo-router";`, `import { useCallback, useMemo, useState } from "react";`. After the `useState` declarations and the `go`/`goBack` helpers add:

```tsx
  // The owner Tabs navigator keeps this screen mounted when the user leaves it, so the form must forget itself: every open starts at
  // step 1 with nothing chosen. The cleanup of a focus effect runs when the screen loses focus (tab switch, or leaving after booking).
  useFocusEffect(
    useCallback(
      () => () => {
        setTrail(["customer"]);
        setFeedback(null);
        setLocalDate(formatInstantInShopTime(new Date()).localDate);
        setNotes("");
        setSearch("");
        setSelectedProfessionalServiceId(null);
        setSelectedCustomerId(null);
        setSelectedStartsAt(null);
      },
      [],
    ),
  );
```

(The setters are stable, so the empty dependency list is correct; do not add `today`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/unit/owner-appointment-form-reset.test.ts tests/unit/owner-layout-declares-screens.test.ts`
Expected: PASS.

- [ ] **Step 6: Browser regression test and manual check**

Add to `tests/e2e/owner-appointment-form.web.spec.ts` (reuse its sign-in and mocks):

```ts
test("the form opens on the customer step again after leaving it mid-way and after booking", async ({ page }) => {
  // ...same sign-in and mocks as the other tests in this file...
  await page.goto("/appointment-form");
  await page.getByTestId("owner-customer-list").getByText("Ana Customer").click();
  await expect(page.getByTestId("owner-service-list")).toBeVisible();

  await page.getByTestId("tab-agenda").click();
  await page.getByTestId("owner-new-appointment").click();

  await expect(page.getByTestId("owner-customer-list")).toBeVisible();
  await expect(page.getByTestId("owner-service-list")).toHaveCount(0);
});
```

(Use the real tab testID from `BottomTabBar`: `rtk grep -n "tab-" src/components/domain/BottomTabBar.tsx`. Also extend the existing "creates an appointment" test: after the success navigation, click "New appointment" again and assert the customer list is visible.) Run `npx playwright test tests/e2e/owner-appointment-form.web.spec.ts --config playwright.chrome.config.ts`.

- [ ] **Step 7: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app tests
git commit -m "fix(owner): booking form starts fresh when opened anew" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: B2a — switches use the theme on web (the "mixed colours")

**Files:**
- Create: `src/components/ui/Toggle.tsx`
- Modify: `app/(owner)/shop.tsx:189`, `app/(owner)/settings.tsx:53`, `app/(professional)/my-profile/services.tsx:69`
- Test: new `tests/unit/toggle.test.ts`; extend `tests/e2e/owner-shop.web.spec.ts`

**Interfaces:**
- Produces: `export function Toggle(props: Omit<SwitchProps, "thumbColor" | "trackColor">): JSX.Element` — a React Native `Switch` whose track is `colors.neutral[200]` off / `colors.primary[400]` on and whose knob is `colors.white` in both states (web: `activeThumbColor` too).

- [ ] **Step 1: Reproduce** (record in the PR): in the browser on the default theme open `/shop` and read the first switch's styles — track `rgb(219, 154, 52)`, knob `rgb(0, 150, 136)` (see "First investigation").

- [ ] **Step 2: Write the failing tests**

`tests/unit/toggle.test.ts`:

```ts
import { render } from "@testing-library/react-native";
import React from "react";

import { Toggle } from "../../src/components/ui/Toggle";
import { DEFAULT_COLORS } from "../../src/lib/design/colors";

describe("Toggle", () => {
  it("paints the knob white in both states, including react-native-web's active knob", async () => {
    const view = await render(React.createElement(Toggle, { onValueChange: jest.fn(), testID: "t", value: true }));
    const props = view.getByTestId("t").props as Record<string, unknown>;

    expect(props.thumbColor ?? props.activeThumbColor).toBeDefined();
    // The spread prop is what react-native-web reads; it must be the theme's white, never the browser's teal default.
    expect((props as { activeThumbColor?: string }).activeThumbColor ?? props.thumbColor).toBe(DEFAULT_COLORS.white);
  });

  it("uses the primary colour for the on track and a neutral for off", async () => {
    const view = await render(React.createElement(Toggle, { onValueChange: jest.fn(), testID: "t", value: false }));

    expect((view.getByTestId("t").props as { trackColor: { false: string; true: string } }).trackColor).toEqual({ false: DEFAULT_COLORS.neutral[200], true: DEFAULT_COLORS.primary[400] });
  });
});
```

(`view.getByTestId("t")` on a `Switch` resolves to the host switch element; if RNTL returns a wrapper without these props, assert on `view.UNSAFE_getByType(Switch).props` instead.)

Add to `tests/e2e/owner-shop.web.spec.ts` (reuse the file's helpers; an open day's switch must have a white knob in the browser):

```ts
test("the open/closed switches use the theme track and a white knob (not the browser's teal)", async ({ page }) => {
  // ...same owner sign-in and shop/hours mocks as the other tests in this file...
  await page.goto("/shop");
  const knob = await page.getByTestId("shop-open-1").evaluate((node) => getComputedStyle(node.children[1]).backgroundColor);

  expect(knob).toBe("rgb(255, 255, 255)");
});
```

- [ ] **Step 3: Run the Jest test to verify it fails**

Run: `npx jest tests/unit/toggle.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 4: Implement**

`src/components/ui/Toggle.tsx`:

```tsx
import { Switch } from "react-native";
import type { SwitchProps } from "react-native";

import { useColors } from "../../lib/design/theme/ThemeProvider";

// The app's on/off switch. react-native-web paints the "on" knob from `activeThumbColor` (browser default: teal, not in RN's types),
// so it is set here once instead of at every call site.
export function Toggle(props: Omit<SwitchProps, "thumbColor" | "trackColor">) {
  const colors = useColors();

  return <Switch {...props} thumbColor={colors.white} trackColor={{ false: colors.neutral[200], true: colors.primary[400] }} {...({ activeThumbColor: colors.white } as object)} />;
}
```

Replace the three `<Switch …>` elements by `<Toggle …>` keeping `accessibilityLabel`, `disabled`, `onValueChange`, `testID`, `value`, and deleting `thumbColor`, `trackColor` and the `activeThumbColor` spread (in `services.tsx` also remove its explanatory comment). Remove the `Switch` import from `react-native` in each file where it becomes unused; `colors` may still be used elsewhere in the file, keep it only if it is.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/unit/toggle.test.ts tests/unit/staff-profile.test.ts tests/unit/shop-hours.test.ts`
Expected: PASS. Then Playwright: `npx playwright test tests/e2e/owner-shop.web.spec.ts tests/e2e/professional-profile.web.spec.ts tests/e2e/owner-profile.web.spec.ts --config playwright.chrome.config.ts`.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app src tests
git commit -m "fix(ui): switches paint the knob white on web (shared Toggle)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: B2b — the reported freeze after resetting the shop colours (investigation; no fix assumed)

**Files:** decided by the root cause. Candidates: `src/lib/design/theme/ThemeProvider.tsx`, `src/features/shops/ShopThemeProvider.tsx`, `src/features/shops/theme.ts` (cache), `app/(owner)/appearance.tsx`. Regression test goes next to the cause (`tests/unit/theme-provider.test.ts`, `shop-theme-provider.test.ts`, or `tests/e2e/owner-appearance.web.spec.ts`).

**Interfaces:** none until the cause is known.

- [ ] **Step 1: Reproduce on the real local stack, not the mock**

Start the local stack (`running-barberschedule-locally`: Supabase, seeded owner, `npm run web`). In Chrome at the shop's `*.localhost` address, with DevTools open (Console, Performance) do exactly what the user did: sign in as the owner → Manage → Appearance → pick another colour (primary and/or base) → Save → then go back to the Zenc colours (**try both ways**: the Reset button with the confirm dialog, and re-selecting the first swatches `#DB9A34` / `#F7F3EE`) → open Manage → Opening hours. After each action record: console errors/warnings, whether clicks respond (Playwright `click({ timeout: 4000 })` or a manual tap), `document.documentElement.style.cssText`, and a 5-second Performance recording if the page stalls (a long task or a render loop shows as a solid block). Repeat with a hard reload between steps (the theme cache `zenc.shop-theme.<slug>` in localStorage) and with the cache cleared.

- [ ] **Step 2: Decide with the evidence** (write the finding in the PR description)

| Observation | Meaning | Where the fix goes |
|---|---|---|
| Console error stack in `ThemeProvider`/`derive` | exception during `deriveTheme` or `colorsToVars` with a stored value | validate in `readCachedTheme` / `getShopTheme` (`src/features/shops/theme.ts`) |
| Long task / render loop after Save or Reset, React "Maximum update depth" | state set inside an effect that re-triggers itself (`appearance.tsx` draft effect on `data?.shopId`, `ShopThemeProvider` cache effect) | break the loop at the effect that sets state |
| The page is blank or on the spinner forever | `ShopThemeProvider` `isReady` never true (query errored, `THEME_WAIT_MS` timer reset) | `src/features/shops/ShopThemeProvider.tsx` |
| Clicks ignored, nothing in console, a Modal backdrop still in the DOM | the confirm dialog or another `Modal` left an overlay | `ConfirmDialog` / the screen that mounts it |
| Cannot reproduce after a serious attempt on the real stack | cause not in the web provider | ask the user for exact steps + console/screenshot (open question 2); do **not** ship a speculative fix |

- [ ] **Step 3: Write the failing regression test first** for the cause found (the smallest layer that fails: a unit test with `AppThemeProvider`/`ShopThemeProvider` and mocked storage/queries, as in `tests/unit/theme-provider.test.ts` / `shop-theme-provider.test.ts`; a Playwright test only when the cause is DOM/CSS). Run it and see it fail for the right reason.

- [ ] **Step 4: Minimal fix, run the test green, run the neighbours** (`npx jest tests/unit/theme-provider.test.ts tests/unit/shop-theme-provider.test.ts tests/unit/shop-theme.test.ts tests/unit/theme-preview.test.ts` and `npx playwright test tests/e2e/owner-appearance.web.spec.ts tests/e2e/multi-shop.web.spec.ts --config playwright.chrome.config.ts`).

- [ ] **Step 5: Gate and commit** (`fix(theme): <what was found>`), or, if not reproducible, commit nothing and report. Do not delete this task from the PR description: say "not reproduced, switch fix shipped in Task 2".

---

### Task 4: the owner can confirm an appointment

**Files:**
- Create: `supabase/migrations/0074_owner_confirm_appointment.sql`, `supabase/tests/056_owner_confirm_appointment.sql`
- Modify: `src/features/appointments/owner-api.ts`, `app/(owner)/agenda.tsx`
- Test: new `tests/unit/owner-confirm.test.ts`; extend `tests/e2e/owner-agenda.web.spec.ts`

**Interfaces:**
- SQL: `public.set_owner_appointment_status(appointment_id uuid, new_status public.appointment_status) returns setof public.appointments` keeps its signature; it now also allows `new_status = 'confirmed'` when the current status is `scheduled` (and still `completed` / `no_show` from `scheduled` / `confirmed`). Anything else: `P0013 APPOINTMENT_STATUS_INVALID`; not the shop's owner: `P0010 APPOINTMENT_FORBIDDEN`.
- TS: `export type OwnerAppointmentStatus = "completed" | "confirmed" | "no_show";` `setOwnerAppointmentStatus(supabase, appointmentId, status)` unchanged otherwise.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/056_owner_confirm_appointment.sql` (fixture copied from `007_owner_booking.sql` with its own ids; owner books for a customer, the appointment starts `scheduled`):

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't56c-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't56c-customer@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'a6000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't56c-other-owner@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id in ('a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values
  ('a6100000-0000-0000-0000-000000000001', 'T56 Shop', 'a6000000-0000-0000-0000-000000000001'),
  ('a6100000-0000-0000-0000-000000000002', 'T56 Other Shop', 'a6000000-0000-0000-0000-000000000003');

insert into public.professionals (id, shop_id, name)
values ('a6200000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'T56 Professional');

insert into public.customers (id, shop_id, user_id, full_name, email)
values ('a6300000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'T56 Customer', 't56c-customer@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('a6400000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'T56 Cut', 30, 4000);

insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('a6500000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001', 'a6400000-0000-0000-0000-000000000001');

insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time)
select 'a6100000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001', weekday, '00:00', '23:59' from generate_series(1, 7) as weekday;

select set_config('t56.start', ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day 10 hours') at time zone 'America/Sao_Paulo')::text, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('t56.appointment', (select id::text from public.book_appointment('a6500000-0000-0000-0000-000000000001', 'a6300000-0000-0000-0000-000000000001', current_setting('t56.start')::timestamptz, 'owner', 'T56')), false);

select is((select status::text from public.appointments where id = current_setting('t56.appointment')::uuid), 'scheduled', 'an owner-booked appointment starts scheduled');
select lives_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'confirmed') $$, 'the owner confirms a scheduled appointment');
select is((select status::text from public.appointments where id = current_setting('t56.appointment')::uuid), 'confirmed', 'and it is confirmed');
select throws_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'confirmed') $$, 'P0013', null, 'a confirmed appointment cannot be confirmed again');
select lives_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'completed') $$, 'a confirmed appointment can still be completed');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.set_owner_appointment_status(current_setting('t56.appointment')::uuid, 'confirmed') $$, 'P0010', null, 'another shop''s owner cannot confirm it');

select * from finish();
rollback;
```

(If `book_appointment` returns a different shape than `setof appointments` with an `id` column, copy the way `007_owner_booking.sql` captures the first appointment id into a `set_config`. The `a6…` ids must not collide with other pgTAP files: `rtk grep -rn "a6000000" supabase/tests`.)

`tests/unit/owner-confirm.test.ts`:

```ts
import { setOwnerAppointmentStatus } from "../../src/features/appointments/owner-api";

describe("setOwnerAppointmentStatus", () => {
  it("can confirm a scheduled appointment", async () => {
    const row = { id: "a1", status: "confirmed" };
    const rpc = jest.fn().mockResolvedValue({ data: [row], error: null });

    await setOwnerAppointmentStatus({ rpc } as never, "a1", "confirmed");

    expect(rpc).toHaveBeenCalledWith("set_owner_appointment_status", { appointment_id: "a1", new_status: "confirmed" });
  });
});
```

(Its mock row may need the snake_case columns `toAppointment` reads; copy a complete row from `tests/unit/owner-agenda-query.test.ts`.)

E2E, in `tests/e2e/owner-agenda.web.spec.ts` (extend `mockOwnerRest` so `set_owner_appointment_status` records `calls.status`, which it already does):

```ts
test("the owner confirms a scheduled appointment from its card", async ({ page }) => {
  const state = { calls: {} as Record<string, unknown>, rows: [agendaRow()] };

  await signInAsOwner(page);
  await mockOwnerRest(page, state);

  await page.goto("/agenda");
  await page.getByTestId("owner-confirm-appt-1").click();

  await expect.poll(() => state.calls.status).toEqual({ appointment_id: "appt-1", new_status: "confirmed" });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/owner-confirm.test.ts` (fails only on the TypeScript type: `"confirmed"` not assignable; `npm run typecheck` shows it) and `npx supabase db reset && npx supabase test db` (056 fails: `P0013` on the first confirm).

- [ ] **Step 3: Implement**

`supabase/migrations/0074_owner_confirm_appointment.sql` — the 0015 function with the new rule (everything else identical):

```sql
-- The owner can confirm a scheduled appointment like the professional can (0029): scheduled -> confirmed. The scheduled -> confirmed
-- UPDATE already tells the customer (appointments_inbox_events, 0046).
create or replace function public.set_owner_appointment_status(
  appointment_id uuid,
  new_status public.appointment_status
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  select *
  into target
  from public.appointments
  where id = appointment_id
  for update;

  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;

  if not public.is_shop_owner(target.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  if not (
    (new_status in ('completed', 'no_show') and target.status in ('scheduled', 'confirmed'))
    or (new_status = 'confirmed' and target.status = 'scheduled')
  ) then
    raise exception using errcode = 'P0013', message = 'APPOINTMENT_STATUS_INVALID';
  end if;

  return query
  update public.appointments
  set status = new_status, updated_at = clock_timestamp()
  where id = target.id
  returning *;
end;
$$;
```

(Before writing it, `rtk grep -rn "set_owner_appointment_status" supabase/migrations` and copy grants/revokes from the latest definition if a later migration re-granted it; `create or replace` keeps existing grants.)

`owner-api.ts`: `export type OwnerAppointmentStatus = "completed" | "confirmed" | "no_show";`

`app/(owner)/agenda.tsx`: the mutation input becomes `{ id: string; status: "completed" | "confirmed" | "no_show" | "cancelled" }` (the `cancelled` branch is unchanged); `quickActions({ canConfirm: true, endsAt: appointment.endsAt, now: new Date(), status: appointment.status })`; `onConfirm={() => update.mutate({ id: appointment.id, status: "confirmed" })}` (replacing `() => undefined`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/owner-confirm.test.ts tests/unit/agenda-actions.test.ts tests/unit/owner-agenda-query.test.ts`, `npx supabase db reset && npx supabase test db`, then `npx playwright test tests/e2e/owner-agenda.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS (all pgTAP files green).

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app src tests supabase
git commit -m "feat(owner): owners can confirm scheduled appointments" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: B3 — the inbox opens the appointment (and the other notification targets)

**Files:**
- Create: `src/features/appointments/agenda-target.ts`
- Modify: `src/features/notifications/inbox-route.ts`, `src/features/notifications/NotificationsScreen.tsx`, `app/(owner)/agenda.tsx`, `src/features/appointments/ProfessionalAgenda.tsx`
- Test: `tests/unit/inbox.test.ts` (modify), new `tests/unit/agenda-target.test.ts`, extend `tests/e2e/owner-agenda.web.spec.ts` and `tests/e2e/notifications.web.spec.ts`

**Interfaces:**
- Produces:
  - `inboxRoute(kind: InboxKind, role: Role, target?: { appointmentId: string | null; startsAt: string }): string`. With a target and a staff role (`owner` | `professional`) and an *appointment* kind it returns `` `${AGENDA[role]}?date=${localDate}&open=${encodeURIComponent(appointmentId)}` `` where `localDate` is the shop-local date of `startsAt`; otherwise exactly what it returns today.
  - `parseAgendaTarget(params: { date?: string; open?: string }): { date: string | null; open: string | null }` — `date` only when `YYYY-MM-DD`, `open` only when non-empty.
- Consumes: `formatInstantInShopTime(date: Date): { localDate: string; localTime: string }` from `src/lib/dates/shop-time`.

Target table (what each inbox kind opens after this task):

| Kind | customer | professional | owner |
|---|---|---|---|
| `appointment_awaiting_confirmation`, `appointment_booked`, `appointment_cancelled`, `appointment_rescheduled` | `/appointments` (unchanged) | `/my-agenda?date=D&open=ID` (Confirm on the card) | `/agenda?date=D&open=ID` (Confirm on the card, after Task 4) |
| `appointment_confirmed` (customer only) | `/appointments` | n/a | n/a |
| `recurrence_*` | `/me/recurrence` | `/my-profile/recurrence` | `/monthly-customers` (unchanged) |
| `payout_*` | `/appointments` | `/my-profile/compensation` | `/payouts` (unchanged) |

- [ ] **Step 1: Write the failing tests**

`tests/unit/inbox.test.ts` — keep the existing assertions (they pass: no target → agenda root) and add:

```ts
it("opens the appointment on its day for staff", () => {
  const target = { appointmentId: "a1", startsAt: "2026-11-20T15:00:00Z" };

  expect(inboxRoute("appointment_awaiting_confirmation", "professional", target)).toBe("/my-agenda?date=2026-11-20&open=a1");
  expect(inboxRoute("appointment_cancelled", "owner", target)).toBe("/agenda?date=2026-11-20&open=a1");
});

it("uses the shop-local day, not the UTC one", () => {
  // 01:30 UTC on the 21st is still the 20th in the shop's time zone (UTC-3).
  expect(inboxRoute("appointment_booked", "owner", { appointmentId: "a1", startsAt: "2026-11-21T01:30:00Z" })).toBe("/agenda?date=2026-11-20&open=a1");
});

it("keeps the role's agenda when the row has no appointment or no time", () => {
  expect(inboxRoute("appointment_booked", "owner", { appointmentId: null, startsAt: "2026-11-20T15:00:00Z" })).toBe("/agenda");
  expect(inboxRoute("appointment_booked", "owner", { appointmentId: "a1", startsAt: "" })).toBe("/agenda");
});

it("does not deep-link customers, recurrence or payouts", () => {
  const target = { appointmentId: "a1", startsAt: "2026-11-20T15:00:00Z" };

  expect(inboxRoute("appointment_confirmed", "customer", target)).toBe("/appointments");
  expect(inboxRoute("recurrence_requested", "owner", target)).toBe("/monthly-customers");
  expect(inboxRoute("payout_paid", "professional", target)).toBe("/my-profile/compensation");
});
```

`tests/unit/agenda-target.test.ts`:

```ts
import { parseAgendaTarget } from "../../src/features/appointments/agenda-target";

describe("parseAgendaTarget", () => {
  it("accepts a date and an id", () => {
    expect(parseAgendaTarget({ date: "2026-11-20", open: "a1" })).toEqual({ date: "2026-11-20", open: "a1" });
  });

  it("drops a malformed date and an empty id", () => {
    expect(parseAgendaTarget({ date: "20/11/2026", open: "" })).toEqual({ date: null, open: null });
    expect(parseAgendaTarget({})).toEqual({ date: null, open: null });
  });
});
```

E2E (add to `tests/e2e/owner-agenda.web.spec.ts`, reusing `mockOwnerRest`, `agendaRow`, `signInAsOwner`): the appointment is today's row (`agendaRow()` starts "now"), so build the URL from today's shop-local date:

```ts
test("an agenda link with ?open= opens that appointment's pop-up", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, rows: [agendaRow()] });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  await page.goto(`/agenda?date=${today}&open=appt-1`);

  await expect(page.getByTestId("owner-sheet")).toBeVisible();
  await expect(page.getByTestId("owner-sheet")).toContainText("Ana Customer");
  // The params are consumed once: closing the pop-up must not reopen it.
  await page.getByTestId("owner-sheet-close").click();
  await expect(page.getByTestId("owner-sheet")).toHaveCount(0);
});
```

(Check the shop time zone constant in `src/lib/dates/shop-time.ts` and use the same one; add an analogous professional test in `tests/e2e/professional-booking.web.spec.ts` or `owner-own-agenda.web.spec.ts` whichever already mocks `list_my_professional_agenda`, asserting `professional-sheet`.) In `tests/e2e/notifications.web.spec.ts` add: tapping an `appointment_awaiting_confirmation` row for a professional navigates to a URL matching `/my-agenda\?date=\d{4}-\d{2}-\d{2}&open=/` (use the file's existing inbox mocks; give the row `appointment_id` and `params.starts_at`).

- [ ] **Step 2: Run the Jest tests to verify they fail**

Run: `npx jest tests/unit/inbox.test.ts tests/unit/agenda-target.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/features/appointments/agenda-target.ts`:

```ts
// Where a notification (or any link) sends the staff agendas: a day and an appointment whose pop-up opens.
export function parseAgendaTarget(params: { date?: string; open?: string }): { date: string | null; open: string | null } {
  return {
    date: params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null,
    open: params.open ? params.open : null,
  };
}
```

`src/features/notifications/inbox-route.ts`:

```ts
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import type { InboxKind } from "./inbox-api";

type Role = "professional" | "customer" | "owner";
type Target = { appointmentId: string | null; startsAt: string };

const AGENDA: Record<Role, string> = { professional: "/my-agenda", customer: "/appointments", owner: "/agenda" };
const REQUESTS: Record<Role, string> = { professional: "/my-profile/recurrence", customer: "/me/recurrence", owner: "/monthly-customers" };
const PAYOUTS: Record<Role, string> = { professional: "/my-profile/compensation", customer: "/appointments", owner: "/payouts" };

// Staff land on the appointment's day with its pop-up open (the card there has the Confirm button, for the professional and, after Task 4, the owner); everyone else
// on their agenda root.
export function inboxRoute(kind: InboxKind, role: Role, target?: Target) {
  if (kind.startsWith("payout_")) return PAYOUTS[role];
  if (kind.startsWith("recurrence_")) return REQUESTS[role];
  if (role === "customer" || !target?.appointmentId || !target.startsAt) return AGENDA[role];
  const { localDate } = formatInstantInShopTime(new Date(target.startsAt));

  return `${AGENDA[role]}?date=${localDate}&open=${encodeURIComponent(target.appointmentId)}`;
}
```

Keep the existing `NOTIFICATIONS` map and `notificationsPath` below it unchanged.

`NotificationsScreen.tsx` `open`: `router.push(inboxRoute(item.kind, role, { appointmentId: item.appointmentId, startsAt: item.params.startsAt }) as never);`

`app/(owner)/agenda.tsx`: `import { parseAgendaTarget } from "../../src/features/appointments/agenda-target";`; change the params hook to `const { created, date, open } = useLocalSearchParams<{ created?: string; date?: string; open?: string }>();` and, **after** the `const [openId, setOpenId] = …` line, add:

```tsx
  // Coming from a notification: show that day and open that appointment, once.
  useEffect(() => {
    const target = parseAgendaTarget({ date, open });

    if (!target.date && !target.open) return;
    if (target.date) {
      setView("day");
      setOffset(0);
      setLocalDate(target.date);
    }
    if (target.open) setOpenId(target.open);
    router.setParams({ date: undefined, open: undefined });
  }, [date, open]);
```

`ProfessionalAgenda.tsx`: extend its `useLocalSearchParams<{ bookFor?: string; moved?: string }>()` with `date?: string; open?: string`, and after `openId` is declared add the same effect using that screen's state: `setPickedDate(target.date)` instead of the view/offset/date calls, `setOpenId(target.open)`, `router.setParams({ date: undefined, open: undefined })`. (The pop-up appears as soon as the day's query returns the appointment, because `openAppointment` is derived from the loaded list.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/inbox.test.ts tests/unit/agenda-target.test.ts tests/unit/notification-path.test.ts tests/unit/payout-inbox.test.ts tests/unit/route-collisions.test.ts`
Then Playwright: `npx playwright test tests/e2e/owner-agenda.web.spec.ts tests/e2e/notifications.web.spec.ts tests/e2e/owner-own-agenda.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app src tests
git commit -m "fix(notifications): inbox opens the appointment on its day" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Final gate, browser checks, PR handoff

- [ ] **Step 1: Whole-suite gates**

```bash
npm run typecheck; echo typecheck_exit=$?
npm run lint; echo lint_exit=$?
npx jest --runInBand
```

Expected: both exits 0, Jest green. Fix and commit anything, then **re-run all three after the last commit**.

- [ ] **Step 2: Browser verification** (mobile width 390x844, screenshots outside the repo, viewed): owner form after tab switch and after a booking (customer step); `/shop` with default theme and with a custom theme (switch knob white, track follows `--c-primary-400` via computed style); inbox tap for a professional and for an owner (URL, pop-up open, day shown); the same pop-up not reopening after close. Playwright: `npx playwright test tests/e2e/owner-appointment-form.web.spec.ts tests/e2e/owner-shop.web.spec.ts tests/e2e/owner-agenda.web.spec.ts tests/e2e/notifications.web.spec.ts tests/e2e/owner-appearance.web.spec.ts --config playwright.chrome.config.ts`.

- [ ] **Step 3: Hand off** — push, open the PR, bind with `get_status`/`bind_pr`, turn on Auto-fix, never auto-merge (only when ordered; this plan itself does not push). Follow-up to propose: web push taps deep-link (open question 3).
