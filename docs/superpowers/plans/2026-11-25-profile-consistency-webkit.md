# Profile consistency and the WebKit run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, in this session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) "Sign out" lives in Settings for the customer, owner and professional; (2) the three profile hubs share one block order and one set of icons; (3) the WebKit e2e run is meaningful: the 9 push/service-worker specs that Playwright's WebKit cannot run are skipped there with the reason, and the run command is documented.

**Architecture:** No database change. `ProfileSettingsScreen` always renders the shared `SignOutButton` (prop `showSignOut` removed); the owner and professional hubs lose their inline buttons; the three hubs are reordered to the customer's layout (install card first, then avatar, Account/Security, role blocks, Settings/Privacy/About) with the `Lock` icon for Privacy. Tests: a source-level consistency test (the repo's own pattern, see `hub-notification-card.test.ts`), the Settings unit test, and Playwright specs per role. WebKit: two `test.skip` lines and a comment in `playwright.config.ts`.

**Tech Stack:** Expo Router / React Native Web, lucide-react-native, Jest (RNTL), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-profile-consistency-webkit-design.md`

**Branch:** `fix-predeploy-polish` (PR #112, open). Commit per task. Do not push.

## Global Constraints

- Wording: "business" / "shop" (pt: estabelecimento / negócio), never "barbershop" / "barbearia".
- TDD: the failing test first, shown red.
- No database change, no migration; never `db reset`.
- Playwright on this machine: `CI=1 npm run e2e:export` then serve `.e2e-dist` (`node scripts/serve-web-static.mjs .e2e-dist 4173`), with `.env.local` moved aside (restore after), default base URL (**no** `PLAYWRIGHT_TEST_BASE_URL`: the bare `localhost` has no shop), system Chrome through a throw-away `playwright.chrome.config.ts` (`channel: "chrome"`, not committed).
- Gates after the last commit: `npm run typecheck`, ROOT `npm run lint` (read the output), full `npx jest --runInBand` (no "did not exit" line, exit 0), Playwright chromium whole suite, then Firefox and WebKit whole suite.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File map

| File | Change |
|---|---|
| `src/features/account/ProfileSettingsScreen.tsx` | always render `SignOutButton`; drop `showSignOut` |
| `app/(customer)/me/settings.tsx` | stop passing `showSignOut` |
| `app/(owner)/settings.tsx`, `app/(professional)/my-profile/index.tsx`, `app/(customer)/(tabs)/profile.tsx` | order, Privacy icon, install card first, no inline sign-out |
| `tests/unit/profile-settings-screen.test.ts` | button always shown |
| `tests/unit/profile-hubs-consistency.test.ts` (new) | the three hubs: no sign-out, one order, one icon |
| `tests/e2e/profile.web.spec.ts`, `owner-profile.web.spec.ts`, `owner-shell.web.spec.ts`, `professional-profile.web.spec.ts` | sign out through Settings; order |
| `tests/e2e/profile-helpers.ts` (new) | `hubOrder(page)` |
| `tests/e2e/notifications-prompt.web.spec.ts`, `web-push.web.spec.ts`, `playwright.config.ts` | WebKit skip + comment |

## Findings (read from the code, then run)

1. Sign out: customer in Settings through `showSignOut`; owner (`app/(owner)/settings.tsx`) and professional (`app/(professional)/my-profile/index.tsx`) have an inline `Pressable` (`testID="profile-signout"`) as the last hub element. `common.signOut` and `profile.signOut` are the same text in pt/en/es.
2. Order today: customer Settings, Privacy, About; owner Privacy, Settings, About; professional Settings, Privacy, About. Privacy icon: customer `UserCog`, owner and professional `Lock`. Install card: customer first; owner and professional after the last block.
3. After removing the inline button the owner hub still needs `useState`, `Toast`, `errorMessage` (the "also a professional" toggle's errors) and `useColors`; the professional hub needs none of `useState`, `Toast`, `errorMessage`, `signOut`, `LogOut`, `Pressable`, `useColors`.
4. Tests that expect the button on a hub: `owner-profile.web.spec.ts:62`, `owner-shell.web.spec.ts:60`; the `showSignOut` tests in `profile-settings-screen.test.ts`. `i18n.web.spec.ts:73` and `profile.web.spec.ts:28-30` already go through Settings.
5. WebKit: see the spec (section 3): 271 passed, 9 failed with the right configuration; the 9 are the two push spec files.

## Open questions

See the spec: Privacy icon, install card position, real-device checklist, permanent WebKit skip.

---

### Task 1: Sign out in Settings for every role

**Files:** `src/features/account/ProfileSettingsScreen.tsx`, `app/(customer)/me/settings.tsx`, `app/(owner)/settings.tsx`, `app/(professional)/my-profile/index.tsx`, `tests/unit/profile-settings-screen.test.ts`, `tests/unit/profile-hubs-consistency.test.ts` (new), `tests/e2e/owner-profile.web.spec.ts`, `owner-shell.web.spec.ts`, `professional-profile.web.spec.ts`

**Interfaces:**
- Produces: `ProfileSettingsScreen({ languageHref }: { languageHref: string })` (no `showSignOut`); it always renders `SignOutButton` (`testID="profile-signout"`, copy `profile.signOut`).

- [ ] **Step 1: Write the failing tests.**

`tests/unit/profile-settings-screen.test.ts`: replace the test "shows no sign-out button unless asked" with

```ts
  it.each(["/language", "/me/language", "/my-profile/language"])("shows the sign-out button on every role's Settings (%s)", async (languageHref) => {
    const view = await render(React.createElement(ProfileSettingsScreen, { languageHref }));

    expect(view.getByTestId("profile-signout")).toBeTruthy();
  });
