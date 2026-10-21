# Fixed-Parent Navigation and Top Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Voltar" always goes to a fixed parent screen (never through history), on screen header buttons and on Android's hardware back; the notification bell sits at the top-right with the title below it.

**Architecture:** A pure map `ROUTE_PARENTS` (`src/lib/navigation/parents.ts`) from a route pattern (`/clients/[id]`) to its parent href. `useBack()` reads the current segments and params, looks up the parent and navigates to it (`router.dismissTo` inside the customer root stack, `router.navigate` inside the owner/barber tab navigators). A unit test scans `app/` so every screen must have a parent or be a declared root. `ScreenTopBar` is a small layout component for the three bell screens.

**Tech Stack:** Expo Router 57 (`useSegments`, `useGlobalSearchParams`, `dismissTo`), React Native `BackHandler`, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round2-design.md`

## Global Constraints
- Branch `feat-fixed-parent-navigation` from `fix-guid-validation` (or `main` once merged).
- Roots (no parent): `/`, `/login`, `/home`, `/book`, `/appointments`, `/profile`, `/my-agenda`, `/clients`, `/earnings`, `/my-profile`, `/agenda`, `/revenue`, `/manage`, `/settings`.
- History exceptions (keep `router.back()`): `/legal`, `/reset-password`.
- Customer screens live in the root `Stack` of `app/(customer)/_layout.tsx` → `router.dismissTo`; owner/barber screens are hidden tab screens → `router.navigate`; auth screens → `router.replace`.
- The role groups share one URL space (see `tests/unit/route-collisions.test.ts`); do not add duplicate URLs.
- The bell stays at the **top-right**; the strip's left and centre are reserved for future use (a function on the left, the app name in the centre) and render nothing today.
- Memory: TDD, `rtk` for noisy commands, verify UI in a browser, e2e needs `.env.local` moved aside and an Expo restart after each source change (`CI=1` has no watch). Jest matches `tests/**/*.test.ts` only.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: The parent map

**Files:**
- Create: `src/lib/navigation/parents.ts`
- Test: `tests/unit/route-parents.test.ts`

**Produces:**
```ts
export type RouteParams = Record<string, string | string[] | undefined>;
export const ROOT_ROUTES: Set<string>;
export const HISTORY_ROUTES: Set<string>;
export const ROUTE_PARENTS: Record<string, string | ((params: RouteParams) => string | null)>;
export function routePattern(segments: string[]): string;          // ["(barber)","clients","[id]"] -> "/clients/[id]"
export function parentOf(pattern: string, params?: RouteParams): string | null;
```

- [ ] **Step 1: Write the failing test** `tests/unit/route-parents.test.ts`

```ts
import { parentOf, routePattern } from "../../src/lib/navigation/parents";

describe("routePattern", () => {
  it("drops route groups and a trailing index", () => {
    expect(routePattern(["(barber)", "clients", "[id]"])).toBe("/clients/[id]");
    expect(routePattern(["(customer)", "(tabs)", "book", "service"])).toBe("/book/service");
    expect(routePattern(["(barber)", "my-profile", "index"])).toBe("/my-profile");
    expect(routePattern(["(owner)", "manage"])).toBe("/manage");
    expect(routePattern([])).toBe("/");
  });
});

