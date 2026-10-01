# Password Recovery + Security Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The e-mail password-recovery link lands on a dedicated screen where the user sets a new password (web and native), and Profile > Security becomes a menu with a dedicated "Password" screen.

**Architecture:** A top-level `app/reset-password.tsx` route is the `redirectTo` of `resetPasswordForEmail`. Native parses the deep link fragment and calls `setSession`; web relies on `detectSessionInUrl`, with the provider recording `PASSWORD_RECOVERY` as proof the session came from a recovery link. Pure helpers live in `src/features/auth/recovery.ts`; Supabase calls in `src/features/auth/api.ts`.

**Tech Stack:** Expo Router 57, expo-linking, Supabase JS auth, react-i18next, Jest (jest-expo), Playwright web e2e, NativeWind.

**Spec:** `docs/superpowers/specs/2026-09-30-password-recovery-design.md`

## Global Constraints

- TDD: failing test first, watch it fail, minimal code, watch it pass.
- No hard-coded UI text: every string via `t()`; pt/es/en keys must match (`tests/unit/locale-parity.test.ts`, `tests/unit/no-hardcoded-text.test.ts`).
- Screens follow the Language pattern: `Screen` > `ScrollView` > `max-w-[420px]` column, `ScreenHeader` with `useBack`, `Toast` for feedback. `className` only on plain RN elements or components that accept it.
- After saving a recovered password: `signOut({ scope: "global" })`, then `/login` with a success notice.
- Customer-only Security screen; owner/barber out of scope.
- Verify UI in a real browser (screenshot + computed CSS) before claiming done.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## File Structure

- Create `src/features/auth/recovery.ts` — `parseRecoveryUrl`, recovery-proof flag (`markRecovery`/`hasRecovery`/`clearRecovery`).
- Modify `src/features/auth/api.ts` — `requestPasswordReset(…, redirectTo)`, `startRecoverySession`, `completePasswordReset`.
- Modify `src/features/auth/session.ts` — guard exemption for `reset-password`.
- Modify `src/providers/AppProviders.tsx` — call `markRecovery()` on `PASSWORD_RECOVERY`.
- Modify `app/(auth)/forgot-password.tsx` — pass `redirectTo`.
- Modify `app/(auth)/login.tsx` — success notice from route param.
- Create `app/reset-password.tsx` — the recovery screen.
- Modify `app/(customer)/me/security.tsx` (menu) and create `app/(customer)/me/security/password.tsx` (form moved).
- Modify `app/(customer)/_layout.tsx` — register `me/security/password`.
- Modify `src/i18n/locales/{pt,es,en}.ts`.
- Modify `supabase/config.toml` — redirect allowlist.
- Tests: `tests/unit/recovery.test.ts`, `tests/unit/password-reset-api.test.ts`, `tests/integration/auth.test.ts`, `tests/integration/app-providers.test.ts`, `tests/e2e/profile.web.spec.ts`, `tests/e2e/auth.web.spec.ts`.

---

### Task 1: Link parsing, recovery proof and route guard

**Files:**
- Create: `src/features/auth/recovery.ts`
- Modify: `src/features/auth/session.ts:25-28`
- Test: `tests/unit/recovery.test.ts`, `tests/integration/auth.test.ts`

**Interfaces:**
- Produces: `type RecoveryLink = { kind: "tokens"; accessToken: string; refreshToken: string } | { kind: "error" } | { kind: "none" }`; `parseRecoveryUrl(url: string | null | undefined): RecoveryLink`; `markRecovery(): void`; `hasRecovery(): boolean`; `clearRecovery(): void`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/recovery.test.ts`:

```ts
import { clearRecovery, hasRecovery, markRecovery, parseRecoveryUrl } from "../../src/features/auth/recovery";

