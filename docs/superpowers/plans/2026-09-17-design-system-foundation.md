# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Barberschedule design system as a reusable, screen-independent library: NativeWind/Tailwind infra, color/motion/shadow token mirrors, and the base (`Button`, `Input`, `Card`) and domain (`StatusBadge`, `RatingStars`, `BarberCard`, `ServiceCard`, `CalendarStrip`, `TimeSlotPicker`, `AppointmentCard`, `EmptyState`, `Toast`, `SkeletonLoader`) component set.

**Architecture:** Every component is presentational (props in, JSX out — no Supabase/query/navigation calls), built test-first with `@testing-library/react-native`, and exposes visual *state* (selected/disabled/error) through `accessibilityState` rather than through Tailwind class strings — NativeWind's class-to-style resolution isn't reliably inspectable from Jest, but `accessibilityState` is both a real accessibility requirement (§8) and a stable test seam. Shadow elevation (§6) is implemented as plain `Platform.select` style objects (not Tailwind classes), so it *is* directly assertable in tests.

**Tech Stack:** Expo Router, React Native 0.86, React 19, NativeWind v4, Tailwind v3, `lucide-react-native`, `react-native-reanimated`, Jest (`jest-expo` preset) + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-17-design-system-foundation-design.md`

## Global Constraints

- No `@/` import alias — every import is relative, matching the rest of the codebase (spec's documented deviation from `DESIGN_SYSTEM.md` §0).
- No inline hex in components. Two exceptions: `src/lib/design/colors.ts` itself, and SVG/icon `color`/`fill` props that read from `colors.ts` (`DESIGN_SYSTEM.md` §1.3).
- Numbers that are price, duration, time, or counters use `style={{ fontVariant: ["tabular-nums"] }}` (§1.2).
- Interactive elements: minimum 44×44 hit target (`min-w-[44px] min-h-[44px]` or `hitSlop={8}`) (§1.4).
- Weight classes always pair with the matching family class — never bare `font-bold`/`font-medium`/`font-semibold` (§1.1): `font-sans` (400), `font-sans-medium` (500), `font-sans-semibold` (600), `font-sans-bold` (700), `font-display-semibold` (600, Oswald), `font-display-bold` (700, Oswald).
- Any component with a selected/disabled/error state sets `accessibilityState={{ selected }}` / `{{ disabled }}` accordingly, and icon-only interactive elements set `accessibilityLabel` (§8) — this is also the primary test seam for that state.
- Copy inside components (default labels, empty-state text) is English, matching the app's existing shipped UI copy (`app/index.tsx`, `app/(public)/book/*`, `tests/e2e/booking.web.spec.ts`) — `DESIGN_SYSTEM.md`'s Portuguese mockup text is illustrative brand documentation, not literal required strings. Components that render caller-supplied text (names, prices, messages) take that text as a prop; they never hardcode domain copy.
- The domain appointment status enum is `"scheduled" | "confirmed" | "completed" | "cancelled" | "no_show"` (`src/features/appointments/types.ts`), not `DESIGN_SYSTEM.md` §2.6's illustrative `confirmed/pending/cancelled/completed`. `StatusBadge` maps: `scheduled`→`warning-500` (doc's "pending" tone — not yet confirmed), `confirmed`→`success-500`, `completed`→`neutral-600`, `cancelled`→`neutral-400`, `no_show`→`danger-500` (not in the doc; reuses the feedback "negative outcome" tone deliberately).
- `BarberCard`'s rating row uses a single filled `Star` icon (size 14, `warning-400`) + numeric text, per its own §12.1 mockup — not the 5-star `RatingStars` row from §12.7, which is a separate component for a future rating screen. (The doc's prose and mockup disagree here; the more specific mockup wins.)
- Every task is TDD: write the failing test, run it, implement, run it again, then run `npm run typecheck` before committing. Do not batch typecheck/test runs across multiple tasks.
- After the final task, run the full gate (`npm run verify`) and request a code review of the diff before calling the plan done.

---

## Task 1: NativeWind/Tailwind setup

**Files:**
- Create: `tailwind.config.ts`
- Create: `global.css`
- Create: `nativewind-env.d.ts`
- Modify: `babel.config.js`
- Modify: `metro.config.js`
- Modify: `jest.config.js`
- Test: `tests/unit/tailwind-config.test.ts`

**Interfaces:**
- Produces: `tailwind.config.ts` default export with `theme.extend.colors` keys `primary` (50–900), `ink`, `"ink-soft"`, `canvas`, `surface`, `mist`, `wine` (50/100/500), `neutral` (50–900), `danger` (50/500/600), `success` (500), `warning` (400/500); `theme.extend.spacing` keys `"safe-horizontal"`, `"input-height"`, `"button-height"`, `"button-height-sm"`, `"button-height-lg"`, `"slot-height"`; `theme.extend.fontFamily` keys `sans`, `"sans-medium"`, `"sans-semibold"`, `"sans-bold"`, `display`, `"display-semibold"`, `"display-bold"`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npx expo install nativewind tailwindcss@^3
npx expo install expo-font @expo-google-fonts/oswald @expo-google-fonts/inter
npx expo install lucide-react-native react-native-svg
npx expo install react-native-reanimated
```

- [ ] **Step 2: Write the failing config test**

```ts
// tests/unit/tailwind-config.test.ts
import tailwindConfig from "../../tailwind.config";

describe("tailwind config tokens", () => {
  const { theme } = tailwindConfig;
  const colors = theme!.extend!.colors as Record<string, unknown>;
  const spacing = theme!.extend!.spacing as Record<string, string>;
  const fontFamily = theme!.extend!.fontFamily as Record<string, string[]>;

  it("defines the primary amber scale", () => {
    expect(colors.primary).toEqual({
      50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
      400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
      800: "#56380E", 900: "#392509",
    });
  });

  it("defines the charcoal/surface anchors", () => {
    expect(colors.ink).toBe("#171412");
    expect(colors["ink-soft"]).toBe("#241F1B");
    expect(colors.canvas).toBe("#F7F3EE");
    expect(colors.surface).toBe("#FFFDFA");
    expect(colors.mist).toBe("#ECE6DE");
  });

  it("defines the wine accent", () => {
    expect(colors.wine).toEqual({ 50: "#FBEEEF", 100: "#F4DBDD", 500: "#7A1F2B" });
  });

  it("defines feedback tokens", () => {
    expect(colors.danger).toEqual({ 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" });
    expect(colors.success).toEqual({ 500: "#2F9E5B" });
    expect(colors.warning).toEqual({ 400: "#E8A93B", 500: "#C98A1F" });
  });

  it("defines the semantic height/spacing tokens", () => {
    expect(spacing["safe-horizontal"]).toBe("20px");
    expect(spacing["input-height"]).toBe("52px");
    expect(spacing["button-height"]).toBe("52px");
    expect(spacing["button-height-sm"]).toBe("44px");
    expect(spacing["button-height-lg"]).toBe("60px");
    expect(spacing["slot-height"]).toBe("56px");
  });

  it("maps weight classes to Oswald/Inter family files", () => {
    expect(fontFamily.sans).toEqual(["Inter_400Regular"]);
    expect(fontFamily["sans-medium"]).toEqual(["Inter_500Medium"]);
    expect(fontFamily["sans-semibold"]).toEqual(["Inter_600SemiBold"]);
    expect(fontFamily["sans-bold"]).toEqual(["Inter_700Bold"]);
    expect(fontFamily.display).toEqual(["Oswald_500Medium"]);
    expect(fontFamily["display-semibold"]).toEqual(["Oswald_600SemiBold"]);
    expect(fontFamily["display-bold"]).toEqual(["Oswald_700Bold"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/tailwind-config.test.ts`
Expected: FAIL — `tailwind.config` module not found.

- [ ] **Step 4: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
          400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
          800: "#56380E", 900: "#392509",
        },
        ink: "#171412",
        "ink-soft": "#241F1B",
        canvas: "#F7F3EE",
        surface: "#FFFDFA",
        mist: "#ECE6DE",
        wine: { 50: "#FBEEEF", 100: "#F4DBDD", 500: "#7A1F2B" },
        neutral: {
          50: "#FAF8F5", 100: "#F2EEE8", 200: "#E4DDD3", 300: "#CBBFAF",
          400: "#9C8E7B", 500: "#736555", 600: "#564A3D", 700: "#3D3327",
          800: "#2A231A", 900: "#171412",
        },
        danger: { 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" },
        success: { 500: "#2F9E5B" },
        warning: { 400: "#E8A93B", 500: "#C98A1F" },
      },
      spacing: {
        "safe-horizontal": "20px",
        "input-height": "52px",
        "button-height": "52px",
        "button-height-sm": "44px",
        "button-height-lg": "60px",
        "slot-height": "56px",
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
        display: ["Oswald_500Medium"],
        "display-semibold": ["Oswald_600SemiBold"],
        "display-bold": ["Oswald_700Bold"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/tailwind-config.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Wire NativeWind into Babel, Metro, global.css, and TS types**

```js
// babel.config.js
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo", "nativewind/babel"],
  };
};
```

```js
// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
```

```css
/* global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```ts
// nativewind-env.d.ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 7: Extend Jest's transform allowlist for NativeWind's runtime packages**

`jest-expo`'s default `transformIgnorePatterns` doesn't include `nativewind` or its `react-native-css-interop` dependency, both of which ship untranspiled ESM — component tests will fail with `SyntaxError: Cannot use import statement outside a module` without this.

```js
// jest.config.js
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEach: ["<rootDir>/jest.setup.ts"],
  testMatch: ["**/*.test.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|nativewind|react-native-css-interop|react-native-svg|react-native-reanimated)/)",
  ],
};
```

Keep the existing `setupFilesAfterEach` line exactly as-is — only the `transformIgnorePatterns` key is new.

- [ ] **Step 8: Verify the full suite still passes and typecheck is clean**

Run: `npm run typecheck && npm test -- --runInBand`
Expected: PASS — no regressions from the config changes.

- [ ] **Step 9: Commit**

```bash
git add tailwind.config.ts global.css nativewind-env.d.ts babel.config.js metro.config.js jest.config.js package.json package-lock.json tests/unit/tailwind-config.test.ts
git commit -m "feat: add NativeWind/Tailwind infra and design tokens"
```

---

## Task 2: Font loading gate in the root layout

**Files:**
- Modify: `app/_layout.tsx`
- Test: `tests/unit/root-layout.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RootNavigator` as a **named export** from `app/_layout.tsx` (in addition to the existing default-exported `RootLayout`), so it can be rendered in isolation with mocked dependencies.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/root-layout.test.ts
import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("expo-font", () => ({ useFonts: jest.fn() }));
jest.mock("expo-router", () => ({
  Stack: () => React.createElement(Text, null, "stack-rendered"),
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => [],
}));
jest.mock("../src/features/auth/session", () => ({
  resolveAuthRedirect: jest.fn(() => null),
}));
jest.mock("../src/providers/AppProviders", () => ({
  useSupabaseSession: jest.fn(),
}));

import { useFonts } from "expo-font";
import { useSupabaseSession } from "../src/providers/AppProviders";
import { RootNavigator } from "../app/_layout";

const mockedUseFonts = jest.mocked(useFonts);
const mockedUseSupabaseSession = jest.mocked(useSupabaseSession);

describe("RootNavigator font gate", () => {
  it("shows the loading view when fonts have not finished loading", () => {
    mockedUseFonts.mockReturnValue([false, null] as never);
    mockedUseSupabaseSession.mockReturnValue({
      isLoading: false, profile: null, session: null, supabase: {} as never,
    });

    const view = render(React.createElement(RootNavigator));

    expect(view.queryByText("stack-rendered")).toBeNull();
  });

  it("shows the loading view when auth is loading, even if fonts are ready", () => {
    mockedUseFonts.mockReturnValue([true, null] as never);
    mockedUseSupabaseSession.mockReturnValue({
      isLoading: true, profile: null, session: null, supabase: {} as never,
    });

    const view = render(React.createElement(RootNavigator));

    expect(view.queryByText("stack-rendered")).toBeNull();
  });

  it("renders the stack once both auth and fonts are ready", () => {
    mockedUseFonts.mockReturnValue([true, null] as never);
    mockedUseSupabaseSession.mockReturnValue({
      isLoading: false, profile: null, session: null, supabase: {} as never,
    });

    const view = render(React.createElement(RootNavigator));

    expect(view.getByText("stack-rendered")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/root-layout.test.ts`