describe("parentOf", () => {
  it("profile sub-screens go back to the profile hub of their role", () => {
    expect(parentOf("/me/account")).toBe("/profile");
    expect(parentOf("/me/security")).toBe("/profile");
    expect(parentOf("/my-profile/availability")).toBe("/my-profile");
    expect(parentOf("/owner-profile/privacy")).toBe("/settings");
  });

  it("nested screens go back one level", () => {
    expect(parentOf("/me/security/password")).toBe("/me/security");
    expect(parentOf("/me/language")).toBe("/me/settings");
    expect(parentOf("/my-profile/security/password")).toBe("/my-profile/security");
    expect(parentOf("/owner-profile/security/password")).toBe("/owner-profile/security");
  });

  it("a client opened from anywhere goes back to the full list", () => {
    expect(parentOf("/clients/[id]")).toBe("/clients");
  });

  it("manage screens go back to Manage and their forms to their lists", () => {
    expect(parentOf("/barbers")).toBe("/manage");
    expect(parentOf("/barber-profile")).toBe("/barbers");
    expect(parentOf("/service-form")).toBe("/services");
    expect(parentOf("/customer-form")).toBe("/customers");
    expect(parentOf("/recurrence-conflicts")).toBe("/monthly-customers");
  });

  it("notification screens go back to the role's home", () => {
    expect(parentOf("/notifications")).toBe("/home");
    expect(parentOf("/barber-notifications")).toBe("/my-agenda");
    expect(parentOf("/owner-notifications")).toBe("/agenda");
  });

  it("booking steps go back one step keeping the choices made so far", () => {
    const params = { barberId: "b1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" };

    expect(parentOf("/book/barber", params)).toBe("/home");
    expect(parentOf("/book/service", params)).toBe("/book/barber?shopId=s1");
    expect(parentOf("/book/date", params)).toBe("/book/service?shopId=s1&barberId=b1");
    expect(parentOf("/book/time", params)).toBe("/book/date?shopId=s1&barberId=b1&barberServiceId=bs1");
    expect(parentOf("/book/review", params)).toBe("/book/time?shopId=s1&barberId=b1&barberServiceId=bs1&localDate=2026-11-02");
  });

  it("roots and unknown routes have no parent", () => {
    expect(parentOf("/home")).toBeNull();
    expect(parentOf("/my-agenda")).toBeNull();
    expect(parentOf("/no-such-screen")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest tests/unit/route-parents.test.ts`
Expected: FAIL, `Cannot find module '../../src/lib/navigation/parents'`.

- [ ] **Step 3: Implement** `src/lib/navigation/parents.ts`

```ts
import { stepHref } from "../../features/booking/steps";

export type RouteParams = Record<string, string | string[] | undefined>;
type Parent = string | ((params: RouteParams) => string | null);

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

// Tab roots and entry screens: no parent, the system back button keeps its default behaviour.
export const ROOT_ROUTES = new Set([
  "/", "/login",
  "/home", "/book", "/appointments", "/profile",
  "/my-agenda", "/clients", "/earnings", "/my-profile",
  "/agenda", "/revenue", "/manage", "/settings",
]);

// Screens reachable from several places (terms, a password-reset e-mail link) keep the history behaviour.
export const HISTORY_ROUTES = new Set(["/legal", "/reset-password"]);

const bookingIds = (params: RouteParams) => ({
  barberId: text(params.barberId),
  barberServiceId: text(params.barberServiceId),
  localDate: text(params.localDate),
  shopId: text(params.shopId),
});

export const ROUTE_PARENTS: Record<string, Parent> = {
  // auth
  "/forgot-password": "/login",
  "/signup": "/login",

  // customer
  "/book/barber": "/home",
  "/book/service": (params) => stepHref("barber", bookingIds(params)),
  "/book/date": (params) => stepHref("service", bookingIds(params)),
  "/book/time": (params) => stepHref("date", bookingIds(params)),
  "/book/review": (params) => stepHref("time", bookingIds(params)),
  "/reschedule": "/appointments",
  "/notifications": "/home",
  "/me/account": "/profile",
  "/me/security": "/profile",
  "/me/security/password": "/me/security",
  "/me/settings": "/profile",
  "/me/language": "/me/settings",
  "/me/privacy": "/profile",
  "/me/about": "/profile",
  "/me/recurrence": "/profile",

  // barber
  "/clients/[id]": "/clients",
  "/move-appointment": "/my-agenda",
  "/barber-notifications": "/my-agenda",
  "/my-profile/account": "/my-profile",
  "/my-profile/availability": "/my-profile",
  "/my-profile/compensation": "/my-profile",
  "/my-profile/services": "/my-profile",
  "/my-profile/recurrence": "/my-profile",
  "/my-profile/security": "/my-profile",
  "/my-profile/security/password": "/my-profile/security",
  "/my-profile/settings": "/my-profile",
  "/my-profile/language": "/my-profile/settings",
  "/my-profile/privacy": "/my-profile",
  "/my-profile/about": "/my-profile",

  // owner
  "/owner-notifications": "/agenda",
  "/appointment-form": "/agenda",
  "/barbers": "/manage",
  "/barber-new": "/barbers",
  "/barber-profile": "/barbers",
  "/services": "/manage",
  "/service-form": "/services",
  "/customers": "/manage",
  "/customer-form": "/customers",
  "/monthly-customers": "/manage",
  "/recurrence-conflicts": "/monthly-customers",
  "/schedule": "/manage",
  "/shop": "/manage",
  "/owner-profile/account": "/settings",
  "/owner-profile/security": "/settings",
  "/owner-profile/security/password": "/owner-profile/security",
  "/owner-profile/settings": "/settings",
  "/language": "/owner-profile/settings",
  "/owner-profile/privacy": "/settings",
  "/owner-profile/about": "/settings",
};

// "/clients/[id]" from the segments the router reports: groups ("(barber)") and a trailing "index" are not part of the URL.
export function routePattern(segments: string[]) {
  const parts = segments.filter((segment) => !/^\(.*\)$/.test(segment));
  if (parts[parts.length - 1] === "index") parts.pop();

  return `/${parts.join("/")}`;
}

export function parentOf(pattern: string, params: RouteParams = {}): string | null {
  const parent = ROUTE_PARENTS[pattern];

  if (parent === undefined) return null;

  return typeof parent === "function" ? parent(params) : parent;
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest tests/unit/route-parents.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/navigation/parents.ts tests/unit/route-parents.test.ts
git commit -m "feat: fixed parent map for back navigation"
```

---

### Task 2: Every screen must declare a parent (coverage test)

**Files:**
- Test: `tests/unit/route-parents-coverage.test.ts`

**Consumes:** `ROUTE_PARENTS`, `ROOT_ROUTES`, `HISTORY_ROUTES`, `parentOf`, `routePattern` from Task 1.

- [ ] **Step 1: Write the test** (it is the guard for future screens; it passes now and fails when a route file is added without a parent)

```ts
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { HISTORY_ROUTES, parentOf, ROOT_ROUTES, ROUTE_PARENTS, routePattern } from "../../src/lib/navigation/parents";

const appDir = join(__dirname, "..", "..", "app");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? routeFiles(path) : [path];
  });
}

const patterns = routeFiles(appDir)
  .map((path) => relative(appDir, path))
  .filter((file) => file.endsWith(".tsx") && !file.split("/").pop()!.startsWith("_layout"))
  .map((file) => routePattern(file.replace(/\.tsx$/, "").split("/")));

const known = new Set([...patterns, ...ROOT_ROUTES]);
const sample = { barberId: "b1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" };

describe("fixed-parent navigation covers every screen", () => {
  it("every route file is a root, a history exception or has a parent", () => {
    const missing = patterns.filter((pattern) => !ROOT_ROUTES.has(pattern) && !HISTORY_ROUTES.has(pattern) && !(pattern in ROUTE_PARENTS));

    expect(missing).toEqual([]);
  });

  it("every parent is a real route", () => {
    const broken = Object.keys(ROUTE_PARENTS).flatMap((pattern) => {
      const parent = parentOf(pattern, sample);

      return parent !== null && !known.has(parent.split("?")[0]) ? [`${pattern} -> ${parent}`] : [];
    });

    expect(broken).toEqual([]);
  });

  it("the map has no stale entries for deleted screens", () => {
    expect(Object.keys(ROUTE_PARENTS).filter((pattern) => !patterns.includes(pattern))).toEqual([]);
  });

  it("a screen is never its own parent", () => {
    expect(Object.keys(ROUTE_PARENTS).filter((pattern) => parentOf(pattern, sample)?.split("?")[0] === pattern)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx jest tests/unit/route-parents-coverage.test.ts`
Expected: PASS. If `missing` lists a route (e.g. a screen added on another branch), add it to `ROUTE_PARENTS` in `parents.ts` with the right parent and rerun.

- [ ] **Step 3: Prove the guard works** — temporarily rename `app/(owner)/shop.tsx` → `app/(owner)/shop2.tsx`, run the test, expect FAIL (`/shop2` missing and `/shop` stale), then revert with `git checkout -- app && git status --short` (must be clean).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/route-parents-coverage.test.ts
git commit -m "test: every screen declares a back parent"
```

---

### Task 3: `useBack` and the hardware back button use the map

**Files:**
- Modify: `src/lib/navigation/use-back.ts`, `app/(customer)/_layout.tsx`, `app/(barber)/_layout.tsx`, `app/(owner)/_layout.tsx`, `src/features/notifications/NotificationsScreen.tsx`, `app/(customer)/reschedule.tsx:106` and every `useBack(...)` call site
- Test: e2e in Task 4

**Interfaces — Consumes:** Task 1. **Produces:** `useBack(): () => void` (no argument), `useParentHref(): { pattern: string; href: string | null }`, `useHardwareBack(): void`.

- [ ] **Step 1: Rewrite** `src/lib/navigation/use-back.ts`

```ts
import { useGlobalSearchParams, useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

import { HISTORY_ROUTES, parentOf, routePattern } from "./parents";

export function useParentHref() {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const pattern = routePattern(segments);

  return { group: segments[0] as string | undefined, href: parentOf(pattern, params), pattern };
}

// Back always goes to the screen's fixed parent, never through the history: after a notification or a tab hop the
// history is not the user's mental model. Customer screens sit in a root Stack (pop back to the parent), owner and
// barber screens are hidden tab screens (switch to the parent), auth screens replace.
export function useBack() {
  const router = useRouter();
  const { group, href, pattern } = useParentHref();

  return () => {
    if (href) {
      if (group === "(customer)") router.dismissTo(href as never);
      else if (group === "(auth)") router.replace(href as never);
      else router.navigate(href as never);

      return;
    }
    if (HISTORY_ROUTES.has(pattern) && router.canGoBack()) router.back();
    else router.replace("/");
  };
}

// Android's hardware/gesture back follows the same parent map; roots keep the default (leave the app).
export function useHardwareBack() {
  const back = useBack();
  const { href } = useParentHref();
  const latest = useRef(back);

  latest.current = back;
  useEffect(() => {
    if (Platform.OS !== "android" || !href) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      latest.current();

      return true;
    });

    return () => subscription.remove();
  }, [href]);
}
```

- [ ] **Step 2: Drop the argument from every call site**

```bash
grep -rl "useBack(" app src | xargs sed -i -E 's/useBack\("[^"]*"\)/useBack()/g'
grep -rn 'useBack("' app src || echo "no arguments left"
```
Expected: `no arguments left`. `NotificationsScreen.tsx` uses `useBack(HOME[role])` (a variable, not a string literal): change it to `useBack()` and delete the now-unused `HOME` constant and any unused import (`npm run lint` shows them).

- [ ] **Step 3: Reschedule's "keep" button** (`app/(customer)/reschedule.tsx`): it calls `router.back()`; replace with the screen's back:

```tsx
// add near the other hooks in the component
const back = useBack();
// ...
<Button label={t("reschedule.keep")} onPress={back} variant="outline" />
```
(import `useBack` from `../../src/lib/navigation/use-back`; remove `router` if it becomes unused.)

- [ ] **Step 3b: Mount the hardware back hook before any early return**

`app/(customer)/_layout.tsx`: in `CustomerLayout`, add `useHardwareBack();` as the first line after `const { t } = useTranslation();`.
`app/(barber)/_layout.tsx`: add `useHardwareBack();` immediately after `usePushRegistration(Boolean(barber.data));`.
`app/(owner)/_layout.tsx`: add `useHardwareBack();` immediately after `usePushRegistration(profile?.role === "owner");`.
Import from `../../src/lib/navigation/use-back` in each file.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npx jest`
Expected: PASS. (The old `useBack(fallback)` signature is gone; typecheck finds any missed caller.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: back goes to the fixed parent, on screen and on Android hardware back"
```

---

### Task 4: End-to-end back matrix (all roles)

**Files:**
- Create: `tests/e2e/back-navigation.web.spec.ts`
- Modify: any existing e2e that assumed history semantics (run the whole suite in Step 3)

- [ ] **Step 1: Write the spec** `tests/e2e/back-navigation.web.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, mockCustomerRest, shopId, signInAsCustomer } from "./customer-helpers";

// Earlier screens stay mounted (aria-hidden) in the navigators; click the active screen's back button.
const back = (page: Page) => page.locator('[data-testid="back"]:not([aria-hidden="true"] *)').click();

const staffUserId = "66666666-6666-4666-8666-666666666666";
const clientId = "44444444-4444-4444-8444-444444444444";

async function signInAs(page: Page, id: string) {
  await page.addInitScript(({ userId }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: userId }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id: userId } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { userId: id });
}

async function mockStaff(page: Page, role: "barber" | "owner", extra?: (path: string, route: import("@playwright/test").Route) => Promise<boolean>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (extra && (await extra(path, route))) return;
    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Staff", role, user_id: staffUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) {
      return json(route, [{ avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId }]);
    }
    if (path.endsWith("/shops")) return json(route, [{ id: shopId }]);
    if (path.endsWith("/rpc/list_my_barber_agenda") || path.endsWith("/rpc/list_owner_barbers") || path.endsWith("/rpc/list_my_customers")) return json(route, []);
    await route.abort();
  });
}

test.describe("customer", () => {
  test("profile sub-screens go back to the profile, one level at a time", async ({ page }) => {
    await signInAsCustomer(page);
    await mockCustomerRest(page);

    await page.goto("/profile");
    await page.getByTestId("menu-account").click();
    await expect(page).toHaveURL(/\/me\/account/);
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);

    await page.getByTestId("menu-security").click();
    await page.getByTestId("menu-password").click();
    await expect(page).toHaveURL(/\/me\/security\/password/);
    await back(page);
    await expect(page).toHaveURL(/\/me\/security$/);
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);

    await page.getByTestId("menu-settings").click();
    await page.getByTestId("menu-language").click();
    await back(page);
    await expect(page).toHaveURL(/\/me\/settings$/);
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("recurrence and notifications go back to their fixed parents even after a cold start", async ({ page }) => {
    await signInAsCustomer(page);
    await mockCustomerRest(page);

    await page.goto("/me/recurrence");
    await back(page);
    await expect(page).toHaveURL(/\/profile$/);

    await page.goto("/notifications");
    await back(page);
    await expect(page).toHaveURL(/\/home$/);
  });
});

test.describe("barber", () => {
  test("profile sub-screens go back to the hub and nested ones one level", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "barber");

    await page.goto("/my-profile");
    await page.getByTestId("menu-security").click();
    await page.getByTestId("menu-password").click();
    await expect(page).toHaveURL(/\/my-profile\/security\/password/);
    await back(page);
    await expect(page).toHaveURL(/\/my-profile\/security$/);
    await back(page);
    await expect(page).toHaveURL(/\/my-profile$/);
  });

  test("a recurrence request opened from a notification goes back to the profile, not in circles", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "barber", async (path, route) => {
      if (path.endsWith("/rpc/count_unread_notifications")) return json(route, 1).then(() => true);
      if (path.endsWith("/notifications")) {
        return json(route, [{ appointment_id: null, created_at: "2026-10-20T10:00:00Z", id: "n1", kind: "recurrence_requested", params: { customer_name: "Ana", interval_weeks: 1, service_name: "Cut" }, read_at: null }]).then(() => true);
      }
      if (path.endsWith("/rpc/list_recurrence_requests")) return json(route, []).then(() => true);

      return false;
    });

    await page.goto("/my-agenda");
    await page.getByTestId("notification-bell").click();
    await page.getByTestId("notification-n1").click();
    await expect(page).toHaveURL(/\/my-profile\/recurrence/);
    await back(page);
    await expect(page).toHaveURL(/\/my-profile$/);
  });

  test("a client opened from anywhere goes back to the full client list", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "barber");

    await page.goto("/my-agenda");
    await page.goto(`/clients/${clientId}`);
    await back(page);
    await expect(page).toHaveURL(/\/clients$/);
  });
});

test.describe("owner", () => {
  test("notifications, profile, barber profile and conflicts go back to their parents", async ({ page }) => {
    await signInAs(page, staffUserId);
    await mockStaff(page, "owner");

    await page.goto("/owner-notifications");
    await back(page);
    await expect(page).toHaveURL(/\/agenda$/);

    await page.goto("/owner-profile/security/password");
    await back(page);
    await expect(page).toHaveURL(/\/owner-profile\/security$/);
    await back(page);
    await expect(page).toHaveURL(/\/settings$/);

    await page.goto(`/barber-profile?id=${clientId}`);
    await back(page);
    await expect(page).toHaveURL(/\/barbers$/);

    await page.goto("/recurrence-conflicts");
    await back(page);
    await expect(page).toHaveURL(/\/monthly-customers$/);
  });
});
```

- [ ] **Step 2: Run it against a fresh Expo**

```bash
mv .env.local /tmp/claude-1000/env.local.bak
fuser -k 4173/tcp 2>/dev/null
(NODE_OPTIONS=--max-old-space-size=6144 CI=1 EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key nohup npx expo start --web --clear --port 4173 > /tmp/claude-1000/expo.log 2>&1 &)
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:4173 && break; sleep 2; done
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/back-navigation.web.spec.ts
```
Expected: PASS. If a customer case fails because `router.dismissTo` does not reach a tab route (`/profile`) from the root Stack, switch the customer branch of `useBack` to `router.navigate(href)` and rerun; keep whichever passes (record the choice in a code comment).

- [ ] **Step 3: Run the whole e2e suite and fix history-based expectations**

Run: `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test --workers=3` (restart Expo first if you changed source). Expected: green except the two known time-of-day `barber-booking` reminder specs when run between 23:45–00:00 (São Paulo). Fix any other failure by updating the test to the new fixed-parent behaviour, never by weakening the parent map.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): back matrix for every role"
```

---

### Task 5: `ScreenTopBar` with the bell at the top-right

**Files:**
- Create: `src/components/domain/ScreenTopBar.tsx`
- Modify: `src/components/domain/index.ts`, `app/(customer)/(tabs)/home.tsx`, `app/(barber)/my-agenda.tsx`, `app/(owner)/agenda.tsx`
- Test: `tests/e2e/notifications.web.spec.ts` (extend)

**Produces:** `<ScreenTopBar title={string} />`.

- [ ] **Step 1: Failing e2e** — append to `tests/e2e/notifications.web.spec.ts`

```ts
test("the bell sits at the top-right with the title on a line below it", async ({ page }) => {
  await page.setViewportSize({ height: 700, width: 375 });
  await signInAsCustomer(page);
  await mockCustomerRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/count_unread_notifications")) return json(route, 0), true;
    if (url.pathname.endsWith("/appointments")) return json(route, []), true;
  });

  await page.goto("/home");
  const bell = await page.getByTestId("notification-bell").boundingBox();
  const title = await page.getByRole("heading").first().boundingBox();

  expect(bell && title).toBeTruthy();
  expect(bell!.x + bell!.width).toBeGreaterThan(375 - 40); // right edge
  expect(bell!.y + bell!.height).toBeLessThanOrEqual(title!.y + 2); // above the title, not beside it
});
```
Run: `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/notifications.web.spec.ts -g "top-right"` → FAIL (bell is at the left, beside the title).

- [ ] **Step 2: Create the component** `src/components/domain/ScreenTopBar.tsx`

```tsx
import { Text, View } from "react-native";

import { NotificationBell } from "./NotificationBell";

// Top strip + title. Left and centre of the strip are reserved (a future function on the left, the app name in the
// centre); the bell stays at the right. The title sits below the strip.
export function ScreenTopBar({ title }: { title: string }) {
  return (
    <View className="w-full max-w-[420px]">
      <View className="h-11 flex-row items-center justify-between">
        <View className="w-11" />
        <View className="flex-1" />
        <NotificationBell />
      </View>
      <Text accessibilityRole="header" className="text-3xl leading-[44px] font-display-bold text-ink">{title}</Text>
    </View>
  );
}
```
Add to `src/components/domain/index.ts`: `export { ScreenTopBar } from "./ScreenTopBar";`

- [ ] **Step 3: Use it on the three screens** (each currently has a `flex-row` row with `<NotificationBell />` followed by the title `Text`). Apply:

```bash
python3 - <<'EOF'
import re

def patch(path, bell_import_old, topbar_import_new):
    s = open(path).read()
    pattern = re.compile(
        r'( *)<View className="(?:w-full max-w-\[420px\] )?flex-row items-center gap-2">\s*<NotificationBell />\s*'
        r'<Text accessibilityRole="header" className="[^"]*">\s*\{(.*?)\}\s*</Text>\s*</View>',
        re.S,
    )
    m = pattern.search(s)
    assert m, path
    s = s.replace(m.group(0), f'{m.group(1)}<ScreenTopBar title={{{m.group(2)}}} />', 1)
    assert bell_import_old in s, path
    s = s.replace(bell_import_old, topbar_import_new, 1)
    open(path, "w").write(s)

patch("app/(customer)/(tabs)/home.tsx",
      'import { NotificationBell } from "../../../src/components/domain/NotificationBell";',
      'import { ScreenTopBar } from "../../../src/components/domain/ScreenTopBar";')
patch("app/(barber)/my-agenda.tsx",
      'import { NotificationBell } from "../../src/components/domain/NotificationBell";',
      'import { ScreenTopBar } from "../../src/components/domain/ScreenTopBar";')
patch("app/(owner)/agenda.tsx",
      'import { NotificationBell } from "../../src/components/domain/NotificationBell";',
      'import { ScreenTopBar } from "../../src/components/domain/ScreenTopBar";')
EOF
grep -rn "NotificationBell" app || echo "bell only used through ScreenTopBar"
npm run typecheck && npm run lint
```
Expected: `bell only used through ScreenTopBar`; typecheck and lint clean (the three screens drop the now-unused imports automatically through the replacement above; remove any leftover unused `Text` import if lint reports it).

- [ ] **Step 4: Run the e2e again**

Restart Expo (source changed), then run: `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/e2e/notifications.web.spec.ts tests/e2e/owner-agenda.web.spec.ts tests/e2e/barber-side.web.spec.ts tests/e2e/customer-lifecycle.web.spec.ts`
Expected: PASS (existing assertions use `getByRole("heading", { name: ... })` which still matches).

- [ ] **Step 5: Screenshot check** (memory: verify UI in a browser): at 375px take screenshots of customer Home, barber Agenda and owner Agenda; confirm the bell is on the right above the title and the title is not clipped.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: ScreenTopBar puts the bell at the top-right above the title"
```

---

### Task 6: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, full web e2e; `.env.local` restored (`mv /tmp/claude-1000/env.local.bak .env.local`); push `feat-fixed-parent-navigation`; PR via `gh api` REST (base: `fix-guid-validation`). On a phone, confirm: Perfil › Meus dados › Voltar → Perfil; agenda via notificação › cliente › Voltar → lista de clientes; pedido de recorrência via notificação › Voltar → Perfil.