```

and delete `, showSignOut: true` from the two remaining renders (they become `{ languageHref: "/me/language" }`).

New `tests/unit/profile-hubs-consistency.test.ts` (source-level, like `hub-notification-card.test.ts`):

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const HUBS = ["app/(customer)/(tabs)/profile.tsx", "app/(owner)/settings.tsx", "app/(professional)/my-profile/index.tsx"];
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("profile hubs", () => {
  it.each(HUBS)("%s has no sign-out button (it lives in Settings)", (file) => {
    const source = read(file);

    expect(source).not.toContain("profile-signout");
    expect(source).not.toContain("signOut(");
  });
});
```

Playwright (chromium): in `owner-profile.web.spec.ts` change the hub assertion at line 62 from `toBeVisible()` to `toHaveCount(0)` and extend the same test's end (it already opens Settings): after `await page.getByTestId("menu-settings").click(); await expect(page).toHaveURL(/\/owner-profile\/settings/);` add `await expect(page.getByTestId("profile-signout")).toBeVisible();`. Same change in `owner-shell.web.spec.ts` (line 60: hub `toHaveCount(0)`, then after opening Settings the button is visible). In `professional-profile.web.spec.ts`, in "the professional profile is a hub…" add `await expect(page.getByTestId("profile-signout")).toHaveCount(0);` before opening Settings and `await expect(page.getByTestId("profile-signout")).toBeVisible();` after the URL assertion `/\/my-profile\/settings/`. Add one sign-out test per staff role (use the spec's own `mockOwnerRest` / `mockProfessionalRest`): open Settings, press `profile-signout`, `await expect(page).toHaveURL(/\/login/)` (the mocked auth endpoint: copy the logout mock the customer sign-out spec uses; if none exists, assert the request to `/auth/v1/logout` was made with `page.waitForRequest`).

- [ ] **Step 2: Run, expect FAIL.** `npx jest tests/unit/profile-settings-screen.test.ts tests/unit/profile-hubs-consistency.test.ts` (the Settings button test fails for the roles without the prop; the hub test fails for the owner and professional hubs); `npx playwright test -c playwright.chrome.config.ts tests/e2e/owner-profile.web.spec.ts tests/e2e/owner-shell.web.spec.ts tests/e2e/professional-profile.web.spec.ts` (hub still has the button; Settings has none).

- [ ] **Step 3: Implement.**

`ProfileSettingsScreen.tsx`: signature `({ languageHref }: { languageHref: string })`, render `<SignOutButton />` unconditionally after `<NotificationsSwitch />`, and update the comment to "Settings is the same for every role: language, notifications and sign out."

`app/(customer)/me/settings.tsx`: `return <ProfileSettingsScreen languageHref="/me/language" />;`