Expected: FAIL — `RootNavigator` is not exported from `app/_layout`.

- [ ] **Step 3: Add font loading and export `RootNavigator`**

```tsx
// app/_layout.tsx
import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import {
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from "@expo-google-fonts/oswald";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { resolveAuthRedirect } from "../src/features/auth/session";
import { AppProviders } from "../src/providers/AppProviders";
import { useSupabaseSession } from "../src/providers/AppProviders";

export function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoading, profile, session } = useSupabaseSession();
  const [fontsLoaded] = useFonts({
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const redirect = useMemo(
    () =>
      resolveAuthRedirect({
        profileRole: profile?.role ?? null,
        segments,
        session,
      }),
    [profile?.role, segments, session],
  );

  useEffect(() => {
    if (!isLoading && redirect) {
      router.replace(redirect);
    }
  }, [isLoading, redirect, router]);

  if (isLoading || !fontsLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/root-layout.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx tests/unit/root-layout.test.ts
git commit -m "feat: gate root navigation on font loading"
```

---

## Task 3: Color tokens (`src/lib/design/colors.ts`)

**Files:**
- Create: `src/lib/design/colors.ts`
- Test: `tests/unit/colors.test.ts`

**Interfaces:**
- Produces: `colors` object — `colors.primary[50..900]`, `colors.ink`, `colors.inkSoft`, `colors.canvas`, `colors.surface`, `colors.mist`, `colors.wine[50|100|500]`, `colors.neutral[50..900]`, `colors.danger[50|500|600]`, `colors.success[500]`, `colors.warning[400|500]`, `colors.white`. Used by every later task that needs a hex value for an SVG icon `color`/`fill` prop or a `Platform.select` style object.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/colors.test.ts
import { colors } from "../../src/lib/design/colors";

