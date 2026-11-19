# Feedback 18/11 — PR A: quick fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six small fixes from the 18/11 test round: the install card leads the customer profile with "Install the **Zenc** app", sign out moves into the customer Settings, the login screen is centred with the Zenc wordmark and every password field gets an eye toggle, the CEP field stops at 9 characters, the owner Agenda drops its redundant "Day: <date>" line, and the owner tab/titles read "Calendar" in English.

**Architecture:** No new subsystem. `Input` gains the eye toggle itself, so login, signup, reset-password and the customer "change password" screen get it with no screen edits. A tiny `Wordmark` component (text + circle, no image asset, per ADR 017) is added for the login screen. Sign out becomes a small `SignOutButton` mounted by the shared `ProfileSettingsScreen` behind a prop. The "Calendar" rename uses a new owner-only i18n key because `tabs.agenda` is shared with the customer and professional tab bars.

**Tech Stack:** Expo SDK 58 / React Native 0.88 / react-native-web, Expo Router, NativeWind (className on plain RN elements only), react-i18next (pt/es/en with parity test), `lucide-react-native` icons, Jest (jest-expo, RNTL 14 async `render`), Playwright (system Chrome) for browser checks.

**Spec:** `docs/superpowers/specs/2026-11-19-feedback-1811-design.md` (section "PR A — quick fixes")