`app/(owner)/settings.tsx`: delete the sign-out `Pressable` block (from `<Pressable` to its closing tag) and the imports `Pressable`, `LogOut`, `signOut`; keep `useState`, `Toast`, `errorMessage`, `useColors` (the toggle uses them). Keep `<Toast ... />` as is.

`app/(professional)/my-profile/index.tsx`: delete the `Pressable` block and the `Toast` element, the `error` state, and the imports `Pressable`, `LogOut`, `Toast`, `signOut`, `errorMessage`, `useState`, `useColors` (and `const colors = useColors();`). Let `./node_modules/.bin/eslint "app/(professional)/my-profile/index.tsx" "app/(owner)/settings.tsx"` and `npm run typecheck` confirm nothing unused remains and nothing else broke.

- [ ] **Step 4: Run, expect PASS:** the two unit files, `npx jest tests/unit/customer-profile-order.test.ts tests/unit/hub-notification-card.test.ts`, typecheck, lint, then the three Playwright specs plus `profile.web.spec.ts` and `i18n.web.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add src app tests
git commit -m "feat(profile): sign out lives in Settings for every role" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One order and one set of icons on the three hubs

**Files:** `app/(customer)/(tabs)/profile.tsx`, `app/(owner)/settings.tsx`, `app/(professional)/my-profile/index.tsx`, `tests/unit/profile-hubs-consistency.test.ts`, `tests/e2e/profile-helpers.ts` (new), `tests/e2e/profile.web.spec.ts`, `owner-profile.web.spec.ts`, `professional-profile.web.spec.ts`

**Interfaces:**
- Produces: `hubOrder(page: Page): Promise<string[]>` in `tests/e2e/profile-helpers.ts`: the test ids of the shared elements in document order.

- [ ] **Step 1: Write the failing tests.**

Extend `tests/unit/profile-hubs-consistency.test.ts`:

```ts
  it.each(HUBS)("%s uses the same Settings, Privacy, About order and the Lock icon for Privacy", (file) => {
    const source = read(file);
    const at = (key: string) => source.indexOf(`key: "${key}"`);

    expect(at("settings")).toBeGreaterThan(-1);
    expect(at("settings")).toBeLessThan(at("privacy"));
    expect(at("privacy")).toBeLessThan(at("about"));
    expect(source).toContain('icon: Lock, key: "privacy"');
    expect(source).not.toContain("UserCog");
  });

  it.each(HUBS)("%s shows the install card before the avatar", (file) => {
    const source = read(file);

    expect(source.indexOf("<InstallPrompt />")).toBeGreaterThan(-1);
    expect(source.indexOf("<InstallPrompt />")).toBeLessThan(source.indexOf("<Avatar"));
  });
```

New `tests/e2e/profile-helpers.ts`:

```ts
import type { Page } from "@playwright/test";

export const HUB_ORDER = ["install-card", "profile-avatar", "menu-account", "menu-security", "menu-settings", "menu-privacy", "menu-about"];