describe("parseRecoveryUrl", () => {
  it("reads tokens from a deep link fragment", () => {
    expect(parseRecoveryUrl("barberschedule://reset-password#access_token=a&refresh_token=r&type=recovery")).toEqual({
      accessToken: "a", kind: "tokens", refreshToken: "r",
    });
  });

  it("reads tokens from an Expo Go link", () => {
    expect(parseRecoveryUrl("exp://192.168.0.2:8081/--/reset-password#access_token=a&refresh_token=r&type=recovery&expires_in=3600")).toEqual({
      accessToken: "a", kind: "tokens", refreshToken: "r",
    });
  });

  it("reports an expired or invalid link", () => {
    expect(parseRecoveryUrl("http://localhost:8081/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toEqual({ kind: "error" });
    expect(parseRecoveryUrl("barberschedule://reset-password?error=access_denied")).toEqual({ kind: "error" });
  });

  it("ignores anything that is not a recovery link", () => {
    for (const url of [null, undefined, "", "barberschedule://reset-password", "x://y#access_token=a&refresh_token=r&type=signup"]) {
      expect(parseRecoveryUrl(url)).toEqual({ kind: "none" });
    }
  });
});

describe("recovery proof", () => {
  it("is set by markRecovery and cleared by clearRecovery", () => {
    clearRecovery();
    expect(hasRecovery()).toBe(false);
    markRecovery();
    expect(hasRecovery()).toBe(true);
    clearRecovery();
    expect(hasRecovery()).toBe(false);
  });
});
```

In `tests/integration/auth.test.ts`, after the `lets anyone open the legal page` test (line ~79):

```ts
  it("lets the password-reset screen open with or without a session", () => {
    expect(getRedirect({ segments: ["reset-password"] })).toBeNull();
    expect(getRedirect({ role: "customer", segments: ["reset-password"], session: createSession() })).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npx jest tests/unit/recovery.test.ts tests/integration/auth.test.ts`
Expected: FAIL (module `recovery` not found; guard test returns `/login` and `/`).

- [ ] **Step 3: Implement**

`src/features/auth/recovery.ts`:

```ts
export type RecoveryLink =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error" }
  | { kind: "none" };

export function parseRecoveryUrl(url: string | null | undefined): RecoveryLink {
  if (!url) return { kind: "none" };

  const [beforeHash, fragment = ""] = url.split("#");
  const query = beforeHash.split("?")[1] ?? "";
  const params = new URLSearchParams([query, fragment].filter(Boolean).join("&"));

  if (params.get("error") || params.get("error_code") || params.get("error_description")) return { kind: "error" };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (accessToken && refreshToken && params.get("type") === "recovery") {
    return { accessToken, kind: "tokens", refreshToken };
  }

  return { kind: "none" };
}

// Proof that the current session came from a recovery link (set by the provider on web, by startRecoverySession on
// native). Module-level on purpose: the loading gate remounts the screen, and this must outlive it.
let recoveryProof = false;

export const markRecovery = () => {
  recoveryProof = true;
};
export const hasRecovery = () => recoveryProof;
export const clearRecovery = () => {
  recoveryProof = false;
};
```

`src/features/auth/session.ts` — replace the legal check:

```ts
  if (segments[0] === "legal" || segments[0] === "reset-password") {
    return null;
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npx jest tests/unit/recovery.test.ts tests/integration/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/recovery.ts src/features/auth/session.ts tests/unit/recovery.test.ts tests/integration/auth.test.ts
git commit -m "feat(auth): parse recovery links and exempt /reset-password from the session guard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Auth API (redirectTo, recovery session, completion) and Supabase allowlist

**Files:**
- Modify: `src/features/auth/api.ts:92-98`, `supabase/config.toml:41`
- Modify: `app/(auth)/forgot-password.tsx`, `src/providers/AppProviders.tsx:85`
- Test: `tests/unit/password-reset-api.test.ts`, `tests/integration/app-providers.test.ts`

**Interfaces:**
- Consumes: `markRecovery`, `clearRecovery`, `hasRecovery` (Task 1).
- Produces: `requestPasswordReset(supabase, email: string, redirectTo: string): Promise<void>`; `startRecoverySession(supabase, link: { accessToken: string; refreshToken: string }): Promise<boolean>`; `completePasswordReset(supabase, password: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/password-reset-api.test.ts`:

```ts
import { completePasswordReset, requestPasswordReset, startRecoverySession } from "../../src/features/auth/api";
import { clearRecovery, hasRecovery, markRecovery } from "../../src/features/auth/recovery";

const client = (auth: Record<string, jest.Mock>) => ({ auth }) as never;

describe("requestPasswordReset", () => {
  it("sends the redirect the e-mail link must open", async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });

    await requestPasswordReset(client({ resetPasswordForEmail }), "a@b.co", "barberschedule://reset-password");

    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "barberschedule://reset-password" });
  });
});

describe("startRecoverySession", () => {
  beforeEach(clearRecovery);

  it("sets the session once per token, marks the recovery and survives a remount", async () => {
    const setSession = jest.fn().mockResolvedValue({ error: null });
    const supabase = client({ setSession });
    const link = { accessToken: "a1", refreshToken: "r1" };

    await expect(startRecoverySession(supabase, link)).resolves.toBe(true);
    await expect(startRecoverySession(supabase, link)).resolves.toBe(true);

    expect(setSession).toHaveBeenCalledTimes(1);
    expect(setSession).toHaveBeenCalledWith({ access_token: "a1", refresh_token: "r1" });
    expect(hasRecovery()).toBe(true);
  });

  it("returns false and allows a retry when the tokens are rejected", async () => {
    const setSession = jest.fn().mockResolvedValue({ error: new Error("expired") });
    const supabase = client({ setSession });
    const link = { accessToken: "a2", refreshToken: "r2" };

    await expect(startRecoverySession(supabase, link)).resolves.toBe(false);
    await expect(startRecoverySession(supabase, link)).resolves.toBe(false);

    expect(setSession).toHaveBeenCalledTimes(2);
    expect(hasRecovery()).toBe(false);
  });
});

describe("completePasswordReset", () => {
  it("updates the password, signs out everywhere and clears the proof", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    markRecovery();

    await completePasswordReset(client({ signOut, updateUser }), "new-pass-1");

    expect(updateUser).toHaveBeenCalledWith({ password: "new-pass-1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(hasRecovery()).toBe(false);
  });

  it("does not sign out when the update fails", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: new Error("weak") });
    const signOut = jest.fn();

    await expect(completePasswordReset(client({ signOut, updateUser }), "x")).rejects.toThrow("weak");
    expect(signOut).not.toHaveBeenCalled();
  });
});
```

In `tests/integration/app-providers.test.ts`, add inside the `describe` (uses the existing stub; `jest.mock` for `auth/api` there only mocks `getCurrentProfile`, which is fine):

```ts
  it("records a PASSWORD_RECOVERY event as proof of a recovery session", async () => {
    clearRecovery();
    const supabase = createSupabaseStub(null);

    mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
    mockedGetCurrentProfile.mockResolvedValue(null as never);

    await render(React.createElement(AppProviders, null, React.createElement(SessionProbe)));

    await act(async () => {
      supabase.emit(createSession("user-1"), "PASSWORD_RECOVERY");
    });

    expect(hasRecovery()).toBe(true);
  });
```

and add `import { clearRecovery, hasRecovery } from "../../src/features/auth/recovery";` to its imports.

- [ ] **Step 2: Run to verify failure**

Run: `rtk npx jest tests/unit/password-reset-api.test.ts tests/integration/app-providers.test.ts`
Expected: FAIL (functions missing; flag not set).

- [ ] **Step 3: Implement**

`src/features/auth/api.ts` — add the import `import { clearRecovery, markRecovery } from "./recovery";` and replace `requestPasswordReset`:

```ts
export async function requestPasswordReset(
  supabase: Pick<AuthSupabaseClient, "auth">,
  email: string,
  redirectTo: string,
) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  throwIfError(error);
}

// The loading gate remounts the reset screen after setSession fires SIGNED_IN, so the consumed token is kept at
// module level: a remount must not spend the same refresh token twice.
let consumedRefreshToken: string | null = null;

export async function startRecoverySession(
  supabase: Pick<AuthSupabaseClient, "auth">,
  link: { accessToken: string; refreshToken: string },
) {
  if (consumedRefreshToken === link.refreshToken) return true;

  consumedRefreshToken = link.refreshToken;
  const { error } = await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });

  if (error) {
    consumedRefreshToken = null;
    return false;
  }

  markRecovery();
  return true;
}

export async function completePasswordReset(supabase: Pick<AuthSupabaseClient, "auth">, password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  throwIfError(error);
  clearRecovery();
  consumedRefreshToken = null;
  await supabase.auth.signOut({ scope: "global" });
}
```

`src/providers/AppProviders.tsx` — import `markRecovery` from `../features/auth/recovery` and add as the first line of the `onAuthStateChange` callback:

```ts
      if (event === "PASSWORD_RECOVERY") markRecovery();
```

`app/(auth)/forgot-password.tsx` — add `import * as Linking from "expo-linking";` and change the call:

```ts
      await requestPasswordReset(supabase, email.trim(), Linking.createURL("/reset-password"));
```

`supabase/config.toml` line 41:

```toml
additional_redirect_urls = ["https://127.0.0.1:3000", "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:8081", "http://localhost:8081", "barberschedule://**", "exp://**"]
```

(4173 is the e2e web default, 8081 is Expo's dev server.)

- [ ] **Step 4: Run to verify pass, then typecheck**

Run: `rtk npx jest tests/unit/password-reset-api.test.ts tests/integration/app-providers.test.ts && rtk npm run typecheck`
Expected: PASS, no type errors (a stale `requestPasswordReset` caller would fail typecheck).

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/api.ts src/providers/AppProviders.tsx "app/(auth)/forgot-password.tsx" supabase/config.toml tests/unit/password-reset-api.test.ts tests/integration/app-providers.test.ts
git commit -m "feat(auth): send a redirect with the reset e-mail and track recovery sessions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: i18n keys (pt, es, en)

**Files:**
- Modify: `src/i18n/locales/pt.ts`, `es.ts`, `en.ts`
- Test: existing `tests/unit/locale-parity.test.ts` plus the usage in Tasks 4 and 5

**Interfaces:**
- Produces keys: `auth.reset.{checking,confirm,done,invalidBody,invalidTitle,newPassword,requestNew,saveError,saveSubmit,setSubtitle,setTitle}`, `auth.login.passwordReset`, `profile.security.{passwordItem,passwordTitle}`.

- [ ] **Step 1: Add the keys**

In each locale, inside `auth.reset` (keep keys alphabetical, as the file does) add:

pt:
```ts
      checking: "Verificando o link…",
      confirm: "Confirmar nova senha",
      invalidBody: "Este link expirou ou já foi usado. Peça um novo.",
      invalidTitle: "Link inválido",
      newPassword: "Nova senha",
      requestNew: "Pedir novo link",
      saveError: "Não foi possível redefinir a senha.",
      saveSubmit: "Salvar nova senha",
      setSubtitle: "Escolha uma nova senha para a sua conta.",
      setTitle: "Nova senha",
```
es:
```ts
      checking: "Verificando el enlace…",
      confirm: "Confirmar nueva contraseña",
      invalidBody: "Este enlace venció o ya se usó. Solicita uno nuevo.",
      invalidTitle: "Enlace inválido",
      newPassword: "Nueva contraseña",
      requestNew: "Solicitar nuevo enlace",
      saveError: "No se pudo restablecer la contraseña.",
      saveSubmit: "Guardar nueva contraseña",
      setSubtitle: "Elige una nueva contraseña para tu cuenta.",
      setTitle: "Nueva contraseña",
```
en:
```ts
      checking: "Checking the link…",
      confirm: "Confirm new password",
      invalidBody: "This link has expired or was already used. Request a new one.",
      invalidTitle: "Invalid link",
      newPassword: "New password",
      requestNew: "Request a new link",
      saveError: "Unable to reset your password.",
      saveSubmit: "Save new password",
      setSubtitle: "Choose a new password for your account.",
      setTitle: "New password",
```

In `auth.login` add `passwordReset`: pt `"Senha redefinida. Entre com a nova senha."`, es `"Contraseña restablecida. Inicia sesión con la nueva contraseña."`, en `"Password reset. Sign in with your new password."`.

In `profile.security` add `passwordItem` and `passwordTitle`: pt `"Senha"`/`"Senha"`, es `"Contraseña"`/`"Contraseña"`, en `"Password"`/`"Password"`.

- [ ] **Step 2: Run parity tests**

Run: `rtk npx jest tests/unit/locale-parity.test.ts tests/unit/i18n-init.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales
git commit -m "feat(i18n): strings for the recovery screen and the Security menu

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Security menu + dedicated Password screen

**Files:**
- Create: `app/(customer)/me/security/password.tsx` (current form, moved)
- Modify: `app/(customer)/me/security.tsx` (becomes the menu), `app/(customer)/_layout.tsx:52`
- Test: `tests/e2e/profile.web.spec.ts`

**Interfaces:**
- Consumes: `profile.security.passwordItem`, `profile.security.passwordTitle` (Task 3); `MenuBlock` (`items: { key; label; icon; onPress }[]`, renders testID `menu-<key>`).

- [ ] **Step 1: Update the e2e first (failing)**

In `tests/e2e/profile.web.spec.ts`: every `page.goto("/me/security")` for the form (lines ~46 and ~72 and any later ones) becomes `page.goto("/me/security/password")`. Add:

```ts
test("security is a menu that opens the dedicated password screen", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/me/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByTestId("security-current")).toHaveCount(0);
  await page.getByTestId("menu-password").click();
  await expect(page).toHaveURL(/\/me\/security\/password$/);
  await expect(page.getByRole("heading", { name: "Password" })).toBeVisible();
  await expect(page.getByTestId("security-current")).toBeVisible();
  await page.getByTestId("back").click();
  await expect(page).toHaveURL(/\/me\/security$/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm run test:e2e:web -- tests/e2e/profile.web.spec.ts`
Expected: FAIL (menu absent; `/me/security/password` not found).

- [ ] **Step 3: Implement**

```bash
mkdir -p "app/(customer)/me/security"
git mv "app/(customer)/me/security.tsx" "app/(customer)/me/security/password.tsx"
```

In `password.tsx` fix the relative imports (one level deeper: `../../../` becomes `../../../../`), rename the component to `PasswordScreen`, and change the header title to `t("profile.security.passwordTitle")`. Everything else (state, `useMutation`, testIDs `security-*`) stays.

New `app/(customer)/me/security.tsx`:

```tsx
import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Screen } from "../../../src/components/ui/Screen";
import { useBack } from "../../../src/lib/navigation/use-back";

export default function SecurityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.security.title")} />
            <MenuBlock
              items={[{ icon: KeyRound, key: "password", label: t("profile.security.passwordItem"), onPress: () => router.push("/me/security/password") }]}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

`app/(customer)/_layout.tsx`: after `<Stack.Screen name="me/security" />` add `<Stack.Screen name="me/security/password" />`.

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm run typecheck && rtk npx jest tests/unit/route-collisions.test.ts tests/unit/no-hardcoded-text.test.ts && rtk npm run test:e2e:web -- tests/e2e/profile.web.spec.ts`
Expected: PASS. If the e2e runner cannot start because of `.env.local` (LAN Supabase URL), move it aside for the run per project memory and restore it after.

- [ ] **Step 5: Commit**

```bash
git add -A app tests/e2e/profile.web.spec.ts
git commit -m "feat(profile): Security becomes a menu with a dedicated Password screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reset screen and login notice

**Files:**
- Create: `app/reset-password.tsx`
- Modify: `app/(auth)/login.tsx`, `app/_layout.tsx` only if the root `Stack` needs no change (it does not; the route is picked up by file name)
- Test: `tests/e2e/auth.web.spec.ts`

**Interfaces:**
- Consumes: `parseRecoveryUrl`, `hasRecovery` (Task 1); `startRecoverySession`, `completePasswordReset` (Task 2); `validateNewPassword` from `src/features/account/security`; i18n keys (Task 3).

- [ ] **Step 1: Write the failing e2e**

Append to `tests/e2e/auth.web.spec.ts` (it already imports `json`; check the top and add `customerRow`, `mockCustomerRest`, `customerUserId` imports from `./customer-helpers` if missing):

```ts
function recoveryHash() {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
  const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: customerUserId }))}.`;

  return `#access_token=${token}&refresh_token=e2e-recovery&token_type=bearer&expires_in=3600&type=recovery`;
}

const recoveryUser = { app_metadata: {}, aud: "authenticated", created_at: "2026-09-23T10:00:00Z", email: "customer@example.com", id: customerUserId, user_metadata: {} };

test("the recovery link opens the new-password screen, saves it and returns to login", async ({ page }) => {
  let updated: Record<string, unknown> | null = null;
  let loggedOutGlobally = false;

  await mockCustomerRest(page);
  await page.route("**/auth/v1/user", (route) => {
    if (route.request().method() === "PUT") updated = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, recoveryUser);
  });
  await page.route("**/auth/v1/logout**", (route) => {
    loggedOutGlobally = route.request().url().includes("scope=global");
    return route.fulfill({ status: 204 });
  });

  await page.goto(`/reset-password${recoveryHash()}`);
  await expect(page.getByRole("heading", { name: "New password" })).toBeVisible();
  await page.getByTestId("reset-new").fill("brand-new-1");
  await page.getByTestId("reset-confirm").fill("different-1");
  await expect(page.getByTestId("reset-submit")).toBeDisabled();
  await page.getByTestId("reset-confirm").fill("brand-new-1");
  await page.getByTestId("reset-submit").click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Password reset. Sign in with your new password.")).toBeVisible();
  expect(updated).toMatchObject({ password: "brand-new-1" });
  expect(loggedOutGlobally).toBe(true);
});

test("an expired recovery link shows the invalid state with a way to request another", async ({ page }) => {
  await page.goto("/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
  await expect(page.getByRole("heading", { name: "Invalid link" })).toBeVisible();
  await page.getByRole("button", { name: "Request a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("opening /reset-password with an ordinary session does not offer the form", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page);
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Invalid link" })).toBeVisible();
});
```

(Import `signInAsCustomer` too.)

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm run test:e2e:web -- tests/e2e/auth.web.spec.ts`
Expected: FAIL (route missing).

- [ ] **Step 3: Implement the screen**

`app/reset-password.tsx`:

```tsx
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Text, View } from "react-native";

import { SkeletonBlock } from "../src/components/domain/SkeletonLoader";
import { Toast } from "../src/components/domain/Toast";
import { Button } from "../src/components/ui/Button";
import { Input } from "../src/components/ui/Input";
import { Screen } from "../src/components/ui/Screen";
import { validateNewPassword } from "../src/features/account/security";
import { completePasswordReset, startRecoverySession } from "../src/features/auth/api";
import { hasRecovery, parseRecoveryUrl } from "../src/features/auth/recovery";
import { errorMessage } from "../src/i18n/errors";
import { useSupabaseSession } from "../src/providers/AppProviders";

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isLoading, session, supabase } = useSupabaseSession();
  const [status, setStatus] = useState<Status>("checking");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = next || confirm ? validateNewPassword(next, confirm) : null;
  const problemText = problem === "password" ? t("profile.security.tooShort") : problem === "mismatch" ? t("profile.security.mismatch") : undefined;

  // Web: detectSessionInUrl already turned the link into a session; the provider recorded the PASSWORD_RECOVERY proof.
  useEffect(() => {
    if (Platform.OS !== "web" || isLoading) return;
    setStatus(session && hasRecovery() ? "ready" : "invalid");
  }, [isLoading, session]);

  // Native: the deep link carries the tokens in its fragment.
  useEffect(() => {
    if (Platform.OS === "web") return;

    let active = true;
    const handle = async (url: string | null) => {
      const link = parseRecoveryUrl(url);

      if (link.kind === "none") return;
      if (link.kind === "error") return active && setStatus("invalid");

      const ok = await startRecoverySession(supabase, link);

      if (active) setStatus(ok ? "ready" : "invalid");
    };

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", (event) => void handle(event.url));
    const timeout = setTimeout(() => active && setStatus((current) => (current === "checking" ? "invalid" : current)), 8000);

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [supabase]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await completePasswordReset(supabase, next);
      router.replace({ params: { notice: "password-reset" }, pathname: "/login" });
    } catch (caught) {
      setError(errorMessage(caught, t as never, t("auth.reset.saveError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            {status === "checking" ? (
              <>
                <Text className="text-base font-sans text-neutral-600">{t("auth.reset.checking")}</Text>
                <SkeletonBlock height={56} width={320} />
              </>
            ) : null}
            {status === "invalid" ? (
              <>
                <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.reset.invalidTitle")}</Text>
                <Text className="text-base font-sans text-neutral-600">{t("auth.reset.invalidBody")}</Text>
                <Button label={t("auth.reset.requestNew")} onPress={() => router.replace("/forgot-password")} size="lg" />
                <Button label={t("auth.reset.backToSignIn")} onPress={() => router.replace("/login")} variant="ghost" />
              </>
            ) : null}
            {status === "ready" ? (
              <>
                <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.reset.setTitle")}</Text>
                <Text className="text-base font-sans text-neutral-600">{t("auth.reset.setSubtitle")}</Text>
                <Input label={t("auth.reset.newPassword")} onChangeText={setNext} secureTextEntry testID="reset-new" value={next} />
                <Input error={problemText} label={t("auth.reset.confirm")} onChangeText={setConfirm} secureTextEntry testID="reset-confirm" value={confirm} />
                <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
                <Button
                  disabled={saving || !next || validateNewPassword(next, confirm) !== null}
                  label={t("auth.reset.saveSubmit")}
                  onPress={() => void save()}
                  size="lg"
                  testID="reset-submit"
                />
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

Check that `Button` accepts `testID` (it does in `security.tsx`) and `SkeletonBlock` exports as used in `(customer)/_layout.tsx`.

`app/(auth)/login.tsx`: add `useLocalSearchParams` to the `expo-router` import, then inside the component:

```tsx
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [noticeVisible, setNoticeVisible] = useState(true);
```

and above the error `Toast`:

```tsx
            <Toast message={t("auth.login.passwordReset")} onDismiss={() => setNoticeVisible(false)} variant="success" visible={notice === "password-reset" && noticeVisible} />
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest tests/unit/no-hardcoded-text.test.ts tests/unit/route-collisions.test.ts && rtk npm run test:e2e:web -- tests/e2e/auth.web.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/reset-password.tsx "app/(auth)/login.tsx" tests/e2e/auth.web.spec.ts
git commit -m "feat(auth): new-password screen for the recovery link

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Real-flow verification and visual check

**Files:** none (verification only; fix and commit anything found)

- [ ] **Step 1: Integration against local Supabase**

With `supabase start` running, add `tests/integration/password-recovery.test.ts` following the style of `tests/integration/signup.test.ts` (read it first for the client/admin helpers): create a user, call `requestPasswordReset(client, email, "http://127.0.0.1:4173/reset-password")`, read the e-mail from Inbucket (`http://127.0.0.1:54324/api/v1/mailbox/<local-part>`), extract the verify link, follow it without redirect to obtain the `Location` fragment, run `parseRecoveryUrl` on it, `startRecoverySession` on a fresh client, `completePasswordReset(client, "Recovered-1!")`, and assert `signInWithPassword` works with the new password and fails with the old one. Run: `rtk npx jest tests/integration/password-recovery.test.ts`. Expected: PASS. If the redirect is rejected by the allowlist, `supabase stop && supabase start` to reload `config.toml`.

- [ ] **Step 2: Visual check in the browser**

Start the web app via the project's launch config (see skill `running-barberschedule-locally`), open `/reset-password` with a real recovery link from Inbucket, then `/me/security` and `/me/security/password`. Take screenshots and check computed CSS (font families, background `canvas`, max width 420px, button colours) against the Language screen. Test at mobile width (375) too.

- [ ] **Step 3: Full verify**

Run: `rtk npm run verify`
Expected: all green (restore `.env.local` if it was moved aside).

- [ ] **Step 4: Native check**

In Expo Go, request a reset from the phone, open the e-mail link, confirm the app opens on the new-password screen (Expo Go uses `exp://…/--/reset-password`), set a password and land on login with the notice. Record the result honestly; if only web could be verified, say so.

- [ ] **Step 5: Push and open the PR**

Branch off `main` first (`feat-password-recovery`), push, and open the PR via `gh api` REST (see memory: `gh pr create` hits a Projects-classic GraphQL error). Bind it with the ccd_pr tools and read CI.
