# Feedback 18/11 — PR D: appearance and notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) A colour-wheel pop-up ("Other colour") on the Appearance screen next to the swatches and hex field; (2) the *scheduled* status badge uses the shop's accent colour; (3) a "Turn on notifications?" pop-up after the first sign-in or account creation on a device (once per device); (4) a "Notifications" switch in every role's Settings.

**Architecture:** The colour wheel is `reanimated-color-picker` behind our own thin `ColorWheel` component (so unit tests never load Reanimated gestures) shown in a project-style pop-up. The badge change is class tokens only (`accent` is already a themed token). Notifications get one small abstraction, `useNotificationChannel()` (web = part 4's Web Push, native = Expo push token), used by both the prompt gate (mounted once in the root layout) and a switch row in the shared `ProfileSettingsScreen` (all three roles already use it). Native push registration stops asking for permission at app start (today `usePushRegistration` asks on every launch) and asks only from the prompt or the switch. Turning native push off needs one new user-callable RPC (`deactivate_my_notification_token`, migration 0074 + pgTAP 056), the Expo twin of part 4's `deactivate_my_web_subscription`.

**Tech Stack:** Expo SDK 58 / React Native 0.88 / react-native-web, Reanimated 4.7.1, react-native-gesture-handler 3.3.0, `reanimated-color-picker` 5.1.4, NativeWind tokens, Supabase (Postgres + pgTAP), Web Push (part 4), `expo-notifications`, react-i18next (pt/es/en), Jest (jest-expo, RNTL 14 async `render`), Playwright (system Chrome).

**Spec:** `docs/superpowers/specs/2026-11-19-feedback-1811-design.md` (section "PR D — appearance and notifications")

**Branch:** `feat-feedback-d-appearance-notifications`, cut from `main` **after PR B (needs its `Toggle`) and ideally after A (both edit `ProfileSettingsScreen.tsx`)**. Migration number **0074**, pgTAP **056** (latest on `main`: 0073 / 055; re-check with `ls supabase/migrations | tail -3` before creating).

## Library check: `reanimated-color-picker` on Expo SDK 58 (answer to the order's question)

Checked read-only (`npm view`, `npm pack` into a scratch folder, inspected the published source; nothing installed in the repo):

- **Version:** latest `5.1.4`, last published 2026-11-16 (maintained). No hard dependencies.
- **Peer dependencies:** `react-native-reanimated >=2.0.0` (repo: **4.7.1** ✔), `react-native-gesture-handler >=2.0.0` (repo: **3.3.0** ✔), `expo >=44` optional (repo: 58 ✔), `react`, `react-native` any.
- **API it needs from Reanimated 4.7.1 / gesture-handler 3.3.0:** `useSharedValue`, `useAnimatedStyle`, `useAnimatedProps`, `useAnimatedRef`, `useDerivedValue`, `withTiming`, `runOnJS`, `runOnUI` (all still exported by `react-native-reanimated@4.7.1`, `lib/typescript/index.d.ts:54`), and `Gesture` / `GestureDetector` / `GestureHandlerRootView` (the same classic API `MonthCalendar` already uses on gesture-handler 3.3.0 in this repo, and `app/_layout.tsx:83` already wraps the app in `GestureHandlerRootView`). No `react-native-worklets` import of its own.
- **Web:** the package declares iOS, Android, Expo and Web; it keeps an `isWeb` branch (`lib/module/utils.js`).
- **Not proven by reading:** it rendering and dragging correctly **inside an RN `Modal`** (the pop-up is a Modal; on web it is portalled to `document.body`, on Android a Modal needs its own `GestureHandlerRootView`) and in Expo Go. Task 1 proves it in the browser before anything is built on it, and lists a no-dependency **fallback** if it fails.
- **Jest:** the repo's Reanimated is mocked (`__mocks__/react-native-reanimated.js`, a minimal surface) so the picker is **never rendered in Jest**: it sits behind `src/components/ui/ColorWheel.tsx`, which unit tests mock.

## Open questions for the orchestrator

1. **Spec vs code — what already exists.** The install card and the notifications card already exist from parts 3–4 (`InstallPrompt`, `NotificationPrompt` on each role's hub), and **native push registration is automatic today**: `usePushRegistration` (`app/(owner)/_layout.tsx:28`, `(customer)/_layout.tsx:30`, `(professional)/_layout.tsx:34`) calls `registerPushToken`, which asks for permission on every app start until granted. The spec's "on native, tapping Turn on runs the Expo registration" only makes sense if the automatic ask is removed. **Plan does:** `registerPushToken(supabase, { ask })`; automatic start-up registration only refreshes a token when permission is *already* granted and the user did not switch it off; the prompt and the switch pass `ask: true`.
2. **Hub cards.** After this PR each role has three notification entry points: the hub card (part 4), the pop-up, the Settings switch. **Plan keeps the hub cards untouched** (not in the spec); recommended follow-up: delete `NotificationPrompt` from the three hubs (one small commit) once the pop-up and switch are accepted.
3. **Expo Go cannot receive remote push** (SDK 53+): `registerPushToken` returns `null` there. **Plan does:** in Expo Go (and Android builds without the native module) the notifications state is `unsupported`: no pop-up, no switch row (consistent with "unsupported: no pop-up"). Real native behaviour needs a dev build / device check (not covered by Jest or the browser; listed in the PR description as manual).
4. **"First sign-in on a device" for people who are already signed in** (everyone using the app today): the "prompted" flag does not exist yet, so they get the pop-up once on their next launch. **Plan does:** that (it is "once per device"). Say if existing sessions should be skipped (would need a "first seen" marker written at install time).
5. **Per origin, not per physical device on web.** Shops live on subdomains, and `localStorage` is per origin, so a person using two shops' addresses on one phone is asked once per shop address (their push subscription is per origin anyway).
6. **Badge contrast.** *Scheduled* in accent colour = tint background (`accent/10`), dot and text in the accent. A light accent (yellow) as text on a pale tint reads poorly; the default accent `#DB9A34` already has the same weak contrast as today's warning orange. **Plan does what the spec says** and shows the badge in the Appearance preview check; if a shop picks a very light accent the badge text is faint (it is also true of the accent used as text elsewhere).
7. **Calling Turn on in the pop-up when the browser prompt is dismissed** (permission stays `default`): the pop-up is closed and remembered (once per device), the switch in Settings remains the way to try again.

## Global Constraints

- Colour wheel: pop-up with a circular colour picker (hue wheel plus brightness), opened from an "Other colour" option **next to** the existing swatches and hex field, which stay.
- `StatusBadge` scheduled uses the shop **accent** colour (background tint, dot and text); confirmed (green), no-show (red), completed and cancelled (grey) unchanged.
- Notifications prompt: after the first sign-in or account creation on a device, a pop-up asks to turn on notifications with **Turn on** and **Not now**; shown **once per device** (remembered locally); Turn on runs part 4's permission + subscribe flow (web) or the Expo push registration (native); **iPhone browser not installed:** the pop-up points to the install guide instead; **unsupported browser or permission already granted/denied: no pop-up.** Applies to **every role**.
- Settings switch "Notifications" in every role's settings: on = subscribed on this device; off = deactivates this device's subscription/token (it cannot change the browser's own permission; if the browser denied it, the switch explains how to re-enable it in the browser settings).
- Web permission request must run directly inside the tap handler (iPhone/Safari lose the user activation after an `await`): `enableWebPush` already does (`src/features/notifications/web-push.ts`), keep calling `enable()` first in the press handler.
- Project conventions: texts pt/es/en with parity; colours by tokens (a literal colour only where it is data, like swatches); `className` only on plain RN elements; pop-ups are centred floating cards with X top-right and tap-outside-closes; no hard-coded text; new migration numbering; `DeepStringRecord` locale typing.
- **Gate per task:** `npm run typecheck`, `./node_modules/.bin/eslint app src tests scripts`, the Jest files named; after SQL changes `npx supabase db reset && npx supabase test db`. **Final gate (Task 8):** `npm run typecheck`, ROOT `npm run lint` (read the real output and exit code, never `| tail`; CI lints `public/` and root files too), whole Jest suite, `npx supabase test db`, **re-run after the last commit**, browser screenshots of changed screens.

## Order between the four plans

- **After B** (uses `Toggle`, `src/components/ui/Toggle.tsx`; if D must start earlier, use React Native's `Switch` with the `activeThumbColor` spread and swap to `Toggle` at rebase).
- **After A** preferably: A adds `SignOutButton` + `showSignOut` to `ProfileSettingsScreen`; Task 5 here adds the switch row above it, in a separate hunk.
- **C** does not touch these files. B's Task 3 (theme freeze) may touch `appearance.tsx`; Task 2 here edits `ColorField` and adds `ColorWheelPopup`, and only changes `appearance.tsx` if a prop is needed (none planned).

## File structure

| File | Responsibility |
|---|---|
| `package.json`, `package-lock.json` (modify) | `reanimated-color-picker@5.1.4` |
| `src/components/ui/ColorWheel.tsx` (new) | the library wrapper: `{ value, onChange(hex) }` |
| `src/components/domain/ColorWheelPopup.tsx` (new) | project-style pop-up around the wheel |
| `src/components/domain/ColorField.tsx` (modify) | "Other colour" button + popup |
| `src/components/domain/StatusBadge.tsx` (modify) | scheduled uses accent tokens |
| `src/features/notifications/web-push-state.ts` (modify) | `resolvePromptKind(env)` |
| `src/features/notifications/web-push.ts` (modify) | `disableWebPush(supabase)` |
| `src/features/notifications/use-web-push.ts` (modify) | `disable()` |
| `src/features/notifications/native-push-preference.ts` (new) | the "switched off on this device" flag |
| `src/features/notifications/native-push.ts` (new) | native support/permission helpers, `enableNativePush`, `disableNativePush` |
| `src/features/notifications/use-push-registration.ts` (modify) | no automatic permission ask |
| `src/features/notifications/api.ts` (modify) | `deactivateMyNotificationToken` |
| `src/features/notifications/use-notification-channel.ts` (new) | one hook over web and native |
| `src/features/notifications/prompt-kind.ts`, `prompt-store.ts` (new) | eligibility and once-per-device flag |
| `src/features/notifications/NotificationsPromptGate.tsx` (new) | the first-sign-in pop-up |
| `src/features/notifications/NotificationsSwitch.tsx` (new) | the Settings row |
| `src/features/account/ProfileSettingsScreen.tsx` (modify) | mount the switch |
| `app/_layout.tsx` (modify) | mount the gate inside `ShopGate` |
| `supabase/migrations/0074_deactivate_my_notification_token.sql`, `supabase/tests/056_deactivate_my_notification_token.sql` (new) | RPC + pgTAP |
| `src/i18n/locales/{en,es,pt}.ts` (modify) | `owner.appearance.otherColor`, `colorWheel.*`, `notificationsPrompt.*`, `notificationsSwitch.*` |

---

### Task 1: Spike — does the colour picker work here? (web, in a Modal)

**Files:** `package.json`, `package-lock.json`; scratch spec `tests/e2e/zz-wheel-spike.web.spec.ts` (delete before commit).

- [ ] **Step 1: Install and add a throwaway screen**

```bash
npm install reanimated-color-picker@5.1.4 --save-exact
```

Create a scratch route `app/zz-wheel.tsx` (delete before commit) rendering a `Pressable` that opens an RN `Modal` containing:

```tsx
import ColorPicker, { BrightnessSlider, Panel3 } from "reanimated-color-picker";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// <Modal transparent visible><GestureHandlerRootView style={{ width: 300 }}>
//   <ColorPicker onCompleteJS={({ hex }) => setHex(hex)} value="#DB9A34"><Panel3 centerChannel="saturation" /><BrightnessSlider /></ColorPicker>
// </GestureHandlerRootView></Modal>   (plus a <Text testID="hex">{hex}</Text> outside the Modal)
```

- [ ] **Step 2: Prove it in the browser**

`npm run e2e:export`, `npm run e2e:serve`, then a scratch Playwright spec: open `/zz-wheel`, open the Modal, drag the wheel thumb (`page.mouse.move/down/move/up` from the panel centre to its edge) and the brightness slider, assert `hex` text changes and is a `#RRGGBB`/`#RRGGBBAA` string; check the console for errors/warnings (`worklets`, `runOnJS` deprecation, "gesture handler root view" messages). Record the findings in the PR description.

- [ ] **Step 3: Decide**

| Result | Action |
|---|---|
| Wheel renders and drags in the Modal, no errors | continue with Task 2 as written |
| Renders but gestures do not reach it inside the Modal | wrap the Modal content in `GestureHandlerRootView` (already in the snippet) and retry; if still no, try `Panel1` (square) + `HueSlider` before giving up on the wheel shape |
| Cannot work on SDK 58 / web | **Fallback, no dependency:** `ColorWheel` becomes a 12-hue × 5-lightness grid of `Pressable` cells (colours are data) plus the existing hex field; `ColorWheel`'s props stay `{ value, onChange }`, so Tasks 2's tests and `ColorWheelPopup` do not change. Tell the orchestrator before implementing it (the user asked for a wheel). |

- [ ] **Step 4: Remove the scratch route and spec; keep only `package.json`/`package-lock.json` changes if the library is used.** Run `npx expo-doctor` (a warning that the package is not in Expo's validated list is expected; any other warning is a finding). Native/Expo Go behaviour cannot be proven here: note it as a manual check for the user's phone.

- [ ] **Step 5: Commit** (only when the library is kept)

```bash
git add package.json package-lock.json
git commit -m "chore: add reanimated-color-picker" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Colour wheel pop-up on the Appearance screen

**Files:**
- Create: `src/components/ui/ColorWheel.tsx`, `src/components/domain/ColorWheelPopup.tsx`
- Modify: `src/components/domain/ColorField.tsx`, `src/i18n/locales/{en,es,pt}.ts`
- Test: new `tests/unit/color-wheel-popup.test.ts`; extend `tests/unit/color-field.test.ts`; extend `tests/e2e/owner-appearance.web.spec.ts`

**Interfaces:**
- Produces:
  - `export function ColorWheel(props: { onChange: (hex: string) => void; value: string }): JSX.Element` — hue wheel + brightness slider; `onChange` is called when the user lifts the finger with `#RRGGBB` upper-case (alpha stripped).
  - `export function ColorWheelPopup(props: { onChange: (hex: string) => void; onClose: () => void; title: string; value: string; visible: boolean }): JSX.Element | null` — testIDs `color-wheel-popup` (card), `color-wheel-backdrop`, `color-wheel-close`, `color-wheel-preview` (current colour swatch), `color-wheel-done`.
  - `ColorField` gains an "Other colour" button, testID `` `${testID}-other` ``, that opens the popup; picking applies through the existing `onChange`.
- i18n: `owner.appearance.otherColor` = "Other colour" / pt "Outra cor" / es "Otro color"; `colorWheel.done` = "Done" / "Concluir" / "Listo"; `colorWheel.close` = "Close" / "Fechar" / "Cerrar".

- [ ] **Step 1: Write the failing tests**

`tests/unit/color-wheel-popup.test.ts`:

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/components/ui/ColorWheel", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  const react = jest.requireActual("react");

  // The real wheel needs Reanimated's UI thread; the stub reports one pick.
  return { ColorWheel: ({ onChange, value }: { onChange: (hex: string) => void; value: string }) => react.createElement(Pressable, { onPress: () => onChange("#2F6FDB"), testID: "wheel-stub" }, react.createElement(Text, null, value)) };
});

import { ColorWheelPopup } from "../../src/components/domain/ColorWheelPopup";
import i18n from "../../src/i18n";

const base = { onChange: jest.fn(), onClose: jest.fn(), title: "Primary colour", value: "#DB9A34", visible: true };

describe("ColorWheelPopup", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("renders nothing while hidden", async () => {
    const view = await render(React.createElement(ColorWheelPopup, { ...base, visible: false }));

    expect(view.queryByTestId("color-wheel-popup")).toBeNull();
  });

  it("passes the current colour to the wheel and shows it in the preview", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    expect(view.getByText("#DB9A34")).toBeTruthy();
    expect(view.getByTestId("color-wheel-preview")).toBeTruthy();
  });

  it("reports a pick from the wheel", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    await fireEvent.press(view.getByTestId("wheel-stub"));

    expect(base.onChange).toHaveBeenCalledWith("#2F6FDB");
  });

  it("closes from the X, from Done and from a tap outside, not from a tap on the card", async () => {
    const view = await render(React.createElement(ColorWheelPopup, base));

    await fireEvent.press(view.getByTestId("color-wheel-popup"));
    expect(base.onClose).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId("color-wheel-close"));
    await fireEvent.press(view.getByTestId("color-wheel-done"));
    await fireEvent.press(view.getByTestId("color-wheel-backdrop"));

    expect(base.onClose).toHaveBeenCalledTimes(3);
  });
});
```

Extend `tests/unit/color-field.test.ts` (read the file first and follow its render helper; mock `ColorWheel` the same way at the top of that file):

```ts
  it("offers 'Other colour' next to the swatches and the hex field, and applies the picked colour", async () => {
    const onChange = jest.fn();
    const view = await render(React.createElement(ColorField, { label: "Primary", onChange, presets: ["#DB9A34"], testID: "cf", value: "" }));

    expect(view.getByTestId("cf-swatch-#DB9A34")).toBeTruthy();
    expect(view.getByTestId("cf-input")).toBeTruthy();
    await fireEvent.press(view.getByTestId("cf-other"));
    await fireEvent.press(view.getByTestId("wheel-stub"));

    expect(onChange).toHaveBeenCalledWith("#2F6FDB");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/color-wheel-popup.test.ts tests/unit/color-field.test.ts`
Expected: FAIL (modules / `cf-other` missing).

- [ ] **Step 3: Implement**

`src/components/ui/ColorWheel.tsx`:

```tsx
import ColorPicker, { BrightnessSlider, Panel3 } from "reanimated-color-picker";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// A hue wheel (saturation towards the centre) plus a brightness slider. A RN Modal sits outside the app's root gesture view
// (web: portalled to <body>), so the wheel brings its own GestureHandlerRootView. onCompleteJS fires when the finger lifts.
export function ColorWheel({ onChange, value }: { onChange: (hex: string) => void; value: string }) {
  return (
    <GestureHandlerRootView style={{ gap: 16, width: "100%" }}>
      <ColorPicker onCompleteJS={({ hex }) => onChange(hex.slice(0, 7).toUpperCase())} style={{ gap: 16 }} value={value}>
        <Panel3 centerChannel="saturation" />
        <BrightnessSlider />
      </ColorPicker>
    </GestureHandlerRootView>
  );
}
```

(If Task 1 chose the fallback grid, this file holds the grid instead with the same props.)

`src/components/domain/ColorWheelPopup.tsx`:

```tsx
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { ColorWheel } from "../ui/ColorWheel";
import { useColors } from "../../lib/design/theme/ThemeProvider";

export type ColorWheelPopupProps = { onChange: (hex: string) => void; onClose: () => void; title: string; value: string; visible: boolean };

// A centred floating pop-up (X top-right, tap outside closes) around the colour wheel. Every pick is applied at once, so closing
// keeps the last colour.
export function ColorWheelPopup({ onChange, onClose, title, value, visible }: ColorWheelPopupProps) {
  const colors = useColors();
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID="color-wheel-backdrop">
        <Pressable className="w-full max-w-[360px] gap-4 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="color-wheel-popup">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("colorWheel.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="color-wheel-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <ColorWheel onChange={onChange} value={value} />
          {/* The preview colour is the data the owner is choosing, the one literal colour in this file. */}
          <View className="h-11 w-full rounded-xl border border-neutral-200" style={{ backgroundColor: value }} testID="color-wheel-preview" />
          <Button label={t("colorWheel.done")} onPress={onClose} testID="color-wheel-done" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

(Test "shows it in the preview" relies on the stub printing `value`; `color-wheel-preview` carries the same value in its style.)

`src/components/domain/ColorField.tsx`: add `useState`, `useTranslation`, `Button`/`Palette` and the popup.

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ColorWheelPopup } from "./ColorWheelPopup";
```

Inside the component: `const { t } = useTranslation(); const [wheelOpen, setWheelOpen] = useState(false);` and a start colour for the wheel: `const wheelStart = /^#[0-9A-F]{6}$/.test(typed) ? typed : presets[0];`. After the swatch `View` (inside the swatch row's wrapper, i.e. at the end of the `flex-row flex-wrap gap-2` container) add:

```tsx
        <Button label={t("owner.appearance.otherColor")} onPress={() => setWheelOpen(true)} size="sm" testID={`${testID}-other`} variant="outline" />
```

and before the closing `</View>` of the component:

```tsx
      <ColorWheelPopup onChange={onChange} onClose={() => setWheelOpen(false)} title={label} value={wheelStart} visible={wheelOpen} />
```

Locales: the three keys from Interfaces.

E2E, extend `tests/e2e/owner-appearance.web.spec.ts` with:

```ts
test("Other colour opens the wheel pop-up next to the swatches and the hex field", async ({ page }) => {
  const theme: Theme = { theme_accent: null, theme_base: null, theme_primary: null };

  await signInAsOwner(page);
  await mockRest(page, theme, []);
  await page.goto("/appearance");

  await expect(page.getByTestId("appearance-primary-swatch-#DB9A34")).toBeVisible();
  await expect(page.getByTestId("appearance-primary-input")).toBeVisible();
  await page.getByTestId("appearance-primary-other").click();
  await expect(page.getByTestId("color-wheel-popup")).toBeVisible();
  // Drag from the middle of the wheel towards its edge: the hex field follows.
  const box = (await page.getByTestId("color-wheel-popup").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + 150, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId("color-wheel-done").click();

  await expect(page.getByTestId("color-wheel-popup")).toHaveCount(0);
  await expect(page.getByTestId("appearance-primary-input")).toHaveValue(/^#[0-9A-F]{6}$/);
  // The preview card is the chosen colour.
  await expect.poll(() => page.getByTestId("theme-preview").getByRole("button", { name: "Book" }).evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe("rgb(219, 154, 52)");
});
```

(Adjust the drag coordinates to the real wheel position found in Task 1's spike; keep the assertions.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/color-wheel-popup.test.ts tests/unit/color-field.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts`; then `npx playwright test tests/e2e/owner-appearance.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "feat(appearance): colour wheel pop-up next to the swatches" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `StatusBadge` scheduled uses the shop accent

**Files:**
- Modify: `src/components/domain/StatusBadge.tsx`
- Test: `tests/unit/status-badge.test.ts`; extend `tests/e2e/owner-appearance.web.spec.ts` or `tests/e2e/owner-agenda.web.spec.ts`

- [ ] **Step 1: Write the failing test** (append to `tests/unit/status-badge.test.ts`)

```ts
describe("StatusBadge colours", () => {
  it("scheduled follows the shop accent token (tint, dot and text), not the fixed warning colour", async () => {
    const view = await render(React.createElement(StatusBadge, { status: "scheduled", testID: "badge" }));
    const badge = view.getByTestId("badge");

    expect(badge.props.className).toContain("bg-accent/10");
    expect(badge.props.className).not.toContain("warning");
    expect(view.getByText("Scheduled").props.className).toContain("text-accent");
    expect(JSON.stringify(view.toJSON())).toContain("bg-accent ");
  });

  it.each([
    ["confirmed", "bg-success-500/10", "text-success-500"],
    ["no_show", "bg-danger-500/10", "text-danger-500"],
    ["completed", "bg-neutral-100", "text-neutral-600"],
    ["cancelled", "bg-neutral-100", "text-neutral-400"],
  ] as const)("%s keeps its fixed meaning colours", async (status, background, text) => {
    const view = await render(React.createElement(StatusBadge, { status, testID: "badge" }));

    expect(view.getByTestId("badge").props.className).toContain(background);
    expect(view.getByText(/./).props.className).toContain(text);
  });
});
```

(`view.getByText(/./)` matches the label; if it also matches other text, pass the label string. If the `bg-accent ` JSON check is brittle, query the dot by adding `testID={testID ? `${testID}-dot` : undefined}` in Step 3 and assert its `className` contains `bg-accent`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/status-badge.test.ts`
Expected: FAIL (`bg-warning-500/10`).

- [ ] **Step 3: Implement** in `StatusBadge.tsx`: `CLASSNAME.scheduled: "bg-accent/10"`, `TEXT_CLASSNAME.scheduled: "text-accent"`, `DOT_CLASSNAME.scheduled: "bg-accent"`; give the dot `testID={testID ? \`${testID}-dot\` : undefined}` if Step 1 needed it. Update the comment above the maps: "scheduled follows the shop accent; the other statuses keep fixed meaning colours (a red brand must not make every badge look like a no-show)". Verify `accent` supports an opacity modifier: `tailwind.config.ts` `token("accent")` must be `rgb(var(--c-accent) / <alpha-value>)`-style like the other tokens (`rtk grep -n "const token" -A4 tailwind.config.ts`); if it is not, add `<alpha-value>` support there first and cover it in `tests/unit/tailwind-config.test.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/status-badge.test.ts tests/unit/tailwind-config.test.ts tests/unit/agenda-card.test.ts tests/unit/appointment-card.test.ts`
Expected: PASS.

- [ ] **Step 5: Browser check, gate and commit**

In the browser: with the default theme the scheduled badge background/dot/text use `rgb(219, 154, 52)`; with a saved custom accent (mock `theme_accent: "#2F6FDB"` as in `owner-appearance.web.spec.ts`, then open `/agenda` with a scheduled appointment) the dot's computed `background-color` becomes `rgb(47, 111, 219)` (via `deriveTheme(...).colors.accent`) and a confirmed badge stays green. Add that as an e2e test in `tests/e2e/owner-agenda.web.spec.ts` (mock the shop with `theme_accent`; reuse `agendaRow({ status: "scheduled" })` and `getByTestId("owner-appointment-appt-1")` to find the dot: `page.getByTestId("owner-appointment-appt-1").locator("div").filter({ hasText: "" })` is fragile, so give the card's badge a testID through `AgendaCard` only if it has none, or assert the badge text colour: `getByText("Scheduled")` computed `color`).

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "feat(ui): scheduled badge follows the shop accent" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Notification plumbing — prompt eligibility, disable, native helpers, quiet start-up

**Files:**
- Modify: `src/features/notifications/web-push-state.ts`, `web-push.ts`, `use-web-push.ts`, `use-push-registration.ts`, `api.ts`
- Create: `src/features/notifications/native-push-preference.ts`, `src/features/notifications/native-push.ts`, `src/features/notifications/prompt-kind.ts`, `src/features/notifications/prompt-store.ts`, `src/features/notifications/use-notification-channel.ts`, `supabase/migrations/0074_deactivate_my_notification_token.sql`, `supabase/tests/056_deactivate_my_notification_token.sql`
- Test: `tests/unit/web-push-state.test.ts`, `tests/unit/web-push.test.ts`, `tests/unit/push-registration.test.ts`, `tests/unit/use-web-push.test.ts` (modify); new `tests/unit/native-push.test.ts`, `prompt-store.test.ts`, `use-notification-channel.test.ts` (the preference flag is covered through `push-registration.test.ts` and `native-push.test.ts`)

**Interfaces:**
- Produces:
  - `resolvePromptKind(env: WebPushEnvironment): "ask" | "install" | null` — `"install"` for iPhone/iPad not installed (checked first), `null` when unsupported or permission is `granted`/`denied`, `"ask"` only when `permission === "default"`.
  - `disableWebPush(supabase: Pick<SupabaseClient, "rpc">): Promise<void>` — deactivates this browser's subscription on the server, then `subscription.unsubscribe()`; no-op without a subscription. `useWebPush()` returns `{ disable, enable, error, state }`; after `disable()` the state becomes `"default"`.
  - `native-push-preference.ts` (no other imports, so `use-push-registration.ts` and `native-push.ts` can both use it without a cycle): `isNativePushDisabled(): Promise<boolean>` / `setNativePushDisabled(value: boolean): Promise<void>` (storage key `zenc.push-off`, "the user switched notifications off on this device").
  - `native-push.ts`: `nativePushSupported(): boolean` (false on web, Expo Go `StoreClient`, Android without `ExpoTopicSubscriptionModule`); `readNativePermission(): Promise<"granted" | "denied" | "undetermined" | "unsupported">`; `enableNativePush(supabase): Promise<"on" | "denied" | "unsupported">` (clears the off flag, `registerPushToken(supabase, { ask: true })`); `disableNativePush(supabase): Promise<void>` (gets the current token, calls `deactivateMyNotificationToken`, sets the off flag).
  - `registerPushToken(supabase, options?: { ask?: boolean })`: with `ask` false/absent it never calls `requestPermissionsAsync` and returns `null` unless permission is already `granted` **and** `isNativePushDisabled()` is false.
  - `deactivateMyNotificationToken(supabase: Pick<SupabaseClient, "rpc">, token: string): Promise<void>` (RPC `deactivate_my_notification_token`).
  - `prompt-store.ts`: `hasBeenPrompted(): Promise<boolean>`, `markPrompted(): Promise<void>` (key `zenc.notifications-prompted`, `createKeyValueStorage()`).
  - `prompt-kind.ts`: `readPromptKind(): Promise<"ask" | "install" | null>` (web → `resolvePromptKind(await readWebPushEnvironment())`; native → `"ask"` when supported and permission is `undetermined`, else `null`).
  - `useNotificationChannel(): { busy: boolean; disable: () => Promise<void>; enable: () => Promise<void>; error: boolean; state: "denied" | "install" | "off" | "on" | "unsupported" }`.
- SQL: `deactivate_my_notification_token(target_expo_push_token text) returns void`, `security definer`, deactivates only the **caller's** row; `revoke … from public, anon; grant execute … to authenticated`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/web-push-state.test.ts` — add (reusing the file's `env` helper or an inline base object):

```ts
describe("resolvePromptKind", () => {
  const base = { hasNotification: true, hasPushManager: true, hasServiceWorker: true, ios: false, isWeb: true, permission: "default", standalone: false, subscribed: false } as const;

  it("asks only when the browser can do push and has not been asked", () => {
    expect(resolvePromptKind(base)).toBe("ask");
  });

  it.each(["granted", "denied"] as const)("does not ask when permission is already %s", (permission) => {
    expect(resolvePromptKind({ ...base, permission })).toBeNull();
  });

  it("points an iPhone that has not installed the app to the install guide, before any support check", () => {
    expect(resolvePromptKind({ ...base, hasPushManager: false, ios: true })).toBe("install");
    expect(resolvePromptKind({ ...base, ios: true, standalone: true })).toBe("ask");
  });

  it("stays silent in unsupported browsers and off the web", () => {
    expect(resolvePromptKind({ ...base, hasServiceWorker: false })).toBeNull();
    expect(resolvePromptKind({ ...base, isWeb: false })).toBeNull();
  });
});
```

`tests/unit/web-push.test.ts` — add:

```ts
describe("disableWebPush", () => {
  const setRegistration = (subscription: unknown) => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } } });
  };

  it("deactivates the subscription on the server, then unsubscribes the browser", async () => {
    const calls: string[] = [];
    const rpc = jest.fn().mockImplementation(async () => { calls.push("server"); return { error: null }; });
    setRegistration({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe: async () => { calls.push("browser"); return true; } });

    await disableWebPush({ rpc } as never);

    expect(rpc).toHaveBeenCalledWith("deactivate_my_web_subscription", { target_endpoint: "https://fcm.googleapis.com/fcm/send/abc" });
    expect(calls).toEqual(["server", "browser"]);
  });

  it("keeps the browser subscription when the server call fails (the switch must not lie)", async () => {
    const unsubscribe = jest.fn();
    setRegistration({ endpoint: "https://x", unsubscribe });

    await expect(disableWebPush({ rpc: jest.fn().mockResolvedValue({ error: new Error("offline") }) } as never)).rejects.toThrow();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("does nothing without a subscription", async () => {
    const rpc = jest.fn();
    setRegistration(null);

    await disableWebPush({ rpc } as never);

    expect(rpc).not.toHaveBeenCalled();
  });
});
```

(Import `disableWebPush` from `../../src/features/notifications/web-push`; restore `navigator` in an `afterEach` the way the file's other tests do.)

`tests/unit/push-registration.test.ts` — read the file, then change the "asks" expectations: the existing test(s) that expect `requestPermissionsAsync` to be called by `registerPushToken(supabase)` become `registerPushToken(supabase, { ask: true })`, and add:

```ts
  it("never asks for permission on its own: with undetermined permission it does nothing", async () => {
    setOs("android");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined" } as never);

    expect(await registerPushToken(supabase)).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("refreshes the token silently when permission was already granted", async () => {
    setOs("android");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "ExponentPushToken[x]" } as never);

    expect(await registerPushToken(supabase)).toBe("ExponentPushToken[x]");
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("stays off when the user switched notifications off", async () => {
    setOs("android");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    await setNativePushDisabled(true);

    expect(await registerPushToken(supabase)).toBeNull();
    await setNativePushDisabled(false);
  });
```

(The Android branch needs `requireOptionalNativeModule("ExpoTopicSubscriptionModule")` to be truthy in this test file: check how the file's existing Android test arranges it and reuse it. Import `setNativePushDisabled` from `native-push-preference`; if `SecureStore` is not mocked, mock `expo-secure-store` the way `tests/unit/cookie-storage.test.ts`/`i18n-init.test.ts` do, or mock `../../src/lib/key-value-storage` with an in-memory object.)

`tests/unit/prompt-store.test.ts`:

```ts
const memory = new Map<string, string>();

jest.mock("../../src/lib/key-value-storage", () => ({
  createKeyValueStorage: () => ({
    getItem: async (key: string) => memory.get(key) ?? null,
    removeItem: async (key: string) => { memory.delete(key); },
    setItem: async (key: string, value: string) => { memory.set(key, value); },
  }),
}));

import { hasBeenPrompted, markPrompted } from "../../src/features/notifications/prompt-store";

describe("prompt store", () => {
  beforeEach(() => memory.clear());

  it("remembers that this device was prompted", async () => {
    expect(await hasBeenPrompted()).toBe(false);
    await markPrompted();

    expect(await hasBeenPrompted()).toBe(true);
  });
});
```

`tests/unit/use-notification-channel.test.ts` (mock `use-web-push` and `native-push`; assert the mapping and the platform split):

```ts
import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";

jest.mock("../../src/features/notifications/use-web-push", () => ({ useWebPush: jest.fn() }));
jest.mock("../../src/features/notifications/native-push", () => ({
  disableNativePush: jest.fn(), enableNativePush: jest.fn(), nativePushSupported: jest.fn(), readNativePermission: jest.fn(),
}));
jest.mock("../../src/features/notifications/native-push-preference", () => ({ isNativePushDisabled: jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));

import * as native from "../../src/features/notifications/native-push";
import { isNativePushDisabled } from "../../src/features/notifications/native-push-preference";
import { useNotificationChannel } from "../../src/features/notifications/use-notification-channel";
import { useWebPush } from "../../src/features/notifications/use-web-push";

const web = (state: string) => jest.mocked(useWebPush).mockReturnValue({ disable: jest.fn(), enable: jest.fn(), error: false, state } as never);

describe("useNotificationChannel on the web", () => {
  beforeEach(() => jest.replaceProperty(Platform, "OS", "web" as never));
  afterEach(() => jest.restoreAllMocks());

  it.each([["hidden", "unsupported"], ["ios-install", "install"], ["default", "off"], ["denied", "denied"], ["on", "on"]] as const)("maps web state %s to %s", async (webState, expected) => {
    web(webState);
    const { result } = await renderHook(() => useNotificationChannel());

    expect(result.current.state).toBe(expected);
  });

  it("enable and disable go to Web Push", async () => {
    web("on");
    const { result } = await renderHook(() => useNotificationChannel());

    await act(async () => { await result.current.disable(); });

    expect(jest.mocked(useWebPush).mock.results[0].value.disable).toHaveBeenCalled();
  });
});

describe("useNotificationChannel on a phone", () => {
  beforeEach(() => { jest.replaceProperty(Platform, "OS", "android" as never); web("hidden"); });
  afterEach(() => jest.restoreAllMocks());

  it("is unsupported where remote push cannot work (Expo Go)", async () => {
    jest.mocked(native.nativePushSupported).mockReturnValue(false);
    const { result } = await renderHook(() => useNotificationChannel());

    expect(result.current.state).toBe("unsupported");
  });

  it.each([["granted", false, "on"], ["granted", true, "off"], ["undetermined", false, "off"], ["denied", false, "denied"]] as const)("permission %s (switched off: %s) is %s", async (permission, off, expected) => {
    jest.mocked(native.nativePushSupported).mockReturnValue(true);
    jest.mocked(native.readNativePermission).mockResolvedValue(permission);
    jest.mocked(isNativePushDisabled).mockResolvedValue(off);
    const { result } = await renderHook(() => useNotificationChannel());

    await act(async () => undefined);

    expect(result.current.state).toBe(expected);
  });
});
```

`tests/unit/native-push.test.ts` — `nativePushSupported` false on web / Expo Go / Android without the module; `enableNativePush` clears the off flag and returns `"on"` when a token is saved and `"denied"` when `registerPushToken` returns `null` for a denied permission; `disableNativePush` calls the RPC with the token and sets the flag. Mock `expo-notifications`, `expo-constants`, `expo-modules-core` (`requireOptionalNativeModule`), `../../src/features/notifications/api` (`deactivateMyNotificationToken`) and `../../src/lib/key-value-storage` as the files above do (mock `native-push-preference` for the flag), and assert the calls.

pgTAP `supabase/tests/056_deactivate_my_notification_token.sql` (same shape as `054`; adjust `plan(n)` to the count):

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000056', 'authenticated', 'authenticated', 't56-one@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000057', 'authenticated', 'authenticated', 't56-two@example.com', 'x', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000056', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.register_notification_token('ExponentPushToken[t56mine]', 'android', 'en');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000057', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$ select public.deactivate_my_notification_token('ExponentPushToken[t56mine]') $$, 'deactivating someone else''s token is a harmless no-op');
reset role;
select is((select active from public.notification_tokens where expo_push_token = 'ExponentPushToken[t56mine]'), true, 'and it stays active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000056', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.deactivate_my_notification_token('ExponentPushToken[t56mine]');
reset role;
select is((select active from public.notification_tokens where expo_push_token = 'ExponentPushToken[t56mine]'), false, 'the owner of the token switches it off');

select throws_ok($$ set local role anon; select public.deactivate_my_notification_token('ExponentPushToken[t56mine]') $$, '42501', null, 'anonymous callers are refused');

select * from finish();
rollback;
```

(Check the real argument list of `register_notification_token` in `0021_notifications.sql` / its later versions and adjust the call; keep the four assertions.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/web-push-state.test.ts tests/unit/web-push.test.ts tests/unit/push-registration.test.ts tests/unit/prompt-store.test.ts tests/unit/use-notification-channel.test.ts tests/unit/native-push.test.ts`
Expected: FAIL (missing exports/modules; push-registration "never asks").

- [ ] **Step 3: Implement**

`web-push-state.ts` — add:

```ts
export type PromptKind = "ask" | "install";

// What the first-sign-in pop-up should do: ask (permission not decided yet), point an iPhone to the install guide, or stay silent
// (unsupported browser, or the permission is already granted/denied).
export function resolvePromptKind(env: WebPushEnvironment): PromptKind | null {
  if (!env.isWeb) return null;
  if (env.ios && !env.standalone) return "install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return null;

  return env.permission === "default" ? "ask" : null;
}
```

`web-push.ts` — add `disableWebPush` (server first, then `subscription.unsubscribe()`), exactly as in the test; `use-web-push.ts` — add

```ts
  const disable = useCallback(async () => {
    setError(false);
    try {
      await disableWebPush(supabase);
      setState("default");
    } catch {
      setError(true);
    }
  }, [supabase]);
```

and return `{ disable, enable, error, state }` (the declared return type gains `disable: () => Promise<void>`).

`api.ts` — add:

```ts
export async function deactivateMyNotificationToken(supabase: NotificationsSupabaseClient, token: string) {
  const { error } = await supabase.rpc("deactivate_my_notification_token", { target_expo_push_token: token });

  if (error) throw error;
}
```

`native-push.ts` (new):

```ts
import Constants, { ExecutionEnvironment } from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deactivateMyNotificationToken } from "./api";
import { setNativePushDisabled } from "./native-push-preference";
import { registerPushToken } from "./use-push-registration";

// Remote push needs a real build: Expo Go (SDK 53+) removed it, and Android needs the topic-subscription native module.
export function nativePushSupported() {
  if (Platform.OS === "web") return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  if (Platform.OS === "android" && !requireOptionalNativeModule("ExpoTopicSubscriptionModule")) return false;

  return true;
}

export async function readNativePermission(): Promise<"denied" | "granted" | "undetermined" | "unsupported"> {
  if (!nativePushSupported()) return "unsupported";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");
  const { status } = await Notifications.getPermissionsAsync();

  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

export async function enableNativePush(supabase: Parameters<typeof registerPushToken>[0]): Promise<"denied" | "on" | "unsupported"> {
  if (!nativePushSupported()) return "unsupported";
  await setNativePushDisabled(false);
  const token = await registerPushToken(supabase, { ask: true });

  return token ? "on" : "denied";
}

export async function disableNativePush(supabase: Pick<SupabaseClient, "rpc">) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");
  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

  if (projectId) await deactivateMyNotificationToken(supabase, (await Notifications.getExpoPushTokenAsync({ projectId })).data);
  await setNativePushDisabled(true);
}
```

`native-push-preference.ts` (new; keeps `native-push.ts` ↔ `use-push-registration.ts` from importing each other):

```ts
import { createKeyValueStorage } from "../../lib/key-value-storage";

const OFF_KEY = "zenc.push-off";

export async function isNativePushDisabled() {
  return (await createKeyValueStorage().getItem(OFF_KEY)) === "1";
}

export async function setNativePushDisabled(value: boolean) {
  const storage = createKeyValueStorage();

  if (value) await storage.setItem(OFF_KEY, "1");
  else await storage.removeItem(OFF_KEY);
}
```

`use-push-registration.ts` — add `import { isNativePushDisabled } from "./native-push-preference";`, then change the signature and the permission block:

```ts
export async function registerPushToken(supabase: Parameters<typeof saveExpoPushToken>[0], options: { ask?: boolean } = {}) {
  …unchanged guards…
  // The user switched notifications off on this device: stay quiet (start-up must not quietly turn them back on).
  if (!options.ask && (await isNativePushDisabled())) return null;
  …handler and channel setup unchanged…
  let { status } = await Notifications.getPermissionsAsync();
  // Only a tap (the first-sign-in pop-up or the Settings switch) may ask; start-up only refreshes a token that is already allowed.
  if (status !== "granted" && options.ask) ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return null;
  …token and save unchanged…
}
```

`usePushRegistration` keeps calling `registerPushToken(supabase)` (no `ask`), so nothing else in the three layouts changes.

`prompt-store.ts`:

```ts
import { createKeyValueStorage } from "../../lib/key-value-storage";

const KEY = "zenc.notifications-prompted";

export async function hasBeenPrompted() {
  return (await createKeyValueStorage().getItem(KEY)) === "1";
}

export async function markPrompted() {
  await createKeyValueStorage().setItem(KEY, "1");
}
```

`prompt-kind.ts`:

```ts
import { Platform } from "react-native";

import { readNativePermission } from "./native-push";
import { readWebPushEnvironment } from "./web-push";
import { resolvePromptKind } from "./web-push-state";
import type { PromptKind } from "./web-push-state";

export async function readPromptKind(): Promise<PromptKind | null> {
  if (Platform.OS === "web") return resolvePromptKind(await readWebPushEnvironment());

  return (await readNativePermission()) === "undetermined" ? "ask" : null;
}
```

`use-notification-channel.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { useSupabaseSession } from "../../providers/AppProviders";
import { disableNativePush, enableNativePush, nativePushSupported, readNativePermission } from "./native-push";
import { isNativePushDisabled } from "./native-push-preference";
import { useWebPush } from "./use-web-push";

export type ChannelState = "denied" | "install" | "off" | "on" | "unsupported";

const FROM_WEB = { default: "off", denied: "denied", hidden: "unsupported", "ios-install": "install", on: "on" } as const;

// One view of "can this device get notifications, and are they on": Web Push in a browser, the Expo push token on a phone.
export function useNotificationChannel(): { busy: boolean; disable: () => Promise<void>; enable: () => Promise<void>; error: boolean; state: ChannelState } {
  const { supabase } = useSupabaseSession();
  const web = useWebPush();
  const [native, setNative] = useState<ChannelState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [nativeError, setNativeError] = useState(false);
  const onWeb = Platform.OS === "web";

  const readNative = useCallback(async () => {
    if (!nativePushSupported()) return setNative("unsupported");
    const permission = await readNativePermission();

    if (permission === "denied") return setNative("denied");
    setNative(permission === "granted" && !(await isNativePushDisabled()) ? "on" : "off");
  }, []);

  useEffect(() => {
    if (!onWeb) void readNative();
  }, [onWeb, readNative]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setNativeError(false);
    try {
      await action();
      await readNative();
    } catch {
      setNativeError(true);
    } finally {
      setBusy(false);
    }
  };

  if (onWeb) return { busy: false, disable: web.disable, enable: web.enable, error: web.error, state: FROM_WEB[web.state] };

  return { busy, disable: () => run(() => disableNativePush(supabase)), enable: () => run(() => enableNativePush(supabase)), error: nativeError, state: native };
}
```

Migration `supabase/migrations/0074_deactivate_my_notification_token.sql`:

```sql
-- Settings > Notifications > off on a phone: the signed-in user switches their own device's Expo token off.
-- Only the caller's row changes (someone else's token is a no-op), like deactivate_my_web_subscription (0072).
create function public.deactivate_my_notification_token(target_expo_push_token text)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  update public.notification_tokens
  set active = false, updated_at = clock_timestamp()
  where user_id = auth.uid() and expo_push_token = target_expo_push_token;
$$;

revoke all on function public.deactivate_my_notification_token(text) from public, anon;
grant execute on function public.deactivate_my_notification_token(text) to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/web-push-state.test.ts tests/unit/web-push.test.ts tests/unit/use-web-push.test.ts tests/unit/push-registration.test.ts tests/unit/prompt-store.test.ts tests/unit/use-notification-channel.test.ts tests/unit/native-push.test.ts tests/unit/notification-prompt.test.ts` (the existing `notification-prompt.test.ts` mocks `useWebPush`; add `disable: jest.fn()` to its `push()` helper if the type complains) and `npx supabase db reset && npx supabase test db`.
Expected: PASS (pgTAP all green, including the new 056).

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests supabase
git commit -m "feat(notifications): prompt eligibility, disable, quiet native start-up" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The first-sign-in pop-up (every role)

**Files:**
- Create: `src/features/notifications/NotificationsPromptGate.tsx`
- Modify: `app/_layout.tsx`, `src/i18n/locales/{en,es,pt}.ts`
- Test: new `tests/unit/notifications-prompt-gate.test.ts`; extend `tests/unit/root-layout.test.ts` only if it breaks; new/extended `tests/e2e/notifications.web.spec.ts` case

**Interfaces:**
- Consumes: `useSupabaseSession()` (`profile`), `readPromptKind`, `hasBeenPrompted`/`markPrompted`, `useNotificationChannel`, `InstallGuide` (`variant: "ios-chrome" | "ios-other" | "mac-safari"`, `visible`, `onClose`), `readInstallEnvironment`/`resolveInstallState` (to pick the guide variant exactly like `NotificationPrompt` does).
- Produces: `export function NotificationsPromptGate(): JSX.Element | null`; testIDs `notifications-prompt` (card), `notifications-prompt-backdrop`, `notifications-prompt-close`, `notifications-prompt-enable` ("Turn on"), `notifications-prompt-later` ("Not now"), `notifications-prompt-install` ("How to install", install variant).
- i18n `notificationsPrompt`: `body` "Get booking requests, confirmations and changes as soon as they happen." / pt "Receba pedidos, confirmações e mudanças de agendamento assim que acontecerem." / es "Recibe solicitudes, confirmaciones y cambios de reservas en cuanto ocurran."; `enable` "Turn on" / "Ativar" / "Activar"; `installBody` "On iPhone, notifications work once Zenc is on your Home Screen." / pt "No iPhone, as notificações funcionam depois de adicionar o Zenc à Tela de Início." / es "En iPhone, las notificaciones funcionan cuando Zenc está en tu pantalla de inicio."; `installButton` "How to install" / "Como instalar" / "Cómo instalar"; `later` "Not now" / "Agora não" / "Ahora no"; `title` "Turn on notifications?" / "Ativar notificações?" / "¿Activar notificaciones?"; `close` "Close" / "Fechar" / "Cerrar".

- [ ] **Step 1: Write the failing tests** `tests/unit/notifications-prompt-gate.test.ts`

```ts
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/notifications/prompt-kind", () => ({ readPromptKind: jest.fn() }));
jest.mock("../../src/features/notifications/prompt-store", () => ({ hasBeenPrompted: jest.fn(), markPrompted: jest.fn() }));
jest.mock("../../src/features/notifications/use-notification-channel", () => ({ useNotificationChannel: jest.fn() }));
jest.mock("../../src/features/install/environment", () => ({ readInstallEnvironment: jest.fn() }));

import { readInstallEnvironment } from "../../src/features/install/environment";
import { NotificationsPromptGate } from "../../src/features/notifications/NotificationsPromptGate";
import { readPromptKind } from "../../src/features/notifications/prompt-kind";
import { hasBeenPrompted, markPrompted } from "../../src/features/notifications/prompt-store";
import { useNotificationChannel } from "../../src/features/notifications/use-notification-channel";
import i18n from "../../src/i18n";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const enable = jest.fn();

function arrange({ kind = "ask", prompted = false, signedIn = true }: { kind?: "ask" | "install" | null; prompted?: boolean; signedIn?: boolean } = {}) {
  jest.mocked(useSupabaseSession).mockReturnValue({ profile: signedIn ? { role: "customer", userId: "u1" } : null, supabase: {} } as never);
  jest.mocked(readPromptKind).mockResolvedValue(kind);
  jest.mocked(hasBeenPrompted).mockResolvedValue(prompted);
  jest.mocked(markPrompted).mockResolvedValue(undefined);
  jest.mocked(useNotificationChannel).mockReturnValue({ busy: false, disable: jest.fn(), enable, error: false, state: "off" });
}

describe("NotificationsPromptGate", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("asks once after sign-in on a device that was never prompted, for any role", async () => {
    arrange();
    const view = await render(React.createElement(NotificationsPromptGate));

    await waitFor(() => expect(view.getByTestId("notifications-prompt")).toBeTruthy());
    expect(view.getByText("Turn on notifications?")).toBeTruthy();
    expect(markPrompted).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["signed out", { signedIn: false }],
    ["already prompted on this device", { prompted: true }],
    ["unsupported browser or permission already decided", { kind: null }],
  ] as const)("stays silent when %s", async (_name, options) => {
    arrange(options);
    const view = await render(React.createElement(NotificationsPromptGate));

    await act(async () => undefined);

    expect(view.queryByTestId("notifications-prompt")).toBeNull();
    expect(markPrompted).not.toHaveBeenCalled();
  });

  it("Turn on runs the permission + subscribe flow straight from the tap and closes", async () => {
    arrange();
    const view = await render(React.createElement(NotificationsPromptGate));

    await waitFor(() => expect(view.getByTestId("notifications-prompt-enable")).toBeTruthy());
    await fireEvent.press(view.getByTestId("notifications-prompt-enable"));

    expect(enable).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("notifications-prompt")).toBeNull();
  });

  it("Not now, the X and a tap outside close it without asking the browser", async () => {
    for (const id of ["notifications-prompt-later", "notifications-prompt-close", "notifications-prompt-backdrop"]) {
      arrange();
      const view = await render(React.createElement(NotificationsPromptGate));

      await waitFor(() => expect(view.getByTestId("notifications-prompt")).toBeTruthy());
      await fireEvent.press(view.getByTestId(id));

      expect(view.queryByTestId("notifications-prompt")).toBeNull();
      view.unmount();
    }
    expect(enable).not.toHaveBeenCalled();
  });

  it("on an iPhone without the installed app it points to the install guide instead of asking", async () => {
    arrange({ kind: "install" });
    jest.mocked(readInstallEnvironment).mockReturnValue({ capturedPrompt: null, isWeb: true, maxTouchPoints: 5, standalone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
    const view = await render(React.createElement(NotificationsPromptGate));

    await waitFor(() => expect(view.getByTestId("notifications-prompt-install")).toBeTruthy());
    expect(view.queryByTestId("notifications-prompt-enable")).toBeNull();
    await fireEvent.press(view.getByTestId("notifications-prompt-install"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
    expect(enable).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/notifications-prompt-gate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

i18n: the `notificationsPrompt` block from Interfaces in all three locales.

`src/features/notifications/NotificationsPromptGate.tsx`:

```tsx
import { Bell, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { readInstallEnvironment } from "../install/environment";
import { InstallGuide } from "../install/InstallGuide";
import { resolveInstallState } from "../install/install-state";
import { readPromptKind } from "./prompt-kind";
import { hasBeenPrompted, markPrompted } from "./prompt-store";
import { useNotificationChannel } from "./use-notification-channel";
import type { PromptKind } from "./web-push-state";

// After the first sign-in (or account creation) on a device, once: ask to turn notifications on. Silent when the device cannot do
// push or the permission is already decided; an iPhone that has not installed the app is pointed to the install guide instead
// (iPhone only has Web Push for an app on the Home Screen). Runs for every role. "Turn on" calls `enable()` straight from the tap:
// browsers and iPhone drop the user activation after an await.
export function NotificationsPromptGate() {
  const colors = useColors();
  const { t } = useTranslation();
  const { profile } = useSupabaseSession();
  const channel = useNotificationChannel();
  const [kind, setKind] = useState<PromptKind | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const userId = profile?.userId ?? null;

  useEffect(() => {
    if (!userId) {
      setKind(null);

      return undefined;
    }
    let active = true;

    void (async () => {
      if (await hasBeenPrompted()) return;
      const next = await readPromptKind();

      if (!active || !next) return;
      // Remembered as soon as it is shown: reloading, or any way of closing it, never asks again on this device.
      await markPrompted();
      if (active) setKind(next);
    })().catch(() => undefined);

    return () => {
      active = false;
    };
  }, [userId]);

  if (!kind) return null;

  const close = () => setKind(null);
  const install = resolveInstallState(readInstallEnvironment());
  const guideVariant = install.status === "installable-ios" && install.browser === "chrome" ? "ios-chrome" : "ios-other";

  return (
    <>
      <Modal animationType="fade" onRequestClose={close} transparent visible>
        <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={close} testID="notifications-prompt-backdrop">
          <Pressable className="w-full max-w-[360px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="notifications-prompt">
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1 flex-row items-center gap-2">
                <Bell color={colors.primary[600]} size={22} />
                <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{t("notificationsPrompt.title")}</Text>
              </View>
              <Pressable accessibilityLabel={t("notificationsPrompt.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={close} testID="notifications-prompt-close">
                <X color={colors.ink} size={22} />
              </Pressable>
            </View>
            <Text className="text-base font-sans text-neutral-700">{kind === "install" ? t("notificationsPrompt.installBody") : t("notificationsPrompt.body")}</Text>
            <View className="gap-2">
              {kind === "install" ? (
                <Button label={t("notificationsPrompt.installButton")} onPress={() => setGuideOpen(true)} testID="notifications-prompt-install" />
              ) : (
                <Button
                  label={t("notificationsPrompt.enable")}
                  onPress={() => {
                    void channel.enable();
                    close();
                  }}
                  testID="notifications-prompt-enable"
                />
              )}
              <Button label={t("notificationsPrompt.later")} onPress={close} testID="notifications-prompt-later" variant="ghost" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <InstallGuide onClose={() => setGuideOpen(false)} variant={guideVariant} visible={guideOpen} />
    </>
  );
}
```

(`install.status` types come from `install-state.ts`; copy the `variant` selection exactly from `NotificationPrompt.tsx` so Mac Safari/other cases behave the same. Do not call `readInstallEnvironment` during render when `kind` is `"ask"` on native: guard with `kind === "install"`, i.e. compute `guideVariant` inside the install branch.)

`app/_layout.tsx`: import the gate and mount it beside the stack, inside `ShopGate` so it never shows over the shop gate screens:

```tsx
      <ShopGate>
        <NotificationsPromptGate />
        <Stack screenOptions={{ headerShown: false }} />
      </ShopGate>
```

If `tests/unit/root-layout.test.ts` breaks (it mocks providers), add `jest.mock("../../src/features/notifications/NotificationsPromptGate", () => ({ NotificationsPromptGate: () => null }))` to it.

E2E, add to `tests/e2e/notifications.web.spec.ts` (reuse its customer sign-in helpers; grant nothing, stub `Notification`/`PushManager`/service worker as part 4's web-push e2e does, see `tests/e2e/install-helpers.ts` and the existing web-push specs): signed-in customer with `Notification.permission === "default"` and no `zenc.notifications-prompted` key sees `notifications-prompt`; tapping "Not now" closes it; after `page.reload()` it does not return; with permission `granted` or `denied` stubbed it never shows; with an iPhone user agent and `standalone` false it shows the install variant.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/notifications-prompt-gate.test.ts tests/unit/root-layout.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts`; then `npx playwright test tests/e2e/notifications.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app src tests
git commit -m "feat(notifications): ask once after the first sign-in on a device" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The "Notifications" switch in every role's Settings

**Files:**
- Create: `src/features/notifications/NotificationsSwitch.tsx`
- Modify: `src/features/account/ProfileSettingsScreen.tsx`, `src/i18n/locales/{en,es,pt}.ts`
- Test: new `tests/unit/notifications-switch.test.ts`; extend `tests/unit/profile-settings-screen.test.ts` (from PR A) or add its mocks; `tests/e2e/profile.web.spec.ts` / `tests/e2e/owner-profile.web.spec.ts` check

**Interfaces:**
- Consumes: `useNotificationChannel()`, `Toggle` (PR B: `src/components/ui/Toggle.tsx`), `InstallGuide`, the existing `webPush.deniedBody` text ("how to re-enable in the browser settings").
- Produces: `export function NotificationsSwitch(): JSX.Element | null`; testIDs `notifications-switch` (the `Toggle`), `notifications-switch-hint` (helper text), `notifications-switch-install` (iPhone not installed: tapping the row opens the guide). Hidden when `state === "unsupported"`.
- Behaviour: `on` → switch on, turning it off calls `disable()`; `off` → switch off, turning it on calls `enable()` straight from the tap; `denied` → switch off and disabled with the hint `webPush.deniedBody` (the title/body keys already exist from part 4: `webPush.deniedTitle`/`deniedBody`); `install` → switch off, pressing the row opens `InstallGuide`; `error` → hint line `webPush.error`.
- i18n `notificationsSwitch`: `label` "Notifications" / "Notificações" / "Notificaciones"; `onHint` "On for this device." / "Ativadas neste aparelho." / "Activadas en este dispositivo."; `offHint` "Off for this device." / "Desativadas neste aparelho." / "Desactivadas en este dispositivo."; `installHint` "On iPhone, add Zenc to your Home Screen first." / "No iPhone, adicione o Zenc à Tela de Início primeiro." / "En iPhone, añade Zenc a tu pantalla de inicio primero."

- [ ] **Step 1: Write the failing test** `tests/unit/notifications-switch.test.ts`

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/features/notifications/use-notification-channel", () => ({ useNotificationChannel: jest.fn() }));
jest.mock("../../src/features/install/environment", () => ({ readInstallEnvironment: jest.fn().mockReturnValue({ capturedPrompt: null, isWeb: true, maxTouchPoints: 5, standalone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" }) }));

import { NotificationsSwitch } from "../../src/features/notifications/NotificationsSwitch";
import { useNotificationChannel } from "../../src/features/notifications/use-notification-channel";
import i18n from "../../src/i18n";

const enable = jest.fn();
const disable = jest.fn();
const channel = (state: string, extra: Record<string, unknown> = {}) => jest.mocked(useNotificationChannel).mockReturnValue({ busy: false, disable, enable, error: false, state, ...extra } as never);

describe("NotificationsSwitch", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("is hidden where notifications cannot work", async () => {
    channel("unsupported");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.queryByTestId("notifications-switch")).toBeNull();
  });

  it("is on when subscribed, and turning it off deactivates this device", async () => {
    channel("on");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByText("Notifications")).toBeTruthy();
    expect(view.getByTestId("notifications-switch").props.value).toBe(true);
    await fireEvent(view.getByTestId("notifications-switch"), "valueChange", false);

    expect(disable).toHaveBeenCalledTimes(1);
    expect(enable).not.toHaveBeenCalled();
  });

  it("is off when not subscribed, and turning it on subscribes straight from the tap", async () => {
    channel("off");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByTestId("notifications-switch").props.value).toBe(false);
    await fireEvent(view.getByTestId("notifications-switch"), "valueChange", true);

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("explains how to re-enable it when the browser blocked notifications, and cannot be toggled", async () => {
    channel("denied");
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByTestId("notifications-switch").props.disabled).toBe(true);
    expect(view.getByTestId("notifications-switch-hint")).toBeTruthy();
    expect(view.getByText(/browser settings/i)).toBeTruthy();
  });

  it("on an iPhone without the installed app, opens the install guide instead of subscribing", async () => {
    channel("install");
    const view = await render(React.createElement(NotificationsSwitch));

    await fireEvent.press(view.getByTestId("notifications-switch-install"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
    expect(enable).not.toHaveBeenCalled();
  });

  it("shows the error line when subscribing failed", async () => {
    channel("off", { error: true });
    const view = await render(React.createElement(NotificationsSwitch));

    expect(view.getByText("Could not turn on notifications. Try again.")).toBeTruthy();
  });
});
```

(The `denied` assertion `/browser settings/i` must match the real `webPush.deniedBody` English text in `en.ts`; read it and use its exact wording.)

Add to `tests/unit/profile-settings-screen.test.ts` (PR A's file; add a `jest.mock("../../src/features/notifications/NotificationsSwitch", () => ({ NotificationsSwitch: () => require("react").createElement(require("react-native").Text, { testID: "notifications-switch-row" }, "row") }))` at the top) a test that the screen renders the row for every role: `languageHref` only, no `showSignOut`: `expect(view.getByTestId("notifications-switch-row")).toBeTruthy();`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/notifications-switch.test.ts tests/unit/profile-settings-screen.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

i18n block from Interfaces in all three locales.

`src/features/notifications/NotificationsSwitch.tsx`:

```tsx
import { Bell } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Toggle } from "../../components/ui/Toggle";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { readInstallEnvironment } from "../install/environment";
import { InstallGuide } from "../install/InstallGuide";
import { resolveInstallState } from "../install/install-state";
import { useNotificationChannel } from "./use-notification-channel";

// Settings row, every role: notifications on/off for THIS device. Off deactivates this device's subscription/token (it cannot
// change the browser's own permission: if the browser blocked notifications the row says how to re-enable them there).
export function NotificationsSwitch() {
  const colors = useColors();
  const { t } = useTranslation();
  const { busy, disable, enable, error, state } = useNotificationChannel();
  const [guideOpen, setGuideOpen] = useState(false);

  if (state === "unsupported") return null;

  const hint =
    state === "denied" ? t("webPush.deniedBody") : state === "install" ? t("notificationsSwitch.installHint") : state === "on" ? t("notificationsSwitch.onHint") : t("notificationsSwitch.offHint");
  const row = (
    <View className="min-h-[56px] flex-row items-center gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4">
      <Bell color={colors.primary[600]} size={22} />
      <View className="flex-1 gap-1">
        <Text className="text-base font-sans-semibold text-ink">{t("notificationsSwitch.label")}</Text>
        <Text className="text-sm font-sans text-neutral-600" testID="notifications-switch-hint">{hint}</Text>
        {error ? <Text className="text-sm font-sans text-danger-500">{t("webPush.error")}</Text> : null}
      </View>
      <Toggle
        accessibilityLabel={t("notificationsSwitch.label")}
        disabled={busy || state === "denied" || state === "install"}
        onValueChange={(next) => void (next ? enable() : disable())}
        testID="notifications-switch"
        value={state === "on"}
      />
    </View>
  );

  if (state !== "install") return row;

  const install = resolveInstallState(readInstallEnvironment());
  const variant = install.status === "installable-ios" && install.browser === "chrome" ? "ios-chrome" : "ios-other";

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setGuideOpen(true)} testID="notifications-switch-install">{row}</Pressable>
      <InstallGuide onClose={() => setGuideOpen(false)} variant={variant} visible={guideOpen} />
    </>
  );
}
```

(`onValueChange` calls `enable()` synchronously as the first thing, so the web permission request stays inside the tap. The `webPush.error` key is the existing "Could not turn on notifications. Try again." text.)

`src/features/account/ProfileSettingsScreen.tsx`: import `NotificationsSwitch` and render `<NotificationsSwitch />` right after the language `MenuBlock` (above PR A's `SignOutButton`). Update the component's top comment: "language and notifications".

E2E: in `tests/e2e/profile.web.spec.ts` and `tests/e2e/owner-profile.web.spec.ts` (stub `Notification`/`PushManager` as in the prompt test) open the role's Settings and check: `notifications-switch` is visible, off by default (`aria-checked` false), turning it on calls the (stubbed) subscribe path and shows on; with `Notification.permission = "denied"` the switch is disabled and the hint explains the browser settings. Check the three roles' settings routes render the row: `/me/settings`, `/my-profile/settings`, `/owner-profile/settings` (parents already exist: no `parents.ts` change).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/notifications-switch.test.ts tests/unit/profile-settings-screen.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts tests/unit/notification-prompt.test.ts`; then `npx playwright test tests/e2e/profile.web.spec.ts tests/e2e/owner-profile.web.spec.ts tests/e2e/professional-profile.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "feat(settings): notifications switch for every role" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs and the hosted note

**Files:** `docs/hosted-deploy.md` only if it lists migrations/secrets (part 4 added VAPID lines): add a line that migration `0074` ships a user-callable RPC and needs no secret; otherwise skip this task.

- [ ] **Step 1:** `rtk grep -n "0073\|deactivate_my_web" docs/hosted-deploy.md README.md`; add the 0074 line next to 0073's if such a list exists. Commit `docs: note migration 0074` or skip.

---

### Task 8: Final gate, browser checks, PR handoff

- [ ] **Step 1: Whole-suite gates**

```bash
npm run typecheck; echo typecheck_exit=$?
npm run lint; echo lint_exit=$?
npx jest --runInBand
npx supabase db reset && npx supabase test db
```

Expected: both exits 0 (read the real lint output), Jest green, pgTAP green. Fix, commit, then **re-run all four after the last commit**.

- [ ] **Step 2: Browser verification** (system Chrome, `.env.local` moved aside, mobile width 390x844, screenshots outside the repo and viewed):
  - Appearance: swatches + "Other colour" + hex field in each colour card; the wheel pop-up (centred card, X top-right, tap outside closes), dragging the wheel and brightness changes the hex field and the preview; computed style of the preview card's action button equals the picked colour.
  - Scheduled badge: default theme `rgb(219, 154, 52)` for dot and text; with a saved accent the dot/text/tint follow it (computed `background-color`/`color`), a confirmed badge stays green (`rgb(...)` of `success-500`).
  - First-sign-in pop-up: stubbed `Notification.permission = "default"`: shown once for customer, professional and owner sessions; Not now closes and a reload does not bring it back; `granted`/`denied`/no PushManager: never; iPhone user agent not standalone: the install variant opens the guide.
  - Settings: the switch on `/me/settings`, `/my-profile/settings`, `/owner-profile/settings` (all three roles): off → on subscribes (stubbed `pushManager.subscribe` called, RPC `register_web_push_subscription` posted), on → off posts `deactivate_my_web_subscription`; denied: disabled with the explanation.
  - Playwright: `npx playwright test tests/e2e/owner-appearance.web.spec.ts tests/e2e/notifications.web.spec.ts tests/e2e/profile.web.spec.ts tests/e2e/owner-profile.web.spec.ts tests/e2e/professional-profile.web.spec.ts tests/e2e/owner-agenda.web.spec.ts --config playwright.chrome.config.ts`.
  - **Manual, on a phone (not covered here):** a development build (not Expo Go): first launch shows the pop-up, Turn on registers the token, the Settings switch off stops pushes; Expo Go shows neither the pop-up nor the row; colour wheel drag inside the Modal on iOS and Android.

- [ ] **Step 3: Hand off** — push, open the PR, bind with `get_status`/`bind_pr`, turn on Auto-fix, never auto-merge (only when ordered; this plan itself does not push). Mention in the PR: migration 0074 must be applied wherever migrations run.