describe("design colors", () => {
  it("mirrors the primary amber scale", () => {
    expect(colors.primary[400]).toBe("#DB9A34");
    expect(colors.primary[600]).toBe("#9C6819");
  });

  it("mirrors the charcoal/surface anchors", () => {
    expect(colors.ink).toBe("#171412");
    expect(colors.inkSoft).toBe("#241F1B");
    expect(colors.canvas).toBe("#F7F3EE");
    expect(colors.surface).toBe("#FFFDFA");
    expect(colors.mist).toBe("#ECE6DE");
  });

  it("mirrors the wine accent", () => {
    expect(colors.wine[500]).toBe("#7A1F2B");
  });

  it("mirrors neutral, feedback, and white tokens", () => {
    expect(colors.neutral[300]).toBe("#CBBFAF");
    expect(colors.danger[500]).toBe("#DC3B30");
    expect(colors.success[500]).toBe("#2F9E5B");
    expect(colors.warning[400]).toBe("#E8A93B");
    expect(colors.warning[500]).toBe("#C98A1F");
    expect(colors.white).toBe("#FFFFFF");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/colors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/design/colors.ts`**

```ts
export const colors = {
  primary: {
    50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
    400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
    800: "#56380E", 900: "#392509",
  },
  ink: "#171412",
  inkSoft: "#241F1B",
  canvas: "#F7F3EE",
  surface: "#FFFDFA",
  mist: "#ECE6DE",
  wine: { 50: "#FBEEEF", 100: "#F4DBDD", 500: "#7A1F2B" },
  neutral: {
    50: "#FAF8F5", 100: "#F2EEE8", 200: "#E4DDD3", 300: "#CBBFAF",
    400: "#9C8E7B", 500: "#736555", 600: "#564A3D", 700: "#3D3327",
    800: "#2A231A", 900: "#171412",
  },
  danger: { 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" },
  success: { 500: "#2F9E5B" },
  warning: { 400: "#E8A93B", 500: "#C98A1F" },
  white: "#FFFFFF",
} as const;

export type Colors = typeof colors;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/colors.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/colors.ts tests/unit/colors.test.ts
git commit -m "feat: add design system color token mirror"
```

---

## Task 4: Motion tokens (`src/lib/design/motion.ts`)

**Files:**
- Create: `src/lib/design/motion.ts`
- Test: `tests/unit/motion.test.ts`

**Interfaces:**
- Produces: `Motion.duration.{fast,base,slow,slower}` (ms numbers), `Motion.easing.{standard,accelerate,decelerate}` (4-tuple bezier arrays). Consumed by `Button`, `TimeSlotPicker`, `Toast`, `SkeletonLoader`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/motion.test.ts
import { Motion } from "../../src/lib/design/motion";

describe("design motion tokens", () => {
  it("defines the duration scale", () => {
    expect(Motion.duration).toEqual({ fast: 120, base: 200, slow: 300, slower: 500 });
  });

  it("defines the easing curves", () => {
    expect(Motion.easing.standard).toEqual([0.4, 0, 0.2, 1]);
    expect(Motion.easing.accelerate).toEqual([0.4, 0, 1, 1]);
    expect(Motion.easing.decelerate).toEqual([0, 0, 0.2, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/motion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/design/motion.ts`**

```ts
export const Motion = {
  duration: { fast: 120, base: 200, slow: 300, slower: 500 },
  easing: {
    standard: [0.4, 0, 0.2, 1],
    accelerate: [0.4, 0, 1, 1],
    decelerate: [0, 0, 0.2, 1],
  },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/motion.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/motion.ts tests/unit/motion.test.ts
git commit -m "feat: add design system motion token mirror"
```

---

## Task 5: Shadow tokens (`src/lib/design/shadows.ts`)

Not in the original spec's file list (an oversight) — §6 "Elevação e Sombras" is as much a token table as colors/motion, and `Card`'s `elevated` variant and `Toast` both need it.

**Files:**
- Create: `src/lib/design/shadows.ts`
- Test: `tests/unit/shadows.test.ts`

**Interfaces:**
- Produces: `shadows.level1`, `shadows.level2`, `shadows.level3` — each a `ViewStyle` object, platform-branched. Consumed by `Card` (level1) and `Toast` (level2).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shadows.test.ts
import { Platform } from "react-native";

import { shadows } from "../../src/lib/design/shadows";

function expectedFor(
  opts: { shadowOpacity: number; shadowRadius: number; offset: { width: number; height: number }; elevation: number },
) {
  return Platform.OS === "android"
    ? { elevation: opts.elevation }
    : {
        shadowColor: "#000000",
        shadowOpacity: opts.shadowOpacity,
        shadowRadius: opts.shadowRadius,
        shadowOffset: opts.offset,
      };
}

describe("design shadow tokens", () => {
  it("defines level 1 (standard card)", () => {
    expect(shadows.level1).toEqual(
      expectedFor({ shadowOpacity: 0.06, shadowRadius: 4, offset: { width: 0, height: 1 }, elevation: 2 }),
    );
  });

  it("defines level 2 (highlighted card / toast)", () => {
    expect(shadows.level2).toEqual(
      expectedFor({ shadowOpacity: 0.1, shadowRadius: 12, offset: { width: 0, height: 4 }, elevation: 5 }),
    );
  });

  it("defines level 3 (bottom sheet / modal)", () => {
    expect(shadows.level3).toEqual(
      expectedFor({ shadowOpacity: 0.15, shadowRadius: 20, offset: { width: 0, height: -2 }, elevation: 12 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/shadows.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/design/shadows.ts`**

```ts
import { Platform } from "react-native";
import type { ViewStyle } from "react-native";

function shadow(
  shadowOpacity: number,
  shadowRadius: number,
  offset: { width: number; height: number },
  elevation: number,
): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation },
    default: {
      shadowColor: "#000000",
      shadowOpacity,
      shadowRadius,
      shadowOffset: offset,
    },
  }) as ViewStyle;
}

export const shadows = {
  level1: shadow(0.06, 4, { width: 0, height: 1 }, 2),
  level2: shadow(0.1, 12, { width: 0, height: 4 }, 5),
  level3: shadow(0.15, 20, { width: 0, height: -2 }, 12),
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/shadows.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/shadows.ts tests/unit/shadows.test.ts
git commit -m "feat: add design system shadow token mirror"
```

---

## Task 6: `Button` (`src/components/ui/Button.tsx`)

**Files:**
- Create: `src/components/ui/Button.tsx`
- Test: `tests/unit/button.test.ts`

**Interfaces:**
- Consumes: `Motion.duration.fast` from `src/lib/design/motion.ts`.
- Produces:
```ts
export type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant; // default "primary"
  size?: ButtonSize; // default "md"
  disabled?: boolean;
  testID?: string;
};
export function Button(props: ButtonProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/button.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Button } from "../../src/components/ui/Button";

describe("Button", () => {
  it("renders the label and fires onPress", () => {
    const onPress = jest.fn();
    const view = render(
      React.createElement(Button, { label: "Confirm booking", onPress, testID: "confirm-button" }),
    );

    fireEvent.press(view.getByTestId("confirm-button"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByText("Confirm booking")).toBeTruthy();
  });

  it("exposes the button accessibility role", () => {
    const view = render(
      React.createElement(Button, { label: "Confirm booking", onPress: jest.fn(), testID: "confirm-button" }),
    );

    expect(view.getByTestId("confirm-button").props.accessibilityRole).toBe("button");
  });

  it("does not fire onPress and sets accessibilityState.disabled when disabled", () => {
    const onPress = jest.fn();
    const view = render(
      React.createElement(Button, {
        label: "Confirm booking", onPress, disabled: true, testID: "confirm-button",
      }),
    );

    fireEvent.press(view.getByTestId("confirm-button"));

    expect(onPress).not.toHaveBeenCalled();
    expect(view.getByTestId("confirm-button").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it.each<[import("../../src/components/ui/Button").ButtonVariant]>([
    ["primary"], ["dark"], ["outline"], ["ghost"], ["danger"],
  ])("renders the %s variant without crashing", (variant) => {
    const view = render(
      React.createElement(Button, { label: "Go", onPress: jest.fn(), variant, testID: "btn" }),
    );

    expect(view.getByTestId("btn")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/button.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Button`**

```tsx
// src/components/ui/Button.tsx
import { useCallback, useRef } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Motion } from "../../lib/design/motion";

export type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  testID?: string;
};

const VARIANT_CLASSNAME: Record<ButtonVariant, string> = {
  primary: "bg-primary-400",
  dark: "bg-ink",
  outline: "bg-transparent border border-neutral-200",
  ghost: "bg-transparent",
  danger: "bg-danger-500",
};

const VARIANT_TEXT_CLASSNAME: Record<ButtonVariant, string> = {
  primary: "text-ink",
  dark: "text-white",
  outline: "text-neutral-800",
  ghost: "text-primary-600",
  danger: "text-white",
};

const SIZE_CLASSNAME: Record<ButtonSize, string> = {
  sm: "h-button-height-sm",
  md: "h-button-height",
  lg: "h-button-height-lg",
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  testID,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: Motion.duration.fast });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: Motion.duration.fast });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (!disabledRef.current) {
      onPress();
    }
  }, [onPress]);

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={`flex-row items-center justify-center rounded-full px-6 min-w-[44px] ${SIZE_CLASSNAME[size]} ${VARIANT_CLASSNAME[variant]} ${disabled ? "opacity-50" : ""}`}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
      testID={testID}
    >
      <Animated.Text className={`font-sans-semibold text-base ${VARIANT_TEXT_CLASSNAME[variant]}`}>
        {label}
      </Animated.Text>
    </AnimatedPressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/button.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/ui/Button.tsx tests/unit/button.test.ts
git commit -m "feat: add Button base component"
```

---

## Task 7: `Input` (`src/components/ui/Input.tsx`)

**Files:**
- Create: `src/components/ui/Input.tsx`
- Test: `tests/unit/input.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (no icon prop in this pass — icons get wired in per consuming screen-group spec, not speculatively here).
- Produces:
```ts
export type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  testID?: string;
};
export function Input(props: InputProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/input.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Input } from "../../src/components/ui/Input";

describe("Input", () => {
  it("renders the label and current value", () => {
    const view = render(
      React.createElement(Input, {
        label: "Local date", value: "2026-08-17", onChangeText: jest.fn(), testID: "date-input",
      }),
    );

    expect(view.getByText("Local date")).toBeTruthy();
    expect(view.getByTestId("date-input").props.value).toBe("2026-08-17");
  });

  it("calls onChangeText as the user types", () => {
    const onChangeText = jest.fn();
    const view = render(
      React.createElement(Input, {
        label: "Local date", value: "", onChangeText, testID: "date-input",
      }),
    );

    fireEvent.changeText(view.getByTestId("date-input"), "2026-08-18");

    expect(onChangeText).toHaveBeenCalledWith("2026-08-18");
  });

  it("renders the error message and marks the field invalid when error is set", () => {
    const view = render(
      React.createElement(Input, {
        label: "Local date", value: "bad", onChangeText: jest.fn(),
        error: "Invalid date format", testID: "date-input",
      }),
    );

    expect(view.getByText("Invalid date format")).toBeTruthy();
    expect(view.getByTestId("date-input").props.accessibilityState).toEqual(
      expect.objectContaining({ invalid: true }),
    );
  });

  it("does not mark the field invalid when there is no error", () => {
    const view = render(
      React.createElement(Input, {
        label: "Local date", value: "2026-08-17", onChangeText: jest.fn(), testID: "date-input",
      }),
    );

    expect(view.getByTestId("date-input").props.accessibilityState).toEqual(
      expect.objectContaining({ invalid: false }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/input.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Input`**

```tsx
// src/components/ui/Input.tsx
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  testID?: string;
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  testID,
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const borderClassName = hasError
    ? "border-[1.5px] border-danger-500"
    : focused
      ? "border-[1.5px] border-primary-400"
      : "border border-neutral-200";

  return (
    <View className="gap-1">
      <Text className="text-sm font-sans-medium text-neutral-700">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ invalid: hasError }}
        className={`h-input-height rounded-xl px-4 font-sans text-base text-ink bg-surface ${borderClassName}`}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor="#9C8E7B"
        secureTextEntry={secureTextEntry}
        testID={testID}
        value={value}
      />
      {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/input.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/ui/Input.tsx tests/unit/input.test.ts
git commit -m "feat: add Input base component"
```

---

## Task 8: `Card` (`src/components/ui/Card.tsx`)

**Files:**
- Create: `src/components/ui/Card.tsx`
- Test: `tests/unit/card.test.ts`

**Interfaces:**
- Consumes: `shadows.level1` from `src/lib/design/shadows.ts`.
- Produces:
```ts
export type CardVariant = "elevated" | "outlined" | "flat";
export type CardProps = React.PropsWithChildren<{
  variant?: CardVariant; // default "elevated"
  testID?: string;
}>;
export function Card(props: CardProps): JSX.Element;
```
  Consumed by `BarberCard`, `ServiceCard`, `AppointmentCard`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/card.test.ts
import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

import { Card } from "../../src/components/ui/Card";
import { shadows } from "../../src/lib/design/shadows";

describe("Card", () => {
  it("renders its children", () => {
    const view = render(
      React.createElement(Card, { testID: "card" }, React.createElement(Text, null, "Card content")),
    );

    expect(view.getByText("Card content")).toBeTruthy();
  });

  it("applies the level-1 shadow style for the elevated variant", () => {
    const view = render(
      React.createElement(Card, { variant: "elevated", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : style;

    expect(flattened).toEqual(expect.objectContaining(shadows.level1));
  });

  it("does not apply a shadow for the outlined variant", () => {
    const view = render(
      React.createElement(Card, { variant: "outlined", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.shadowOpacity).toBeUndefined();
    expect(flattened.elevation).toBeUndefined();
  });

  it("does not apply a shadow for the flat variant", () => {
    const view = render(
      React.createElement(Card, { variant: "flat", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.shadowOpacity).toBeUndefined();
    expect(flattened.elevation).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Card`**

```tsx
// src/components/ui/Card.tsx
import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { shadows } from "../../lib/design/shadows";

export type CardVariant = "elevated" | "outlined" | "flat";

export type CardProps = PropsWithChildren<{
  variant?: CardVariant;
  testID?: string;
}>;

const VARIANT_CLASSNAME: Record<CardVariant, string> = {
  elevated: "bg-surface",
  outlined: "bg-surface border border-neutral-200",
  flat: "bg-neutral-50",
};

export function Card({ children, variant = "elevated", testID }: CardProps) {
  const style = variant === "elevated" ? shadows.level1 : undefined;

  return (
    <View
      className={`p-4 rounded-[20px] ${VARIANT_CLASSNAME[variant]}`}
      style={style}
      testID={testID}
    >
      {children}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/card.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/ui/Card.tsx tests/unit/card.test.ts
git commit -m "feat: add Card base component"
```

---

## Task 9: `StatusBadge` (`src/components/domain/StatusBadge.tsx`)

**Files:**
- Create: `src/components/domain/StatusBadge.tsx`
- Test: `tests/unit/status-badge.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
```ts
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
export type StatusBadgeProps = {
  status: AppointmentStatus;
  label?: string; // defaults to the English label below
  testID?: string;
};
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
```
  Consumed by `AppointmentCard`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/status-badge.test.ts
import React from "react";
import { render } from "@testing-library/react-native";

import { StatusBadge } from "../../src/components/domain/StatusBadge";
import type { AppointmentStatus } from "../../src/components/domain/StatusBadge";

describe("StatusBadge", () => {
  it.each<[AppointmentStatus, string]>([
    ["scheduled", "Scheduled"],
    ["confirmed", "Confirmed"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
    ["no_show", "No-show"],
  ])("renders the default label for %s", (status, expectedLabel) => {
    const view = render(React.createElement(StatusBadge, { status }));

    expect(view.getByText(expectedLabel)).toBeTruthy();
  });

  it("renders a caller-supplied label instead of the default", () => {
    const view = render(
      React.createElement(StatusBadge, { status: "confirmed", label: "Confirmada" }),
    );

    expect(view.getByText("Confirmada")).toBeTruthy();
    expect(view.queryByText("Confirmed")).toBeNull();
  });

  it("exposes the status via accessibilityLabel", () => {
    const view = render(
      React.createElement(StatusBadge, { status: "no_show", testID: "badge" }),
    );

    expect(view.getByTestId("badge").props.accessibilityLabel).toBe("No-show");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/status-badge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StatusBadge`**

```tsx
// src/components/domain/StatusBadge.tsx
import { Text, View } from "react-native";

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

export type StatusBadgeProps = {
  status: AppointmentStatus;
  label?: string;
  testID?: string;
};

const DEFAULT_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const CLASSNAME: Record<AppointmentStatus, string> = {
  scheduled: "bg-warning-500/10",
  confirmed: "bg-success-500/10",
  completed: "bg-neutral-100",
  cancelled: "bg-neutral-100",
  no_show: "bg-danger-500/10",
};

const TEXT_CLASSNAME: Record<AppointmentStatus, string> = {
  scheduled: "text-warning-500",
  confirmed: "text-success-500",
  completed: "text-neutral-600",
  cancelled: "text-neutral-400",
  no_show: "text-danger-500",
};

const DOT_CLASSNAME: Record<AppointmentStatus, string> = {
  scheduled: "bg-warning-500",
  confirmed: "bg-success-500",
  completed: "bg-neutral-600",
  cancelled: "bg-neutral-400",
  no_show: "bg-danger-500",
};

export function StatusBadge({ status, label, testID }: StatusBadgeProps) {
  const resolvedLabel = label ?? DEFAULT_LABEL[status];

  return (
    <View
      accessibilityLabel={resolvedLabel}
      className={`flex-row items-center gap-1.5 self-start rounded-full px-3 py-1 ${CLASSNAME[status]}`}
      testID={testID}
    >
      <View className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSNAME[status]}`} />
      <Text className={`text-xs font-sans-semibold ${TEXT_CLASSNAME[status]}`}>{resolvedLabel}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/status-badge.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/StatusBadge.tsx tests/unit/status-badge.test.ts
git commit -m "feat: add StatusBadge domain component"
```

---

## Task 10: `RatingStars` (`src/components/domain/RatingStars.tsx`)

**Files:**
- Create: `src/components/domain/RatingStars.tsx`
- Test: `tests/unit/rating-stars.test.ts`

**Interfaces:**
- Consumes: `colors.warning[400]`, `colors.neutral[300]` from `src/lib/design/colors.ts`.
- Produces:
```ts
export type RatingStarsProps = {
  rating: number; // 0–5, rounded to the nearest whole star
  size?: number; // default 16
  testID?: string;
};
export function RatingStars(props: RatingStarsProps): JSX.Element;
```
  Standalone — not used by `BarberCard` (see Global Constraints); reserved for a future rating screen.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/rating-stars.test.ts
import React from "react";
import { render } from "@testing-library/react-native";

import { RatingStars } from "../../src/components/domain/RatingStars";
import { colors } from "../../src/lib/design/colors";

describe("RatingStars", () => {
  it("fills stars up to the rounded rating and leaves the rest empty", () => {
    const view = render(React.createElement(RatingStars, { rating: 3.6, testID: "rating" }));

    for (let index = 0; index < 4; index += 1) {
      const star = view.getByTestId(`rating-star-${index}`);
      expect(star.props.fill).toBe(colors.warning[400]);
      expect(star.props.color).toBe(colors.warning[400]);
    }

    for (let index = 4; index < 5; index += 1) {
      const star = view.getByTestId(`rating-star-${index}`);
      expect(star.props.fill).toBe("none");
      expect(star.props.color).toBe(colors.neutral[300]);
    }
  });

  it("exposes the rating as an accessibility label", () => {
    const view = render(React.createElement(RatingStars, { rating: 4, testID: "rating" }));

    expect(view.getByTestId("rating").props.accessibilityLabel).toBe("4 out of 5 stars");
  });

  it("defaults the icon size to 16 and honors an explicit size", () => {
    const view = render(React.createElement(RatingStars, { rating: 5, size: 24, testID: "rating" }));

    expect(view.getByTestId("rating-star-0").props.size).toBe(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/rating-stars.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `RatingStars`**

```tsx
// src/components/domain/RatingStars.tsx
import { View } from "react-native";
import { Star } from "lucide-react-native";

import { colors } from "../../lib/design/colors";

export type RatingStarsProps = {
  rating: number;
  size?: number;
  testID?: string;
};

export function RatingStars({ rating, size = 16, testID }: RatingStarsProps) {
  const filledCount = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <View
      accessibilityLabel={`${filledCount} out of 5 stars`}
      className="flex-row gap-0.5"
      testID={testID}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < filledCount;

        return (
          <Star
            color={filled ? colors.warning[400] : colors.neutral[300]}
            fill={filled ? colors.warning[400] : "none"}
            key={index}
            size={size}
            testID={testID ? `${testID}-star-${index}` : `rating-star-${index}`}
          />
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/rating-stars.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/RatingStars.tsx tests/unit/rating-stars.test.ts
git commit -m "feat: add RatingStars domain component"
```

---

## Task 11: `BarberCard` (`src/components/domain/BarberCard.tsx`)

**Files:**
- Create: `src/components/domain/BarberCard.tsx`
- Test: `tests/unit/barber-card.test.ts`

**Interfaces:**
- Consumes: `Card` from `src/components/ui/Card.tsx`; `colors.warning[400]` from `src/lib/design/colors.ts`.
- Produces:
```ts
export type BarberCardProps = {
  name: string;
  specialty?: string;
  rating: number;
  distanceKm?: number;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};
export function BarberCard(props: BarberCardProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/barber-card.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { BarberCard } from "../../src/components/domain/BarberCard";

describe("BarberCard", () => {
  it("renders the name, specialty, rating, and distance", () => {
    const view = render(
      React.createElement(BarberCard, {
        name: "João Silva", specialty: "Beard specialist", rating: 4.9, distanceKm: 2.3,
      }),
    );

    expect(view.getByText("João Silva")).toBeTruthy();
    expect(view.getByText("Beard specialist")).toBeTruthy();
    expect(view.getByText("4.9")).toBeTruthy();
    expect(view.getByText("2.3 km")).toBeTruthy();
  });

  it("omits the specialty and distance rows when not provided", () => {
    const view = render(React.createElement(BarberCard, { name: "João Silva", rating: 4.9 }));

    expect(view.queryByText("km", { exact: false })).toBeNull();
  });

  it("fires onPress and sets accessibilityState.selected", () => {
    const onPress = jest.fn();
    const view = render(
      React.createElement(BarberCard, {
        name: "João Silva", rating: 4.9, selected: true, onPress, testID: "barber-card",
      }),
    );

    fireEvent.press(view.getByTestId("barber-card"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("barber-card").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/barber-card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BarberCard`**

```tsx
// src/components/domain/BarberCard.tsx
import { Pressable, Text, View } from "react-native";
import { MapPin, Star } from "lucide-react-native";

import { colors } from "../../lib/design/colors";

export type BarberCardProps = {
  name: string;
  specialty?: string;
  rating: number;
  distanceKm?: number;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function BarberCard({
  name,
  specialty,
  rating,
  distanceKm,
  selected = false,
  onPress,
  testID,
}: BarberCardProps) {
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-3 rounded-[20px] border p-4 bg-surface ${selected ? "border-[1.5px] border-primary-400 bg-primary-50" : "border-neutral-200"}`}
      onPress={onPress}
      testID={testID}
    >
      <View className="h-14 w-14 rounded-full bg-mist" />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-display-semibold text-ink">{name}</Text>
          <View className="flex-row items-center gap-1">
            <Star color={colors.warning[400]} fill={colors.warning[400]} size={14} />
            <Text
              className="text-sm font-sans-semibold text-ink"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {rating}
            </Text>
          </View>
        </View>
        {specialty ? <Text className="text-sm font-sans text-neutral-500">{specialty}</Text> : null}
        {distanceKm !== undefined ? (
          <View className="flex-row items-center gap-1">
            <MapPin color={colors.neutral[500]} size={14} />
            <Text className="text-sm font-sans text-neutral-500">{distanceKm} km</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/barber-card.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/BarberCard.tsx tests/unit/barber-card.test.ts
git commit -m "feat: add BarberCard domain component"
```

---

## Task 12: `ServiceCard` (`src/components/domain/ServiceCard.tsx`)

**Files:**
- Create: `src/components/domain/ServiceCard.tsx`
- Test: `tests/unit/service-card.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (renders its own flat surface directly, per §12.2's `Card flat` — not the shared `Card` component, since `Card`'s `flat` variant already is exactly `bg-neutral-50` with no border, matching; reuse `Card` here too for consistency).
- Produces:
```ts
export type ServiceCardProps = {
  name: string;
  durationMinutes: number;
  priceCents: number;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};
export function formatPriceBRL(cents: number): string;
export function ServiceCard(props: ServiceCardProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/service-card.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { formatPriceBRL, ServiceCard } from "../../src/components/domain/ServiceCard";

describe("formatPriceBRL", () => {
  it("formats whole reais", () => {
    expect(formatPriceBRL(6500)).toBe("R$ 65,00");
  });

  it("formats reais with cents", () => {
    expect(formatPriceBRL(6599)).toBe("R$ 65,99");
  });

  it("pads a single cent digit", () => {
    expect(formatPriceBRL(100)).toBe("R$ 1,00");
    expect(formatPriceBRL(105)).toBe("R$ 1,05");
  });
});

describe("ServiceCard", () => {
  it("renders name, duration, and formatted price", () => {
    const view = render(
      React.createElement(ServiceCard, { name: "Cut + Beard", durationMinutes: 45, priceCents: 6500 }),
    );

    expect(view.getByText("Cut + Beard")).toBeTruthy();
    expect(view.getByText("45 min")).toBeTruthy();
    expect(view.getByText("R$ 65,00")).toBeTruthy();
  });

  it("fires onPress and sets accessibilityState.selected", () => {
    const onPress = jest.fn();
    const view = render(
      React.createElement(ServiceCard, {
        name: "Cut + Beard", durationMinutes: 45, priceCents: 6500,
        selected: true, onPress, testID: "service-card",
      }),
    );

    fireEvent.press(view.getByTestId("service-card"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("service-card").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/service-card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ServiceCard`**

```tsx
// src/components/domain/ServiceCard.tsx
import { Pressable, Text, View } from "react-native";
import { Clock, Scissors } from "lucide-react-native";

import { colors } from "../../lib/design/colors";

export type ServiceCardProps = {
  name: string;
  durationMinutes: number;
  priceCents: number;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function formatPriceBRL(cents: number): string {
  const reais = Math.floor(cents / 100);
  const remainingCents = cents % 100;

  return `R$ ${reais},${remainingCents.toString().padStart(2, "0")}`;
}

export function ServiceCard({
  name,
  durationMinutes,
  priceCents,
  selected = false,
  onPress,
  testID,
}: ServiceCardProps) {
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center justify-between rounded-[20px] p-4 ${selected ? "bg-primary-50 border-[1.5px] border-primary-400" : "bg-neutral-50"}`}
      onPress={onPress}
      testID={testID}
    >
      <View className="flex-row items-center gap-2">
        <Scissors color={colors.neutral[600]} size={16} />
        <View>
          <Text className="text-base font-sans-semibold text-ink">{name}</Text>
          <View className="flex-row items-center gap-1">
            <Clock color={colors.neutral[500]} size={14} />
            <Text className="text-xs font-sans text-neutral-500">{durationMinutes} min</Text>
          </View>
        </View>
      </View>
      <Text
        className="text-xl font-display-bold text-primary-600"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatPriceBRL(priceCents)}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/service-card.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/ServiceCard.tsx tests/unit/service-card.test.ts
git commit -m "feat: add ServiceCard domain component"
```

---

## Task 13: `CalendarStrip` (`src/components/domain/CalendarStrip.tsx`)

**Files:**
- Create: `src/components/domain/CalendarStrip.tsx`
- Test: `tests/unit/calendar-strip.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
```ts
export type CalendarStripDay = {
  date: string; // ISO local date, e.g. "2026-08-18" — used as the list key and callback value
  weekdayLabel: string; // e.g. "THU"
  dayNumber: string; // e.g. "18"
  hasAppointment?: boolean;
};
export type CalendarStripProps = {
  days: CalendarStripDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  testID?: string;
};
export function CalendarStrip(props: CalendarStripProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/calendar-strip.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { CalendarStrip } from "../../src/components/domain/CalendarStrip";

const days = [
  { date: "2026-08-18", weekdayLabel: "THU", dayNumber: "18", hasAppointment: true },
  { date: "2026-08-19", weekdayLabel: "FRI", dayNumber: "19" },
];

describe("CalendarStrip", () => {
  it("renders every day's weekday label and number", () => {
    const view = render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate: jest.fn(),
      }),
    );

    expect(view.getByText("THU")).toBeTruthy();
    expect(view.getByText("18")).toBeTruthy();
    expect(view.getByText("FRI")).toBeTruthy();
    expect(view.getByText("19")).toBeTruthy();
  });

  it("calls onSelectDate with the tapped day's date", () => {
    const onSelectDate = jest.fn();
    const view = render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate,
      }),
    );

    fireEvent.press(view.getByTestId("calendar-strip-day-2026-08-19"));

    expect(onSelectDate).toHaveBeenCalledWith("2026-08-19");
  });

  it("marks only the selected day as accessibilityState.selected", () => {
    const view = render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate: jest.fn(),
      }),
    );

    expect(view.getByTestId("calendar-strip-day-2026-08-18").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(view.getByTestId("calendar-strip-day-2026-08-19").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it("renders an appointment-indicator dot only for days that have one", () => {
    const view = render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate: jest.fn(),
      }),
    );

    expect(view.queryByTestId("calendar-strip-day-2026-08-18-dot")).toBeTruthy();
    expect(view.queryByTestId("calendar-strip-day-2026-08-19-dot")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/calendar-strip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CalendarStrip`**

```tsx
// src/components/domain/CalendarStrip.tsx
import { Pressable, ScrollView, Text, View } from "react-native";

export type CalendarStripDay = {
  date: string;
  weekdayLabel: string;
  dayNumber: string;
  hasAppointment?: boolean;
};

export type CalendarStripProps = {
  days: CalendarStripDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  testID?: string;
};

export function CalendarStrip({ days, selectedDate, onSelectDate, testID }: CalendarStripProps) {
  return (
    <ScrollView className="flex-none" horizontal showsHorizontalScrollIndicator={false} testID={testID}>
      <View className="flex-row gap-2 px-safe-horizontal">
        {days.map((day) => {
          const selected = day.date === selectedDate;

          return (
            <Pressable
              accessibilityLabel={`${day.weekdayLabel} ${day.dayNumber}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`h-16 w-14 items-center justify-center gap-1 rounded-2xl ${selected ? "bg-ink" : "bg-transparent"}`}
              key={day.date}
              onPress={() => onSelectDate(day.date)}
              testID={`calendar-strip-day-${day.date}`}
            >
              <Text className={`text-xs font-sans-medium ${selected ? "text-white" : "text-neutral-600"}`}>
                {day.weekdayLabel}
              </Text>
              <Text
                className={`text-base font-sans-semibold ${selected ? "text-white" : "text-neutral-600"}`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {day.dayNumber}
              </Text>
              {day.hasAppointment ? (
                <View
                  className="h-1.5 w-1.5 rounded-full bg-primary-400"
                  testID={`calendar-strip-day-${day.date}-dot`}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/calendar-strip.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/CalendarStrip.tsx tests/unit/calendar-strip.test.ts
git commit -m "feat: add CalendarStrip domain component"
```

---

## Task 14: `TimeSlotPicker` (`src/components/domain/TimeSlotPicker.tsx`)

**Files:**
- Create: `src/components/domain/TimeSlotPicker.tsx`
- Test: `tests/unit/time-slot-picker.test.ts`

**Interfaces:**
- Consumes: `Motion.duration.fast` from `src/lib/design/motion.ts`.
- Produces:
```ts
export type TimeSlotStatus = "free" | "selected" | "occupied";
export type TimeSlot = { time: string; status: TimeSlotStatus }; // time e.g. "09:00"
export type TimeSlotPickerProps = {
  slots: TimeSlot[];
  onSelectSlot: (time: string) => void;
  testID?: string;
};
export function TimeSlotPicker(props: TimeSlotPickerProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/time-slot-picker.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { TimeSlotPicker } from "../../src/components/domain/TimeSlotPicker";

const slots = [
  { time: "09:00", status: "free" as const },
  { time: "09:30", status: "selected" as const },
  { time: "10:00", status: "occupied" as const },
];

describe("TimeSlotPicker", () => {
  it("renders every slot's time", () => {
    const view = render(React.createElement(TimeSlotPicker, { slots, onSelectSlot: jest.fn() }));

    expect(view.getByText("09:00")).toBeTruthy();
    expect(view.getByText("09:30")).toBeTruthy();
    expect(view.getByText("10:00")).toBeTruthy();
  });

  it("calls onSelectSlot when a free slot is pressed", () => {
    const onSelectSlot = jest.fn();
    const view = render(React.createElement(TimeSlotPicker, { slots, onSelectSlot }));

    fireEvent.press(view.getByTestId("time-slot-09:00"));

    expect(onSelectSlot).toHaveBeenCalledWith("09:00");
  });

  it("does not call onSelectSlot when an occupied slot is pressed", () => {
    const onSelectSlot = jest.fn();
    const view = render(React.createElement(TimeSlotPicker, { slots, onSelectSlot }));

    fireEvent.press(view.getByTestId("time-slot-10:00"));

    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it("sets accessibilityState.disabled on occupied slots and .selected on the selected slot", () => {
    const view = render(React.createElement(TimeSlotPicker, { slots, onSelectSlot: jest.fn() }));

    expect(view.getByTestId("time-slot-10:00").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(view.getByTestId("time-slot-09:30").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(view.getByTestId("time-slot-09:00").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: false }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/time-slot-picker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TimeSlotPicker`**

```tsx
// src/components/domain/TimeSlotPicker.tsx
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Motion } from "../../lib/design/motion";

export type TimeSlotStatus = "free" | "selected" | "occupied";
export type TimeSlot = { time: string; status: TimeSlotStatus };

export type TimeSlotPickerProps = {
  slots: TimeSlot[];
  onSelectSlot: (time: string) => void;
  testID?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Slot({ slot, onSelectSlot }: { slot: TimeSlot; onSelectSlot: (time: string) => void }) {
  const scale = useSharedValue(slot.status === "selected" ? 1.03 : 1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const occupied = slot.status === "occupied";
  const selected = slot.status === "selected";

  const handlePress = useCallback(() => {
    if (occupied) {
      return;
    }

    scale.value = withTiming(1.03, { duration: Motion.duration.fast });
    onSelectSlot(slot.time);
  }, [occupied, onSelectSlot, scale, slot.time]);

  const className = occupied
    ? "bg-neutral-100"
    : selected
      ? "border-[1.5px] border-primary-400 bg-primary-50"
      : "border border-neutral-200 bg-surface";
  const textClassName = occupied
    ? "text-neutral-300"
    : selected
      ? "text-primary-600 font-sans-bold"
      : "text-neutral-800 font-sans-medium";

  return (
    <AnimatedPressable
      accessibilityLabel={slot.time}
      accessibilityRole="button"
      accessibilityState={{ disabled: occupied, selected }}
      className={`h-slot-height min-w-[68px] items-center justify-center rounded-xl px-3 ${className}`}
      disabled={occupied}
      onPress={handlePress}
      style={animatedStyle}
      testID={`time-slot-${slot.time}`}
    >
      <Animated.Text className={`text-base ${textClassName}`} style={{ fontVariant: ["tabular-nums"] }}>
        {slot.time}
      </Animated.Text>
    </AnimatedPressable>
  );
}

export function TimeSlotPicker({ slots, onSelectSlot, testID }: TimeSlotPickerProps) {
  return (
    <View className="flex-row flex-wrap gap-2" testID={testID}>
      {slots.map((slot) => (
        <Slot key={slot.time} onSelectSlot={onSelectSlot} slot={slot} />
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/time-slot-picker.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/TimeSlotPicker.tsx tests/unit/time-slot-picker.test.ts
git commit -m "feat: add TimeSlotPicker domain component"
```

---

## Task 15: `AppointmentCard` (`src/components/domain/AppointmentCard.tsx`)

**Files:**
- Create: `src/components/domain/AppointmentCard.tsx`
- Test: `tests/unit/appointment-card.test.ts`

**Interfaces:**
- Consumes: `Card` from `src/components/ui/Card.tsx`; `StatusBadge`, `AppointmentStatus` from `src/components/domain/StatusBadge.tsx`.
- Produces:
```ts
export type AppointmentCardProps = {
  status: import("./StatusBadge").AppointmentStatus;
  serviceName: string;
  barberName: string;
  dateLabel: string;
  timeLabel: string;
  shopName: string;
  shopAddress: string;
  onPress?: () => void;
  testID?: string;
};
export function AppointmentCard(props: AppointmentCardProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/appointment-card.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";

const baseProps = {
  serviceName: "Cut + Beard",
  barberName: "João Silva",
  dateLabel: "Thu, Aug 18",
  timeLabel: "14:30",
  shopName: "Barbearia Alfa",
  shopAddress: "R. das Flores, 123",
};

describe("AppointmentCard", () => {
  it("renders the service, barber, date/time, shop, and status", () => {
    const view = render(
      React.createElement(AppointmentCard, { ...baseProps, status: "confirmed", testID: "card" }),
    );

    expect(view.getByText("Cut + Beard · João Silva")).toBeTruthy();
    expect(view.getByText("Thu, Aug 18 · 14:30")).toBeTruthy();
    expect(view.getByText("Barbearia Alfa · R. das Flores, 123")).toBeTruthy();
    expect(view.getByText("Confirmed")).toBeTruthy();
  });

  it("fires onPress when tapped", () => {
    const onPress = jest.fn();
    const view = render(
      React.createElement(AppointmentCard, { ...baseProps, status: "confirmed", onPress, testID: "card" }),
    );

    fireEvent.press(view.getByTestId("card"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("dims the content to 60% opacity when cancelled", () => {
    const view = render(
      React.createElement(AppointmentCard, { ...baseProps, status: "cancelled", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.opacity).toBe(0.6);
  });

  it("does not dim the content for a non-cancelled status", () => {
    const view = render(
      React.createElement(AppointmentCard, { ...baseProps, status: "confirmed", testID: "card" }),
    );

    const style = view.getByTestId("card").props.style;
    const flattened = Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

    expect(flattened.opacity).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/appointment-card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AppointmentCard`**

```tsx
// src/components/domain/AppointmentCard.tsx
import { Pressable, Text, View } from "react-native";
import { Calendar, Clock, Scissors } from "lucide-react-native";

import { colors } from "../../lib/design/colors";
import { StatusBadge } from "./StatusBadge";
import type { AppointmentStatus } from "./StatusBadge";

export type AppointmentCardProps = {
  status: AppointmentStatus;
  serviceName: string;
  barberName: string;
  dateLabel: string;
  timeLabel: string;
  shopName: string;
  shopAddress: string;
  onPress?: () => void;
  testID?: string;
};

export function AppointmentCard({
  status,
  serviceName,
  barberName,
  dateLabel,
  timeLabel,
  shopName,
  shopAddress,
  onPress,
  testID,
}: AppointmentCardProps) {
  const cancelled = status === "cancelled";

  return (
    <Pressable
      className="rounded-[20px] bg-surface p-4 gap-2"
      onPress={onPress}
      style={cancelled ? { opacity: 0.6 } : undefined}
      testID={testID}
    >
      <View className="flex-row items-center justify-between">
        <StatusBadge status={status} />
      </View>
      <View className="flex-row items-center gap-1.5">
        <Scissors color={colors.neutral[600]} size={16} />
        <Text className="text-base font-sans-semibold text-ink">
          {serviceName} · {barberName}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Calendar color={colors.neutral[500]} size={16} />
        <Clock color={colors.neutral[500]} size={16} />
        <Text className="text-sm font-sans text-neutral-500" style={{ fontVariant: ["tabular-nums"] }}>
          {dateLabel} · {timeLabel}
        </Text>
      </View>
      <View className="h-px bg-neutral-200" />
      <Text className="text-sm font-sans text-neutral-500">
        {shopName} · {shopAddress}
      </Text>
    </Pressable>
  );
}
```

`dateLabel` and `timeLabel` render inside one `Text` node (not two sibling `Text`s under separate icon rows) so the rendered string is exactly `"Thu, Aug 18 · 14:30"`, matching the test's single `getByText` call — both icons precede that one text node instead of each owning their own.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/appointment-card.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/AppointmentCard.tsx tests/unit/appointment-card.test.ts
git commit -m "feat: add AppointmentCard domain component"
```

---

## Task 16: `EmptyState` (`src/components/domain/EmptyState.tsx`)

**Files:**
- Create: `src/components/domain/EmptyState.tsx`
- Test: `tests/unit/empty-state.test.ts`

**Interfaces:**
- Consumes: `Button` from `src/components/ui/Button.tsx`.
- Produces:
```ts
export type EmptyStateProps = {
  icon?: React.ComponentType<{ size?: number; color?: string }>; // default: lucide Scissors
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};
export function EmptyState(props: EmptyStateProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/empty-state.test.ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";

describe("EmptyState", () => {
  it("renders the title and subtitle", () => {
    const view = render(
      React.createElement(EmptyState, {
        title: "No appointments yet",
        subtitle: "Choose a barber and book your time",
      }),
    );

    expect(view.getByText("No appointments yet")).toBeTruthy();
    expect(view.getByText("Choose a barber and book your time")).toBeTruthy();
  });

  it("does not render an action button when actionLabel/onAction are omitted", () => {
    const view = render(React.createElement(EmptyState, { title: "No appointments yet" }));

    expect(view.queryByRole("button")).toBeNull();
  });

  it("renders the action button and fires onAction when tapped", () => {
    const onAction = jest.fn();
    const view = render(
      React.createElement(EmptyState, {
        title: "No appointments yet", actionLabel: "Book now", onAction,
      }),
    );

    fireEvent.press(view.getByText("Book now"));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/empty-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `EmptyState`**

```tsx
// src/components/domain/EmptyState.tsx
import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { Scissors } from "lucide-react-native";

import { colors } from "../../lib/design/colors";
import { Button } from "../ui/Button";

export type EmptyStateProps = {
  icon?: ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

export function EmptyState({
  icon: Icon = Scissors,
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View className="items-center gap-3 p-8" testID={testID}>
      <View className="h-24 w-24 items-center justify-center rounded-full bg-neutral-100">
        <Icon color={colors.neutral[300]} size={40} />
      </View>
      <Text className="text-lg font-display-semibold text-ink text-center">{title}</Text>
      {subtitle ? (
        <Text className="text-sm font-sans text-neutral-500 text-center">{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="sm" />
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/empty-state.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/EmptyState.tsx tests/unit/empty-state.test.ts
git commit -m "feat: add EmptyState domain component"
```

---

## Task 17: `Toast` (`src/components/domain/Toast.tsx`)

**Files:**
- Create: `src/components/domain/Toast.tsx`
- Test: `tests/unit/toast.test.ts`

**Interfaces:**
- Consumes: `shadows.level2` from `src/lib/design/shadows.ts`; `Motion.duration.base` from `src/lib/design/motion.ts`.
- Produces:
```ts
export type ToastVariant = "success" | "error" | "info";
export type ToastProps = {
  variant: ToastVariant;
  message: string;
  visible: boolean;
  onDismiss: () => void;
  testID?: string;
};
export function Toast(props: ToastProps): JSX.Element | null;
```
  Presentational + owns its 3s auto-dismiss timer; no queueing/positioning (that's an app-shell concern for a future spec).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/toast.test.ts
import React from "react";
import { render } from "@testing-library/react-native";

import { Toast } from "../../src/components/domain/Toast";

describe("Toast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders nothing when not visible", () => {
    const view = render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: false, onDismiss: jest.fn(),
      }),
    );

    expect(view.queryByText("Booking confirmed.")).toBeNull();
  });

  it("renders the message when visible", () => {
    const view = render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: true, onDismiss: jest.fn(),
      }),
    );

    expect(view.getByText("Booking confirmed.")).toBeTruthy();
  });

  it("calls onDismiss automatically after 3 seconds", () => {
    const onDismiss = jest.fn();
    render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: true, onDismiss,
      }),
    );

    expect(onDismiss).not.toHaveBeenCalled();

    jest.advanceTimersByTime(3000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not schedule a dismiss timer when not visible", () => {
    const onDismiss = jest.fn();
    render(
      React.createElement(Toast, {
        variant: "success", message: "Booking confirmed.", visible: false, onDismiss,
      }),
    );

    jest.advanceTimersByTime(3000);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/toast.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Toast`**

```tsx
// src/components/domain/Toast.tsx
import { useEffect } from "react";
import { Text, View } from "react-native";

import { shadows } from "../../lib/design/shadows";

export type ToastVariant = "success" | "error" | "info";

export type ToastProps = {
  variant: ToastVariant;
  message: string;
  visible: boolean;
  onDismiss: () => void;
  testID?: string;
};

const VARIANT_CLASSNAME: Record<ToastVariant, string> = {
  success: "bg-success-500",
  error: "bg-danger-500",
  info: "bg-ink",
};

const AUTO_DISMISS_MS = 3000;

export function Toast({ variant, message, visible, onDismiss, testID }: ToastProps) {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      className={`rounded-2xl p-4 ${VARIANT_CLASSNAME[variant]}`}
      style={shadows.level2}
      testID={testID}
    >
      <Text className="text-sm font-sans-medium text-white">{message}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/toast.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/Toast.tsx tests/unit/toast.test.ts
git commit -m "feat: add Toast domain component"
```

---

## Task 18: `SkeletonLoader` (`src/components/domain/SkeletonLoader.tsx`)

**Files:**
- Create: `src/components/domain/SkeletonLoader.tsx`
- Test: `tests/unit/skeleton-loader.test.ts`

**Interfaces:**
- Consumes: `Motion.duration.slower` from `src/lib/design/motion.ts`.
- Produces:
```ts
export type SkeletonBlockProps = { width: number; height: number; testID?: string };
export function SkeletonBlock(props: SkeletonBlockProps): JSX.Element;
export type SkeletonCircleProps = { size: number; testID?: string };
export function SkeletonCircle(props: SkeletonCircleProps): JSX.Element;
export type SkeletonTextProps = { lines?: number; width?: number; testID?: string }; // default lines=1
export function SkeletonText(props: SkeletonTextProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/skeleton-loader.test.ts
import React from "react";
import { render } from "@testing-library/react-native";

import { SkeletonBlock, SkeletonCircle, SkeletonText } from "../../src/components/domain/SkeletonLoader";

function flattenStyle(style: unknown) {
  return Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});
}

describe("SkeletonBlock", () => {
  it("renders with the given width and height and hides from screen readers", () => {
    const view = render(React.createElement(SkeletonBlock, { width: 120, height: 40, testID: "block" }));
    const node = view.getByTestId("block");

    expect(flattenStyle(node.props.style)).toEqual(expect.objectContaining({ width: 120, height: 40 }));
    expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});

describe("SkeletonCircle", () => {
  it("renders a square sized to a full circle", () => {
    const view = render(React.createElement(SkeletonCircle, { size: 56, testID: "circle" }));
    const node = view.getByTestId("circle");

    expect(flattenStyle(node.props.style)).toEqual(
      expect.objectContaining({ width: 56, height: 56, borderRadius: 28 }),
    );
  });
});

describe("SkeletonText", () => {
  it("renders one line by default", () => {
    const view = render(React.createElement(SkeletonText, { testID: "text" }));

    expect(view.getAllByTestId(/^text-line-/)).toHaveLength(1);
  });

  it("renders the requested number of lines", () => {
    const view = render(React.createElement(SkeletonText, { lines: 3, testID: "text" }));

    expect(view.getAllByTestId(/^text-line-/)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/skeleton-loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SkeletonLoader`**

```tsx
// src/components/domain/SkeletonLoader.tsx
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";

import { Motion } from "../../lib/design/motion";

function useShimmerStyle() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.5, { duration: Motion.duration.slower }), -1, true);
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export type SkeletonBlockProps = { width: number; height: number; testID?: string };

export function SkeletonBlock({ width, height, testID }: SkeletonBlockProps) {
  const shimmerStyle = useShimmerStyle();

  return (
    <Animated.View
      className="rounded-xl bg-neutral-100"
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height }, shimmerStyle]}
      testID={testID}
    />
  );
}

export type SkeletonCircleProps = { size: number; testID?: string };

export function SkeletonCircle({ size, testID }: SkeletonCircleProps) {
  const shimmerStyle = useShimmerStyle();

  return (
    <Animated.View
      className="bg-neutral-100"
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, borderRadius: size / 2 }, shimmerStyle]}
      testID={testID}
    />
  );
}

export type SkeletonTextProps = { lines?: number; width?: number; testID?: string };

export function SkeletonText({ lines = 1, width = 160, testID }: SkeletonTextProps) {
  return (
    <View className="gap-2" testID={testID}>
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBlock
          height={12}
          key={index}
          testID={testID ? `${testID}-line-${index}` : `skeleton-text-line-${index}`}
          width={index === lines - 1 ? width * 0.6 : width}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/skeleton-loader.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/components/domain/SkeletonLoader.tsx tests/unit/skeleton-loader.test.ts
git commit -m "feat: add SkeletonLoader domain component"
```

---

## Task 19: Barrel exports and final verification

**Files:**
- Create: `src/components/ui/index.ts`
- Create: `src/components/domain/index.ts`
- Test: `tests/unit/component-exports.test.ts`

**Interfaces:**
- Consumes: every component built in Tasks 6–18.
- Produces: `src/components/ui/index.ts` re-exporting `Button`, `Input`, `Card` (and their prop/variant types); `src/components/domain/index.ts` re-exporting the ten domain components (and their prop/variant types). These are what every future screen-group spec imports from.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/component-exports.test.ts
import * as ui from "../../src/components/ui";
import * as domain from "../../src/components/domain";

describe("component barrel exports", () => {
  it("exports every base component", () => {
    expect(ui.Button).toBeDefined();
    expect(ui.Input).toBeDefined();
    expect(ui.Card).toBeDefined();
  });

  it("exports every domain component", () => {
    expect(domain.StatusBadge).toBeDefined();
    expect(domain.RatingStars).toBeDefined();
    expect(domain.BarberCard).toBeDefined();
    expect(domain.ServiceCard).toBeDefined();
    expect(domain.CalendarStrip).toBeDefined();
    expect(domain.TimeSlotPicker).toBeDefined();
    expect(domain.AppointmentCard).toBeDefined();
    expect(domain.EmptyState).toBeDefined();
    expect(domain.Toast).toBeDefined();
    expect(domain.SkeletonBlock).toBeDefined();
    expect(domain.SkeletonCircle).toBeDefined();
    expect(domain.SkeletonText).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/component-exports.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the barrels**

```ts
// src/components/ui/index.ts
export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";
export { Input } from "./Input";
export type { InputProps } from "./Input";
export { Card } from "./Card";
export type { CardProps, CardVariant } from "./Card";
```

```ts
// src/components/domain/index.ts
export { StatusBadge } from "./StatusBadge";
export type { AppointmentStatus, StatusBadgeProps } from "./StatusBadge";
export { RatingStars } from "./RatingStars";
export type { RatingStarsProps } from "./RatingStars";
export { BarberCard } from "./BarberCard";
export type { BarberCardProps } from "./BarberCard";
export { ServiceCard, formatPriceBRL } from "./ServiceCard";
export type { ServiceCardProps } from "./ServiceCard";
export { CalendarStrip } from "./CalendarStrip";
export type { CalendarStripDay, CalendarStripProps } from "./CalendarStrip";
export { TimeSlotPicker } from "./TimeSlotPicker";
export type { TimeSlot, TimeSlotPickerProps, TimeSlotStatus } from "./TimeSlotPicker";
export { AppointmentCard } from "./AppointmentCard";
export type { AppointmentCardProps } from "./AppointmentCard";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { Toast } from "./Toast";
export type { ToastProps, ToastVariant } from "./Toast";
export { SkeletonBlock, SkeletonCircle, SkeletonText } from "./SkeletonLoader";
export type { SkeletonBlockProps, SkeletonCircleProps, SkeletonTextProps } from "./SkeletonLoader";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/component-exports.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full verification gate**

Run: `npm run verify`
Expected: PASS — typecheck, lint, every Jest suite (including all new component tests), the Node Web-runner tests, and the pgTAP suite (unaffected by this work, must still pass) all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/index.ts src/components/domain/index.ts tests/unit/component-exports.test.ts
git commit -m "feat: barrel-export the design system component library"
```

- [ ] **Step 7: Request a code review**

Invoke the `requesting-code-review` skill against the full diff introduced by this plan (Tasks 1–19) before considering the foundation done.

---

## Self-review notes

- **Spec coverage:** every base component (§11) and every domain component from the spec's list (§12 minus §12.9) has a task. Token mirrors cover colors (§2), motion (§7), and the previously-unlisted shadows (§6, added in Task 5 with rationale). Font loading (§3) is Task 2. NativeWind/Tailwind/spacing (§0/§4/§5) setup is Task 1. Testing/TDD discipline is called out per-task and in Global Constraints, plus the final code-review step (Task 19, Step 7), per the user's explicit instruction to verify continuously and request review.
- **Type consistency:** `AppointmentStatus` is defined once in `StatusBadge.tsx` and imported (not redefined) by `AppointmentCard.tsx`; `Card`'s `CardVariant` and `Button`'s `ButtonVariant`/`ButtonSize` are likewise defined once and referenced by name elsewhere. `shadows.level1`/`level2` and `Motion.duration.*` keys are used identically across every consuming task.
- **No placeholders:** every step has runnable code, not a description of code — including the `AppointmentCard` layout caveat in Task 15, which is a concrete implementation instruction (merge two labels into one `Text` node), not a deferred TODO.