**Branch:** `feat-feedback-a-quick-fixes`, cut from `main` (after PR #103 `b68a4ff`). This plan does not depend on B, C or D. See "Order between the four plans" below.

## Open questions for the orchestrator

None blocks starting; each says what this plan does meanwhile.

1. **`tabs.agenda` is shared by three roles (spec vs code).** The spec says "English `tabs.agenda` becomes Calendar". Today `tabs.agenda` labels the owner tab (`app/(owner)/_layout.tsx:23`), the customer tab (`app/(customer)/(tabs)/_layout.tsx:19`) and the professional tab (`app/(professional)/_layout.tsx:22`); customer e2e (`tests/e2e/i18n.web.spec.ts:59`) and `tests/unit/bottom-tab-bar.test.ts` rely on "Agenda". The decision in the spec is "the *owner's* Agenda tab is called Calendar". **Plan does:** a new key `tabs.calendar` (en "Calendar", pt "Agenda", es "Agenda") used only by the owner layout; `tabs.agenda` is untouched.
2. **"The agenda title becomes Calendar" — which text?** The owner screen title is `owner.agenda.titleDay/Week/Month` ("Day agenda"…). **Plan does:** English becomes "Day calendar" / "Week calendar" / "Month calendar" (keeps the view in the title, reads as "Calendar"); pt/es unchanged. If the user wants the bare word "Calendar" for all three, change three strings in `en.ts` and the e2e headings in Task 6.
3. **Which install-card variants get "Install the Zenc app"?** The card has three variants (Chrome prompt, iPhone/iPad guide, Safari-on-Mac guide) with different titles today ("Install the app", "Add to Home Screen", "Add to Dock"). **Plan does:** all three variants use the one title "Install the **Zenc** app" (bodies stay specific; the guide pop-up titles `install.iosTitle`/`macTitle` are unchanged because they name the exact action).
4. **Sign out only moves for the customer.** Owner (`app/(owner)/settings.tsx`) and professional (`app/(professional)/my-profile/index.tsx`) keep their own sign-out buttons (the spec lists only the customer). The shared `ProfileSettingsScreen` gets the button behind `showSignOut`, only the customer route passes it.
5. **Reset-password inputs** (`app/reset-password.tsx`) and the customer "change password" screen also get the eye (they share `Input`); the spec says "if they share the component".

## Global Constraints

- Texts in pt/es/en with parity (`tests/unit/locale-parity.test.ts`, `DeepStringRecord`); no hard-coded text (`tests/unit/no-hardcoded-text.test.ts`).
- Customer profile: the install card is the **first** item when the app is not installed; text "Install the **Zenc** app" with "Zenc" in bold (pt/es/en).
- Sign out moves from the customer profile to the customer Settings screen (`/me/settings`); keep testID `profile-signout`.
- Login: content centred vertically, Zenc wordmark above the fields, eye icon toggling password visibility.
- CEP field: max length 9 characters (`00000-000`).
- Owner Agenda: the "Day: <date>" line is removed in **day** view; it stays in week and month view.
- English owner tab and agenda title say "Calendar"; Portuguese and Spanish keep "Agenda".
- Brand (ADR `docs/decisions/017-brand-identity.md`): wordmark `ZENC.` in Oswald Bold; the period is a **circle** in wine `#7A1F2B` on light, `#C4455A` on dark. In-app it is code (Oswald text + circular `View`), not an image asset.
- Project conventions: colours by tokens (a literal colour only for brand constants, see Task 4); `className` only on plain React Native elements (not on third-party components); every `<Input>` has a placeholder except `secureTextEntry` ones (`tests/unit/input-placeholders.test.ts`); pop-ups are centred floating cards.
- **Gate per task:** `npm run typecheck`, `./node_modules/.bin/eslint app src tests scripts`, the Jest files named. **Final gate (Task 7):** `npm run typecheck`, ROOT `npm run lint` (read the real output and exit code: `npm run lint; echo exit=$?`, never `| tail`, CI lints `public/` and other root folders too), `npx jest --runInBand` (whole suite, ~5 min), then **re-run all three after the last commit**, then browser screenshots of every changed screen.

## Order between the four plans

- A is independent and can go first. It touches `app/(owner)/agenda.tsx` (range line, Task 6) and `ProfileSettingsScreen.tsx` (Task 2).
- **C** later replaces the Agenda date box and the prev/next buttons with `DateField`; if A is already merged, C starts from A's `agendaNavKeys` change (Task 6 here). If C goes first, A's Task 6 reduces to deleting the `Text` that renders `RANGE_LABEL` for `view === "day"` (C keeps the line in week/month).
- **D** (Settings "Notifications" switch) edits `ProfileSettingsScreen.tsx` too: A first, then D adds its switch under A's `SignOutButton` block.
- Merge order recommended: A, B, C, D (rebase each on the previous after merge; conflicts are limited to the two files above).

## File structure

| File | Responsibility |
|---|---|
| `src/features/install/InstallPrompt.tsx` (modify) | card title "Install the <b>Zenc</b> app" through `Trans` |
| `src/i18n/locales/{en,es,pt}.ts` (modify) | `install.cardTitle`, `common.showPassword/hidePassword`, `tabs.calendar`, English owner agenda titles |
| `app/(customer)/(tabs)/profile.tsx` (modify) | install card first; sign-out removed |
| `src/features/account/SignOutButton.tsx` (new) | the sign-out button + error toast (moved code) |
| `src/features/account/ProfileSettingsScreen.tsx` (modify) | `showSignOut` prop |
| `app/(customer)/me/settings.tsx` (modify) | passes `showSignOut` |
| `src/components/ui/Input.tsx` (modify) | eye toggle for `secureTextEntry` |
| `src/lib/design/brand.ts` (new) | wordmark colour constants |
| `src/components/domain/Wordmark.tsx` (new) | text "ZENC" + circular period |
| `app/(auth)/login.tsx` (modify) | vertical centring, wordmark |
| `src/components/ui/MaskedInputs.tsx` (modify) | `CepInput maxLength={9}` |
| `src/features/appointments/agenda-nav.ts` (modify) | `range` key (null in day view) |
| `app/(owner)/agenda.tsx` (modify) | render the range line only when `nav.range` |
| `app/(owner)/_layout.tsx` (modify) | tab label `tabs.calendar` |
| `tests/unit/*.test.ts`, `tests/e2e/*.web.spec.ts` | listed per task |

---

### Task 1: Install card first, with "Zenc" in bold

**Files:**
- Modify: `src/features/install/InstallPrompt.tsx`
- Modify: `app/(customer)/(tabs)/profile.tsx`
- Modify: `src/i18n/locales/en.ts`, `es.ts`, `pt.ts` (the `install` block, near `en.ts:394`)
- Test: `tests/unit/install-prompt.test.ts` (modify), new `tests/unit/customer-profile-order.test.ts`
- Modify (e2e): `tests/e2e/profile.web.spec.ts:197`

**Interfaces:**
- Consumes: `useInstallPrompt()` (unchanged), `Trans` from `react-i18next`.
- Produces: i18n key `install.cardTitle` = `"Install the <b>Zenc</b> app"` (pt `"Instalar o app <b>Zenc</b>"`, es `"Instalar la app <b>Zenc</b>"`). `install.chromeTitle` is removed (only `InstallPrompt` used it; verify with `rtk grep -rn chromeTitle app src tests`).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/install-prompt.test.ts` replace the two title assertions. Line 28 `expect(view.getByText("Install the app")).toBeTruthy();` becomes:

```ts
    expect(view.getByText("Install the Zenc app")).toBeTruthy();
    expect(view.getByText("Zenc").props.className).toContain("font-sans-bold");
```

and in the "opens the Chrome-iOS guide…" test replace `expect(view.getByText("Add to Home Screen")).toBeTruthy();` with `expect(view.getByText("Install the Zenc app")).toBeTruthy();` (the guide's own title "Add to Home Screen" is still shown inside the guide after the tap; keep the guide assertions below it unchanged). Do the same for the Mac variant test (`"Add to Dock"` → `"Install the Zenc app"` for the card).

Create `tests/unit/customer-profile-order.test.ts` (the install card must be the first block of the profile, and sign out must be gone):

```ts
import { render } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ session: { user: { email: "a@b.c" } }, supabase: {} }) }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: () => ({ shop: { id: "s1" } }) }));
jest.mock("../../src/features/account/use-my-profile", () => ({ useMyProfile: () => ({ data: { avatarUrl: null, fullName: "Ana", nickname: "" } }) }));
jest.mock("../../src/features/customers/api", () => ({ listMyCustomers: jest.fn().mockResolvedValue([]) }));
jest.mock("../../src/features/install/InstallPrompt", () => {
  const { Text } = jest.requireActual("react-native");

  return { InstallPrompt: () => jest.requireActual("react").createElement(Text, { testID: "install-card" }, "install") };
});
jest.mock("../../src/features/notifications/NotificationPrompt", () => ({ NotificationPrompt: () => null }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import CustomerProfileScreen from "../../app/(customer)/(tabs)/profile";
import i18n from "../../src/i18n";

const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

describe("customer profile", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("puts the install card before the avatar and the menus", async () => {
    const view = await render(React.createElement(QueryClientProvider, { client: client() }, React.createElement(CustomerProfileScreen)));
    const order = JSON.stringify(view.toJSON());

    expect(order.indexOf("install-card")).toBeGreaterThan(-1);
    expect(order.indexOf("install-card")).toBeLessThan(order.indexOf("profile-avatar"));
  });

  it("no longer offers sign out (it lives in Settings)", async () => {
    const view = await render(React.createElement(QueryClientProvider, { client: client() }, React.createElement(CustomerProfileScreen)));

    expect(view.queryByTestId("profile-signout")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/install-prompt.test.ts tests/unit/customer-profile-order.test.ts`
Expected: FAIL ("Unable to find an element with text: Install the Zenc app"; install card after the avatar; `profile-signout` still present).

- [ ] **Step 3: Implement**

`src/i18n/locales/en.ts`, in `install`: replace `chromeTitle: "Install the app",` with `cardTitle: "Install the <b>Zenc</b> app",`. In `es.ts` the same key with `"Instalar la app <b>Zenc</b>"`, in `pt.ts` with `"Instalar o app <b>Zenc</b>"` (and delete `chromeTitle` in both). Keep every other `install.*` key.

`src/features/install/InstallPrompt.tsx`: add `Trans` and one shared title node.

```tsx
import { Trans, useTranslation } from "react-i18next";
```

Above the component add:

```tsx
// "Install the <b>Zenc</b> app": the brand name is bold in every language (the translation marks it with <b>).
function CardTitle() {
  return (
    <Text className="text-base font-sans-semibold text-ink">
      <Trans components={{ b: <Text className="font-sans-bold" /> }} i18nKey="install.cardTitle" />
    </Text>
  );
}
```

Chrome variant: replace `<Text className="text-base font-sans-semibold text-ink">{t("install.chromeTitle")}</Text>` with `<CardTitle />`. iPhone/Mac variant: delete `const title = mac ? t("install.macTitle") : t("install.iosTitle");`, drop the `accessibilityLabel={title}` prop from the `Pressable` (the translated string contains `<b>`, so it cannot be a label; the visible text is the accessible name on web and native) and replace the title `Text` with `<CardTitle />`.

`app/(customer)/(tabs)/profile.tsx`: move `<InstallPrompt />` to be the first child of the `gap-6` column, before the avatar block, and delete the sign-out `Pressable`, its `error` state, the `Toast`, and the now unused imports (`LogOut`, `Pressable`, `Toast`, `signOut`, `errorMessage`, `useState`, `useColors`/`colors`). Keep `<NotificationPrompt />` where it is (after the menus). Resulting JSX order: `<InstallPrompt />`, avatar block, three `MenuBlock`s, `<NotificationPrompt />`.

Update the e2e `tests/e2e/profile.web.spec.ts:197`: `getByText("Install the app")` → `getByText("Install the Zenc app")`. In the same file line 28 (`profile-signout` visible on the profile) is handled in Task 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/install-prompt.test.ts tests/unit/customer-profile-order.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts`
Expected: PASS. If `Trans` renders the literal `<b>` text, check that `components` is an object keyed by the tag name and that the i18n instance has `interpolation.escapeValue` false (see `src/i18n/index.ts`); do not work around it with string splitting.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src app tests
git commit -m "feat(profile): install card first, Zenc in bold" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sign out moves to the customer Settings

**Files:**
- Create: `src/features/account/SignOutButton.tsx`
- Modify: `src/features/account/ProfileSettingsScreen.tsx`
- Modify: `app/(customer)/me/settings.tsx`
- Test: new `tests/unit/profile-settings-screen.test.ts`
- Modify (e2e): `tests/e2e/profile.web.spec.ts:28`, `tests/e2e/i18n.web.spec.ts:70`

**Interfaces:**
- Produces: `export function SignOutButton(): JSX.Element` (no props; testID `profile-signout`; on failure shows `Toast` with `profile.signOutError`); `ProfileSettingsScreen` props become `{ languageHref: string; showSignOut?: boolean }`.
- Consumes: `signOut(supabase)` from `src/features/auth/api`, `useSupabaseSession`.

- [ ] **Step 1: Write the failing test**

`tests/unit/profile-settings-screen.test.ts`:

```ts
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../src/lib/navigation/use-back", () => ({ useBack: () => jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: { id: "client" } }) }));
jest.mock("../../src/features/auth/api", () => ({ signOut: jest.fn() }));

import { signOut } from "../../src/features/auth/api";
import { ProfileSettingsScreen } from "../../src/features/account/ProfileSettingsScreen";
import i18n from "../../src/i18n";

describe("ProfileSettingsScreen sign out", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("shows no sign-out button unless asked", async () => {
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref: "/me/language" }));

    expect(view.queryByTestId("profile-signout")).toBeNull();
  });

  it("signs out through the shared auth helper", async () => {
    jest.mocked(signOut).mockResolvedValue(undefined);
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref: "/me/language", showSignOut: true }));

    await fireEvent.press(view.getByTestId("profile-signout"));

    expect(signOut).toHaveBeenCalledWith({ id: "client" });
  });

  it("shows the sign-out error", async () => {
    jest.mocked(signOut).mockRejectedValue(new Error("offline"));
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref: "/me/language", showSignOut: true }));

    await fireEvent.press(view.getByTestId("profile-signout"));

    await waitFor(() => expect(view.getByText("Unable to sign out.")).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/profile-settings-screen.test.ts`
Expected: FAIL (module `SignOutButton` / no `profile-signout` rendered).

- [ ] **Step 3: Implement**

`src/features/account/SignOutButton.tsx` (the code moved out of the customer profile):

```tsx
import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";

import { Toast } from "../../components/domain/Toast";
import { errorMessage } from "../../i18n/errors";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { signOut } from "../auth/api";

export function SignOutButton() {
  const colors = useColors();
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-[20px] border border-neutral-200 bg-surface"
        onPress={async () => {
          try {
            await signOut(supabase);
          } catch (caught) {
            setError(errorMessage(caught, t, t("profile.signOutError")));
          }
        }}
        testID="profile-signout"
      >
        <LogOut color={colors.danger[500]} size={20} />
        <Text className="text-base font-sans-semibold text-danger-500">{t("profile.signOut")}</Text>
      </Pressable>
      <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
    </>
  );
}
```

`src/features/account/ProfileSettingsScreen.tsx`: change the signature and body:

```tsx
import { SignOutButton } from "./SignOutButton";

// Settings is the same for every role: language today (and, in PR D, notifications). `languageHref` is the role's own
// language route; only the customer shows sign out here (the other roles have it on their own hubs).
export function ProfileSettingsScreen({ languageHref, showSignOut = false }: { languageHref: string; showSignOut?: boolean }) {
```

and after the `MenuBlock`, inside the same `gap-4` column: `{showSignOut ? <SignOutButton /> : null}`.

`app/(customer)/me/settings.tsx`: `<ProfileSettingsScreen languageHref="/me/language" showSignOut />`.

E2E: in `tests/e2e/profile.web.spec.ts:28` replace `await expect(page.getByTestId("profile-signout")).toBeVisible();` with a check that it is **not** on the hub and is in Settings:

```ts
  await expect(page.getByTestId("profile-signout")).toHaveCount(0);
  await page.getByTestId("menu-settings").click();
  await expect(page.getByTestId("profile-signout")).toBeVisible();
```

In `tests/e2e/i18n.web.spec.ts:70` (Portuguese profile) replace the `profile-signout` line with `await page.getByTestId("menu-settings").click();` followed by `await expect(page.getByTestId("profile-signout")).toContainText("Sair");` (keep the two `menu-*` assertions before it).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/profile-settings-screen.test.ts tests/unit/customer-profile-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src app tests
git commit -m "feat(profile): sign out lives in customer settings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Eye toggle on password fields

**Files:**
- Modify: `src/components/ui/Input.tsx`
- Modify: `src/i18n/locales/en.ts`, `es.ts`, `pt.ts` (`common` block, near `en.ts:29`)
- Test: `tests/unit/input.test.ts` (modify)

**Interfaces:**
- Produces: when `secureTextEntry` is true, `Input` renders a `Pressable` (`testID` = `` `${testID}-toggle` `` when the input has a testID) with `accessibilityLabel` `common.showPassword` / `common.hidePassword`; the `TextInput` keeps its own testID and its `secureTextEntry` prop is `true` until toggled. Text inputs without `secureTextEntry` are unchanged.
- i18n: `common.showPassword` ("Show password" / "Mostrar senha" / "Mostrar contraseña"), `common.hidePassword` ("Hide password" / "Ocultar senha" / "Ocultar contraseña").

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/input.test.ts`, inside the existing top-level, as a new `describe`)

```ts
describe("Input password toggle", () => {
  it("hides the text by default and reveals it on the eye", async () => {
    const view = await render(React.createElement(Input, { label: "Password", onChangeText: jest.fn(), secureTextEntry: true, testID: "pw", value: "secret" }));

    expect(view.getByTestId("pw").props.secureTextEntry).toBe(true);
    await fireEvent.press(view.getByTestId("pw-toggle"));
    expect(view.getByTestId("pw").props.secureTextEntry).toBe(false);
    await fireEvent.press(view.getByTestId("pw-toggle"));
    expect(view.getByTestId("pw").props.secureTextEntry).toBe(true);
  });

  it("labels the eye for screen readers and flips the label", async () => {
    const view = await render(React.createElement(Input, { label: "Password", onChangeText: jest.fn(), secureTextEntry: true, testID: "pw", value: "" }));

    expect(view.getByLabelText("Show password")).toBeTruthy();
    await fireEvent.press(view.getByTestId("pw-toggle"));
    expect(view.getByLabelText("Hide password")).toBeTruthy();
  });

  it("has no eye on a normal field", async () => {
    const view = await render(React.createElement(Input, { label: "Name", onChangeText: jest.fn(), testID: "name", value: "" }));

    expect(view.queryByTestId("name-toggle")).toBeNull();
  });
});
```

`tests/unit/input.test.ts` imports `fireEvent`/`render` already. If the file does not set the language, add `import i18n from "../../src/i18n";` and `beforeAll(async () => i18n.changeLanguage("en"));` in the new `describe`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/input.test.ts`
Expected: FAIL (`pw-toggle` not found).

- [ ] **Step 3: Implement**

i18n `common` block: add the two keys in all three locales (alphabetical position is not enforced; keep near `signOut`).

`src/components/ui/Input.tsx`: imports

```tsx
import { Eye, EyeOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import { useColors } from "../../lib/design/theme/ThemeProvider";
```

Inside `Input`, after `const [focused, setFocused] = useState(false);` add:

```tsx
  const { t } = useTranslation();
  const colors = useColors();
  const [revealed, setRevealed] = useState(false);
  const passwordField = Boolean(secureTextEntry);
```

Replace the `<TextInput …/>` element by a wrapper (the label and the error stay as they are):

```tsx
      <View className="justify-center">
        <TextInput
          accessibilityLabel={label}
          className={`${heightClassName} rounded-xl px-4 font-sans text-base text-ink bg-surface ${borderClassName} ${passwordField ? "pr-12" : ""}`}
          {...passThrough}
          multiline={multiline}
          onSubmitEditing={next ? () => next.current?.focus() : onSubmitEditing}
          ref={inputRef}
          returnKeyType={next ? "next" : returnKeyType}
          submitBehavior={next ? "submit" : undefined}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor="#9C8E7B"
          secureTextEntry={passwordField && !revealed}
          testID={testID}
          value={value}
        />
        {passwordField ? (
          <Pressable
            accessibilityLabel={revealed ? t("common.hidePassword") : t("common.showPassword")}
            accessibilityRole="button"
            className="absolute right-0 top-0 h-input-height w-12 items-center justify-center"
            hitSlop={4}
            onPress={() => setRevealed((current) => !current)}
            testID={testID ? `${testID}-toggle` : undefined}
          >
            {revealed ? <EyeOff color={colors.neutral[500]} size={20} /> : <Eye color={colors.neutral[500]} size={20} />}
          </Pressable>
        ) : null}
      </View>
```

(The `className` string on the first `TextInput` must keep exactly the same classes as before plus the optional `pr-12`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/input.test.ts tests/unit/input-placeholders.test.ts tests/unit/locale-parity.test.ts tests/unit/signup-validation.test.ts`
Expected: PASS. Then run the whole `tests/unit` files that render screens with inputs: `npx jest tests/unit/recovery.test.ts tests/unit/shop-gate.test.ts` (they must still pass).

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "feat(ui): show/hide eye on password fields" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Login centred with the Zenc wordmark

**Files:**
- Create: `src/lib/design/brand.ts`, `src/components/domain/Wordmark.tsx`
- Modify: `app/(auth)/login.tsx`
- Test: new `tests/unit/wordmark.test.ts`
- Modify (e2e): `tests/e2e/auth.web.spec.ts` (add a centring + wordmark check, see Step 5)

**Interfaces:**
- Produces: `export const WORDMARK_COLOR = { dark: "#C4455A", light: "#7A1F2B" } as const;` and `export function Wordmark({ size }: { size?: number }): JSX.Element` (accessibilityRole `image`, accessibilityLabel `common.appName` = "Zenc", testID `wordmark`; text "ZENC" in Oswald Bold + a circle `View` testID `wordmark-dot`).

- [ ] **Step 1: Write the failing test** `tests/unit/wordmark.test.ts`

```ts
import { render } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";

import { Wordmark } from "../../src/components/domain/Wordmark";
import { WORDMARK_COLOR } from "../../src/lib/design/brand";
import i18n from "../../src/i18n";

describe("Wordmark", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("spells ZENC with a round wine-coloured period", async () => {
    const view = await render(React.createElement(Wordmark, { scheme: "light" }));

    expect(view.getByText("ZENC")).toBeTruthy();
    expect(view.getByLabelText("Zenc")).toBeTruthy();
    const dot = StyleSheet.flatten(view.getByTestId("wordmark-dot").props.style);

    expect(dot.backgroundColor).toBe(WORDMARK_COLOR.light);
    expect(dot.borderRadius).toBeGreaterThanOrEqual(dot.width / 2);
  });

  it("uses the light wine on dark backgrounds", async () => {
    const view = await render(React.createElement(Wordmark, { scheme: "dark" }));

    expect(StyleSheet.flatten(view.getByTestId("wordmark-dot").props.style).backgroundColor).toBe(WORDMARK_COLOR.dark);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/wordmark.test.ts`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement**

`src/lib/design/brand.ts`:

```ts
// The Zenc brand mark is not part of a shop's colour theme: the period of the wordmark is always the Zenc wine
// (docs/decisions/017-brand-identity.md).
export const WORDMARK_COLOR = { dark: "#C4455A", light: "#7A1F2B" } as const;
```

`src/components/domain/Wordmark.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Text, View, useColorScheme } from "react-native";

import { WORDMARK_COLOR } from "../../lib/design/brand";

export type WordmarkProps = { scheme?: "dark" | "light"; size?: number };

// ZENC. in Oswald Bold with the period drawn as a circle (the "icon is the name" decision, ADR 017). No image asset: text + a View.
export function Wordmark({ scheme, size = 44 }: WordmarkProps) {
  const { t } = useTranslation();
  const system = useColorScheme();
  const dot = Math.round(size * 0.18);
  const color = WORDMARK_COLOR[(scheme ?? system) === "dark" ? "dark" : "light"];

  return (
    <View accessibilityLabel={t("common.appName")} accessibilityRole="image" className="flex-row items-end self-center" testID="wordmark">
      <Text className="font-display-bold text-ink" style={{ fontSize: size, letterSpacing: size * 0.06, lineHeight: size * 1.1 }}>ZENC</Text>
      <View style={{ backgroundColor: color, borderRadius: dot, height: dot, marginBottom: size * 0.14, marginLeft: size * 0.05, width: dot }} testID="wordmark-dot" />
    </View>
  );
}
```

`app/(auth)/login.tsx`: import `Wordmark`; change the scroll view and put the wordmark first:

```tsx
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Wordmark />
            <Text accessibilityRole="header" …>
```

(rest unchanged). The title stays an accessibility header; the wordmark is an image.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/wordmark.test.ts tests/unit/no-hardcoded-text.test.ts tests/unit/root-layout.test.ts`
Expected: PASS. (`no-hardcoded-text` must not flag "ZENC": if it does, move the literal to a `BRAND_WORD = "ZENC"` constant in `brand.ts` the test already tolerates, or add the exemption beside the existing ones, saying why: it is a logotype, not translatable text.)

- [ ] **Step 5: Browser check and e2e assertion, then commit**

Add to `tests/e2e/auth.web.spec.ts` (inside the login test group; reuse its helpers, mobile viewport 390x844):

```ts
test("the login form is centred vertically and shows the Zenc wordmark", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/login");
  const wordmark = page.getByTestId("wordmark");
  await expect(wordmark).toBeVisible();
  const form = await page.getByTestId("login-email").boundingBox();
  const top = (await wordmark.boundingBox())!.y;
  // Not stuck at the top: the wordmark starts well below the status area and the form sits in the middle band.
  expect(top).toBeGreaterThan(120);
  expect(form!.y + form!.height / 2).toBeGreaterThan(300);
  expect(form!.y + form!.height / 2).toBeLessThan(560);
  await page.getByTestId("login-password-toggle").click();
  await expect(page.getByTestId("login-password")).toHaveAttribute("type", "text");
});
```

Run (procedure from earlier plans: `.env.local` moved aside, system Chrome): `npm run e2e:export` then `npx playwright test tests/e2e/auth.web.spec.ts --config playwright.chrome.config.ts`. Take a mobile-width screenshot of `/login` (outside the repo, e.g. `/tmp/claude-1000/.../scratchpad/login.png`) and look at it.

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src app tests
git commit -m "feat(auth): centred login with the Zenc wordmark" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: CEP max length 9

**Files:**
- Modify: `src/components/ui/MaskedInputs.tsx` (`CepInput`, line ~44)
- Test: new `tests/unit/masked-inputs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { CepInput } from "../../src/components/ui/MaskedInputs";
import i18n from "../../src/i18n";

describe("CepInput", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("stops at 9 characters (00000-000)", async () => {
    const view = await render(React.createElement(CepInput, { label: "ZIP", onChangeValue: jest.fn(), testID: "cep", value: "" }));

    expect(view.getByTestId("cep").props.maxLength).toBe(9);
  });

  it("masks typed digits", async () => {
    const onChangeValue = jest.fn();
    const view = await render(React.createElement(CepInput, { label: "ZIP", onChangeValue, testID: "cep", value: "" }));

    await fireEvent.changeText(view.getByTestId("cep"), "01310100");

    expect(onChangeValue).toHaveBeenCalledWith("01310-100");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/masked-inputs.test.ts`
Expected: FAIL (`maxLength` is undefined).

- [ ] **Step 3: Implement**

In `CepInput` add the prop before `{...rest}` is overridden: `<Input {...rest} keyboardType="number-pad" maxLength={9} onChangeText=… />` (so a caller cannot widen it).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/masked-inputs.test.ts tests/unit/cep.test.ts tests/unit/shop-contact.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "fix(shop): CEP field stops at 9 characters" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Owner Agenda — no "Day:" line in day view; "Calendar" in English

**Files:**
- Modify: `src/features/appointments/agenda-nav.ts`, `app/(owner)/agenda.tsx`, `app/(owner)/_layout.tsx`
- Modify: `src/i18n/locales/en.ts` (`tabs` line 58; `owner.agenda` lines 549–575), `es.ts`, `pt.ts` (add `tabs.calendar`)
- Test: `tests/unit/agenda-nav.test.ts` (modify), new `tests/unit/owner-calendar-label.test.ts`
- Modify (e2e): `tests/e2e/owner-agenda.web.spec.ts:55,117,122,127`, `tests/e2e/owner-shell.web.spec.ts` (tab label, if asserted)

**Interfaces:**
- Produces: `agendaNavKeys(view)` returns `{ next, previous, range, title }` where `range` is `null` for `"day"` and `` `owner.agenda.range${suffix}` `` (week: `rangeWeek`, month: `rangeMonth`) otherwise; i18n `tabs.calendar` (en "Calendar", pt "Agenda", es "Agenda"); English `owner.agenda.titleDay/Week/Month` = "Day calendar" / "Week calendar" / "Month calendar".
- Consumes (Task 6 only): existing `RANGE_LABEL` in the agenda screen is deleted (replaced by `nav.range`).

- [ ] **Step 1: Write the failing tests**

`tests/unit/agenda-nav.test.ts`: change the expectations to include `range`:

```ts
it("returns per-view keys", () => {
  expect(agendaNavKeys("day")).toEqual({ next: "owner.agenda.nextDay", previous: "owner.agenda.previousDay", range: null, title: "owner.agenda.titleDay" });
  expect(agendaNavKeys("week")).toEqual({ next: "owner.agenda.nextWeek", previous: "owner.agenda.previousWeek", range: "owner.agenda.rangeWeek", title: "owner.agenda.titleWeek" });
  expect(agendaNavKeys("month")).toEqual({ next: "owner.agenda.nextMonth", previous: "owner.agenda.previousMonth", range: "owner.agenda.rangeMonth", title: "owner.agenda.titleMonth" });
});
```

`tests/unit/owner-calendar-label.test.ts`:

```ts
import i18n from "../../src/i18n";

describe("owner calendar naming", () => {
  it("English owner tab and titles say Calendar; the shared tab key still says Agenda", async () => {
    await i18n.changeLanguage("en");

    expect(i18n.t("tabs.calendar")).toBe("Calendar");
    expect(i18n.t("owner.agenda.titleDay")).toBe("Day calendar");
    expect(i18n.t("tabs.agenda")).toBe("Agenda");
  });

  it.each(["pt", "es"])("%s keeps Agenda", async (language) => {
    await i18n.changeLanguage(language);

    expect(i18n.t("tabs.calendar")).toBe("Agenda");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/agenda-nav.test.ts tests/unit/owner-calendar-label.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`agenda-nav.ts`:

```ts
export function agendaNavKeys<V extends AgendaNavView>(view: V) {
  const suffix = SUFFIX[view];

  return {
    next: `owner.agenda.next${suffix}` as const,
    previous: `owner.agenda.previous${suffix}` as const,
    // The day view already shows its date in the date box, so it has no range line.
    range: (view === "day" ? null : `owner.agenda.range${suffix}`) as V extends "day" ? null : `owner.agenda.range${typeof SUFFIX[V]}`,
    title: `owner.agenda.title${suffix}` as const,
  };
}
```

(If that conditional type fights TypeScript, return the simpler `range: view === "day" ? null : (`owner.agenda.range${suffix}` as "owner.agenda.rangeMonth" | "owner.agenda.rangeWeek")` and keep `V` out of it; the unit test above pins the values.)

`app/(owner)/agenda.tsx`: delete the `RANGE_LABEL` constant; the line becomes

```tsx
            {nav.range ? <Text className="text-center text-sm font-sans text-neutral-600">{t(nav.range, { date: formatDateNumeric(localDate, language) })}</Text> : null}
```

(The `rangeDay` key stays in the locales: PR C reuses nothing from it; delete it there if lint/`locale` tests do not require it, or leave it for the date-range copy, your call, but keep pt/es/en in parity.)

`en.ts`: `tabs: { agenda: "Agenda", calendar: "Calendar", … }`, `titleDay: "Day calendar"`, `titleMonth: "Month calendar"`, `titleWeek: "Week calendar"`. `pt.ts` and `es.ts`: `tabs.calendar: "Agenda"` (titles unchanged). `app/(owner)/_layout.tsx:23`: `label: t("tabs.calendar")`.

E2E: `tests/e2e/owner-agenda.web.spec.ts` headings "Day agenda" → "Day calendar", "Week agenda" → "Week calendar", "Month agenda" → "Month calendar" (lines 55, 117, 122, 127); add `await expect(page.getByText(/^Day: /)).toHaveCount(0);` after the first day-view assertion and, in the week-view block, `await expect(page.getByText(/^Week: /)).toBeVisible();` (check the exact `owner.agenda.rangeWeek` string in `en.ts` and match it). In `owner-shell.web.spec.ts` search `rtk grep -n "Agenda" tests/e2e/owner-shell.web.spec.ts` and update only owner-tab assertions to "Calendar".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/agenda-nav.test.ts tests/unit/owner-calendar-label.test.ts tests/unit/locale-parity.test.ts tests/unit/bottom-tab-bar.test.ts tests/unit/owner-layout-declares-screens.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src app tests
git commit -m "feat(owner): calendar naming and no day range line" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final gate, browser checks, PR handoff

**Files:** none new.

- [ ] **Step 1: Whole-suite gates**

```bash
npm run typecheck; echo typecheck_exit=$?
npm run lint; echo lint_exit=$?
npx jest --runInBand
```

Expected: typecheck_exit=0, lint_exit=0 (read the actual output lines; the run before this plan's own commit style failed CI once because only the tail of `npm run lint` was read), Jest green. Fix anything, commit, then **re-run all three after the last commit** and record the numbers.

- [ ] **Step 2: Browser verification** (system Chrome, `.env.local` moved aside per `reference_local_dev_gotchas`; static export `npm run e2e:export`, serve `npm run e2e:serve`; mobile width 390x844; screenshots saved outside the repo and viewed)

Check and capture: customer `/profile` (install card first with bold "Zenc"; stub the install prompt via `tests/e2e/install-helpers.ts`); customer `/me/settings` (sign-out button, danger colour via computed style `color` equals the danger token); `/login` (wordmark + vertical centring + eye toggles type between `password`/`text`); the password fields of `/signup` and `/reset-password` (eye present); owner Shop CEP field (typing 10 digits yields `00000-000`); owner Agenda in day view (no "Day:" line), week and month views (line present), English bottom tab "Calendar", Portuguese tab "Agenda". Computed-style check for the wordmark dot: `getComputedStyle(dot).backgroundColor` equals `rgb(122, 31, 43)` in light mode.

- [ ] **Step 3: Playwright run of the touched specs**

```bash
npx playwright test tests/e2e/profile.web.spec.ts tests/e2e/i18n.web.spec.ts tests/e2e/auth.web.spec.ts tests/e2e/owner-agenda.web.spec.ts tests/e2e/owner-shell.web.spec.ts --config playwright.chrome.config.ts
```

Expected: all pass (e2e is not part of CI, run it here).

- [ ] **Step 4: Hand off**

Push, open the PR, bind it with `get_status`/`bind_pr`, turn on Auto-fix (`set_monitor`); never auto-merge. (Only when the orchestrator orders implementation: this plan itself does not push.)