// The shared hub elements, in the order they appear on the page (role-specific blocks are not listed, so they cannot break the comparison).
export async function hubOrder(page: Page): Promise<string[]> {
  return page.evaluate((keys) => {
    const found = keys.map((key) => ({ element: document.querySelector(`[data-testid="${key}"]`), key })).filter((item) => item.element);

    return found
      .sort((a, b) => (a.element!.compareDocumentPosition(b.element!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((item) => item.key);
  }, HUB_ORDER);
}
```

In each of the three role specs add a test (customer: `profile.web.spec.ts`, using `stubInstallPrompt`, `signInAsCustomer`, `mockCustomerRest`, `goto("/profile")`; owner: `owner-profile.web.spec.ts`, `signInAsOwner` + `mockOwnerRest(page, { calls: {}, linked: false })`, `goto("/settings")`; professional: `professional-profile.web.spec.ts`, `signIn(page, professionalUserId)` + `mockProfessionalRest(page)`, `goto("/my-profile")`):

```ts
test("the hub lists the shared blocks in the common order", async ({ page }) => {
  await stubInstallPrompt(page);
  /* role sign-in and mocks as above */
  await expect(page.getByTestId("profile-avatar")).toBeVisible();

  expect(await hubOrder(page)).toEqual(HUB_ORDER);
});
```

- [ ] **Step 2: Run, expect FAIL:** the unit file (owner order and icons, install card position for owner and professional, `UserCog` on the customer) and the owner and professional Playwright tests (customer passes except nothing: it is the reference; if it passes already, say so).

- [ ] **Step 3: Implement.**

Customer hub: change `{ icon: UserCog, key: "privacy", ... }` to `{ icon: Lock, key: "privacy", ... }` and the import (`UserCog` out, `Lock` in).
Owner hub: move `<InstallPrompt />` to the first child of the `gap-6` column (before the avatar `View`); reorder the last `MenuBlock` to Settings, Privacy, About; remove the install card from its old place.
Professional hub: same two moves.

- [ ] **Step 4: Run, expect PASS:** the unit file, typecheck, lint, the role specs, the existing install-card specs (`owner-profile` "shows the install card", `professional-profile` "shows the install card").

- [ ] **Step 5: Browser check (390 px).** With the static export served, take a screenshot of each hub and each Settings screen (customer, owner, professional) at 390 x 844, and read computed style of `profile-signout` on each Settings screen (min-height 56px, border-radius 20px, danger text colour) and of `install-card` on each hub (same radius/padding). Look at the screenshots; fix anything clipped.

- [ ] **Step 6: Commit**

```bash
git add app tests
git commit -m "feat(profile): the three hubs share one order and the Lock icon for Privacy" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: WebKit run: skip the push specs Playwright's WebKit cannot run

**Files:** `tests/e2e/notifications-prompt.web.spec.ts`, `tests/e2e/web-push.web.spec.ts`, `playwright.config.ts`

- [ ] **Step 1: Show the red state (needs the engine, already installed).** Static export served, `.env.local` aside, default base URL: `PLAYWRIGHT_ENGINES=all npx playwright test --project=webkit tests/e2e/notifications-prompt.web.spec.ts tests/e2e/web-push.web.spec.ts` → 9 failed.

- [ ] **Step 2: Skip with the reason.** At the top of both files, after the imports and `test.use(...)`:

```ts
// Playwright's WebKit (a Linux port) cannot run these: (1) context.grantPermissions(["notifications"]) is a silent no-op, so the permission
// stays "default"; (2) the real PushManager.getSubscription() never settles and wedges the page (no push service on Linux); (3) once the
// service worker controls the page, requests bypass page.route. Chromium and Firefox run them. Push on real Safari is a manual check.
test.skip(({ browserName }) => browserName === "webkit", "push and service worker are not testable on Playwright's WebKit (Linux)");
```

- [ ] **Step 3: Document the run.** In `playwright.config.ts`, extend the comment above `engines`:

```ts
// Run it as: static export served on 4173 (`CI=1 npm run e2e:export`, `node scripts/serve-web-static.mjs .e2e-dist 4173`), `.env.local` moved
// aside (its LAN Supabase URL is inlined by Expo and breaks every signed-in spec), and NO PLAYWRIGHT_TEST_BASE_URL: the shop is the first
// label of the host (shop-a.localhost), a bare `localhost` shows the "open your business's link" gate.
//   PLAYWRIGHT_ENGINES=all npx playwright test --project=webkit    (or --project=firefox)
```

- [ ] **Step 4: Run, expect PASS:** the same command → the 9 are skipped; then the whole suite on WebKit: expected **271 passed, 9 skipped, 0 failed**; Firefox whole suite 280/280; Chromium whole suite 280/280 (the two files still run there). `npx playwright test --list` count unchanged (280).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e playwright.config.ts
git commit -m "test(e2e): skip the push specs on WebKit (Linux) and document how to run the engines" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Final gate and handoff

- [ ] **Step 1:** `npm run typecheck; echo typecheck_exit=$?`, `npm run lint; echo lint_exit=$?` (read the output), `npx jest --runInBand` (read `Test Suites:` and confirm no "did not exit" line), then Playwright whole suite on chromium, Firefox and WebKit with the static export of the final commit. Re-run after the last commit. pgTAP: not needed (no database change).
- [ ] **Step 2:** Report: commits, gate numbers per engine, deviations. Do not push; the orchestrator pushes.
- [ ] **Step 3 (manual, for the user, real devices):** on an iPhone and a Mac Safari: sign in, Settings shows Language, Notifications and Sign out; sign out ends on the sign-in screen; install card/guide appears; turn notifications on from Settings (iPhone only after adding the app to the Home Screen); sign in again keeps the session across a reload.
