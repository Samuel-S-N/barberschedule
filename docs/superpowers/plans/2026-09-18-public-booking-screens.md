# Public Booking Screens Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully rewrite every screen in `app/(public)/book/*` (`index.tsx`, `barber.tsx`, `service.tsx`, `date.tsx`, `review.tsx`) to use the design-system component library instead of raw React Native primitives and inline hex styles, and update `tests/e2e/booking.web.spec.ts` to match the new interaction model.

**Architecture:** Two small, justified library extensions land first (`BarberCard.rating` becomes optional; `Input` gains a `multiline` mode), then two new pure helper functions (a 14-day calendar-strip generator; an override-resolution function for service duration/price), each test-first. Only then do the five screens get rewritten one at a time — each keeps its existing route, `useLocalSearchParams` contract, and Supabase query/mutation logic untouched; only the JSX/styling layer changes from `StyleSheet`+hex to NativeWind `className` tokens and design-system components. The Playwright e2e spec is rewritten last, since it's the only thing that exercises the full click-through flow end to end.

**Tech Stack:** Expo Router, React Native 0.86, React 19, NativeWind v4 (`className` props, no `StyleSheet.create`/inline hex), `@tanstack/react-query`, `zod`, Jest (`jest-expo`) + `@testing-library/react-native`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-18-public-booking-screens-design.md`

## Global Constraints

- No inline hex anywhere in `app/(public)/book/*` — use NativeWind `className` tokens only: `bg-canvas` (page background), `bg-surface`, `text-ink`, `text-neutral-500`/`text-neutral-600` (muted text), `text-danger-500` (errors), `font-display-bold`/`font-display-semibold` (headings, Oswald), `font-sans`/`font-sans-medium` (body, Inter) — same rule the foundation plan already applies to components (`DESIGN_SYSTEM.md` §1.3).
- Weight classes always pair with their family class — never bare `font-bold`/`font-medium` (§1.1).
- `contentContainerClassName` is **not** available on this project's installed NativeWind version (verified: zero matches in `node_modules/nativewind`) — for a scrollable screen, put layout classes on an inner `View` wrapped by a plain `<ScrollView className="flex-1">`, the same pattern `CalendarStrip` already uses internally.
- Every screen's route path, `useLocalSearchParams` param names, Supabase query/mutation shape, and navigation target stay byte-for-byte identical to today — this plan changes presentation only, never booking behavior.
- Tasks 1–4 (library extensions and pure helpers) are TDD: write the failing test, run it, implement, run it again, then `npm run typecheck` before committing.
- Tasks 5–9 (screen rewrites) have no per-screen unit test — matching this codebase's existing convention that no `app/*` route has one (per the foundation spec's own Testing section). Each screen task's verification is `npm run typecheck` plus `npm run lint`; full behavioral verification happens in Task 10's real Playwright run.
- After the final task, run `npm run verify` **and** `npm run test:e2e:web` (the real Playwright suite against a live Expo web server — `npm run verify`'s `test:e2e:runner` step only meta-tests the runner script itself, it does not execute Playwright), then request a code review of the diff before calling this plan done.

---

## Task 1: `BarberCard.rating` becomes optional

**Files:**
- Modify: `src/components/domain/BarberCard.tsx`
- Test: `tests/unit/barber-card.test.ts`

**Interfaces:**
- Produces: `BarberCardProps.rating` changes from `rating: number` to `rating?: number`. All other props unchanged. When `rating` is `undefined`, the star/rating row does not render at all (not a `0`/placeholder value).

- [ ] **Step 1: Write the failing test**

Add this test to the existing `describe("BarberCard", ...)` block in `tests/unit/barber-card.test.ts` (after the last `it`, before the closing `});`):

```ts
  it("omits the rating row entirely when rating is not provided", async () => {
    const view = await render(React.createElement(BarberCard, { name: "João Silva" }));

    expect(view.queryByText("4.9")).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/barber-card.test.ts`
Expected: FAIL — TypeScript error, `rating` is missing from the required props (or, if TS is loose at the test boundary, a runtime crash rendering `undefined` rating).

- [ ] **Step 3: Make `rating` optional and conditionally render the row**

In `src/components/domain/BarberCard.tsx`, change the type and destructuring:

```tsx
export type BarberCardProps = {
  name: string;
  specialty?: string;
  rating?: number;
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
```

Wrap the existing rating `View` (the one containing the `Star` icon and the numeric `Text`) in a `rating !== undefined ? (...) : null` conditional, in place of always rendering it:

```tsx
          {rating !== undefined ? (
            <View className="flex-row items-center gap-1">
              <Star color={colors.warning[400]} fill={colors.warning[400]} size={14} />
              <Text
                className="text-sm font-sans-semibold text-ink"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {rating}
              </Text>
            </View>
          ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/barber-card.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/domain/BarberCard.tsx tests/unit/barber-card.test.ts
git commit -m "feat: make BarberCard.rating optional"
```

---

## Task 2: `Input` gains a `multiline` mode

**Files:**
- Modify: `src/components/ui/Input.tsx`
- Test: `tests/unit/input.test.ts`

**Interfaces:**
- Produces: `InputProps.multiline?: boolean` (default `false`). When `true`, the underlying `TextInput` gets `multiline` and a taller minimum height (`min-h-input-height` growing with content) instead of the fixed single-line `h-input-height`.

- [ ] **Step 1: Write the failing test**

Add this test to the existing `describe("Input", ...)` block in `tests/unit/input.test.ts`:

```ts
  it("passes multiline through to the underlying TextInput when set", async () => {
    const view = await render(
      React.createElement(Input, {
        label: "Notes", multiline: true, value: "", onChangeText: jest.fn(), testID: "notes-input",
      }),
    );

    expect(view.getByTestId("notes-input").props.multiline).toBe(true);
  });

  it("does not set multiline on the underlying TextInput by default", async () => {
    const view = await render(
      React.createElement(Input, {
        label: "Local date", value: "", onChangeText: jest.fn(), testID: "date-input",
      }),
    );

    expect(view.getByTestId("date-input").props.multiline).toBeFalsy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/input.test.ts`
Expected: FAIL — `multiline` is not an accepted prop (TypeScript) and/or `props.multiline` is `undefined`, not `true`.

- [ ] **Step 3: Add the `multiline` prop**

In `src/components/ui/Input.tsx`:

```tsx
export type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  testID?: string;
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  multiline = false,
  testID,
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const borderClassName = hasError
    ? "border-[1.5px] border-danger-500"
    : focused
      ? "border-[1.5px] border-primary-400"
      : "border border-neutral-200";
  const heightClassName = multiline ? "min-h-input-height py-3" : "h-input-height";

  return (
    <View className="gap-1">
      <Text className="text-sm font-sans-medium text-neutral-700">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className={`${heightClassName} rounded-xl px-4 font-sans text-base text-ink bg-surface ${borderClassName}`}
        multiline={multiline}
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
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Input.tsx tests/unit/input.test.ts
git commit -m "feat: add multiline mode to Input"
```

---

## Task 3: `buildCalendarStripDays` pure helper

**Files:**
- Create: `src/lib/dates/calendar-strip-days.ts`
- Test: `tests/unit/calendar-strip-days.test.ts`

**Interfaces:**
- Consumes: `formatInstantInShopTime` from `../../src/lib/dates/shop-time` (existing); `CalendarStripDay` type from `../../src/components/domain/CalendarStrip` (existing: `{ date: string; weekdayLabel: string; dayNumber: string; hasAppointment?: boolean }`).
- Produces: `buildCalendarStripDays(startInstant: Date, count: number): CalendarStripDay[]` — `count` consecutive days starting from `startInstant`'s shop-local (`America/Sao_Paulo`) date. `hasAppointment` is never set (left `undefined`) since it has no meaning for an unbooked customer. Consumed by Task 8 (`date.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/calendar-strip-days.test.ts
import { buildCalendarStripDays } from "../../src/lib/dates/calendar-strip-days";

describe("buildCalendarStripDays", () => {
  it("generates the requested number of consecutive days", () => {
    const days = buildCalendarStripDays(new Date("2026-09-18T12:00:00Z"), 3);

    expect(days).toEqual([
      { date: "2026-09-18", dayNumber: "18", weekdayLabel: "Fri" },
      { date: "2026-09-19", dayNumber: "19", weekdayLabel: "Sat" },
      { date: "2026-09-20", dayNumber: "20", weekdayLabel: "Sun" },
    ]);
  });

  it("starts from the shop-local date, not the UTC date, near a timezone boundary", () => {
    // 2026-09-19T01:00:00Z is 2026-09-18T22:00 in America/Sao_Paulo (UTC-3) —
    // still the 18th locally, even though the UTC calendar date is the 19th.
    const days = buildCalendarStripDays(new Date("2026-09-19T01:00:00Z"), 1);

    expect(days).toEqual([{ date: "2026-09-18", dayNumber: "18", weekdayLabel: "Fri" }]);
  });

  it("returns an empty array when count is 0", () => {
    expect(buildCalendarStripDays(new Date("2026-09-18T12:00:00Z"), 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/calendar-strip-days.test.ts`
Expected: FAIL — cannot find module `../../src/lib/dates/calendar-strip-days`.

- [ ] **Step 3: Create `src/lib/dates/calendar-strip-days.ts`**

```ts
import { formatInstantInShopTime } from "./shop-time";
import type { CalendarStripDay } from "../../components/domain/CalendarStrip";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });

function addLocalDays(localDate: string, days: number): string {
  const anchor = new Date(`${localDate}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

export function buildCalendarStripDays(startInstant: Date, count: number): CalendarStripDay[] {
  const startLocalDate = formatInstantInShopTime(startInstant).localDate;

  return Array.from({ length: count }, (_, index) => {
    const date = addLocalDays(startLocalDate, index);
    const anchor = new Date(`${date}T12:00:00Z`);

    return {
      date,
      dayNumber: date.slice(8, 10),
      weekdayLabel: weekdayFormatter.format(anchor),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/calendar-strip-days.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/dates/calendar-strip-days.ts tests/unit/calendar-strip-days.test.ts
git commit -m "feat: add buildCalendarStripDays helper"
```

---

## Task 4: `resolveEffectiveServiceFields` pure helper

**Files:**
- Create: `src/features/services/resolve-effective-fields.ts`
- Test: `tests/unit/resolve-effective-service-fields.test.ts`

**Interfaces:**
- Produces: `resolveEffectiveServiceFields(input: EffectiveServiceFieldsInput): EffectiveServiceFields`, where `EffectiveServiceFieldsInput = { durationOverrideMinutes: number | null; priceOverrideCents: number | null; durationMinutes: number; priceCents: number }` and `EffectiveServiceFields = { durationMinutes: number; priceCents: number }`. Mirrors the `coalesce(override, base)` rule already implemented server-side in `resolve_effective_service` (`supabase/migrations/0008_barber_services.sql:56-63`) — override wins when non-null, else the base value. Consumed by Task 7 (`service.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/resolve-effective-service-fields.test.ts
import { resolveEffectiveServiceFields } from "../../src/features/services/resolve-effective-fields";

describe("resolveEffectiveServiceFields", () => {
  it("uses the base duration and price when no override is set", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: null, priceCents: 4000, priceOverrideCents: null,
    })).toEqual({ durationMinutes: 30, priceCents: 4000 });
  });

  it("uses the duration override when set, independent of price", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: 45, priceCents: 4000, priceOverrideCents: null,
    })).toEqual({ durationMinutes: 45, priceCents: 4000 });
  });

  it("uses the price override when set, independent of duration", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: null, priceCents: 4000, priceOverrideCents: 5500,
    })).toEqual({ durationMinutes: 30, priceCents: 5500 });
  });

  it("uses both overrides when both are set", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: 45, priceCents: 4000, priceOverrideCents: 5500,
    })).toEqual({ durationMinutes: 45, priceCents: 5500 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/unit/resolve-effective-service-fields.test.ts`
Expected: FAIL — cannot find module `../../src/features/services/resolve-effective-fields`.

- [ ] **Step 3: Create `src/features/services/resolve-effective-fields.ts`**

```ts
export type EffectiveServiceFieldsInput = {
  durationOverrideMinutes: number | null;
  priceOverrideCents: number | null;
  durationMinutes: number;
  priceCents: number;
};

export type EffectiveServiceFields = {
  durationMinutes: number;
  priceCents: number;
};

export function resolveEffectiveServiceFields(
  input: EffectiveServiceFieldsInput,
): EffectiveServiceFields {
  return {
    durationMinutes: input.durationOverrideMinutes ?? input.durationMinutes,
    priceCents: input.priceOverrideCents ?? input.priceCents,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/unit/resolve-effective-service-fields.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/services/resolve-effective-fields.ts tests/unit/resolve-effective-service-fields.test.ts
git commit -m "feat: add resolveEffectiveServiceFields helper"
```

---

## Task 5: Rewrite `app/(public)/book/index.tsx`

**Files:**
- Modify: `app/(public)/book/index.tsx` (full rewrite)

**Interfaces:**
- Consumes: `EmptyState` (`../../../src/components/domain/EmptyState`), `SkeletonBlock` (`../../../src/components/domain/SkeletonLoader`), `Button` (`../../../src/components/ui/Button`), `useSupabaseSession` (`../../../src/providers/AppProviders`), `useRouter` (`expo-router`).
- Produces: same route (`/book`), same Supabase query (`shops.select("id, name")`), navigates to `/book/barber?shopId=...` — identical to today, only the trigger changes from a `Link` to a `Button`'s `onPress`.

- [ ] **Step 1: Rewrite the screen**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SafeAreaView, Text, View } from "react-native";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Button } from "../../../src/components/ui/Button";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Shop = { id: string; name: string };

export default function BookIndexScreen() {
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const shops = useQuery({
    queryFn: async () => {
      const { data, error } = await supabase.from("shops").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Shop[];
    },
    queryKey: ["public-shops"],
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-6">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
          Book an appointment
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {shops.isLoading ? (
            <>
              <SkeletonBlock height={60} width={320} />
              <SkeletonBlock height={60} width={320} />
              <SkeletonBlock height={60} width={320} />
            </>
          ) : null}
          {shops.error ? (
            <Text className="text-sm font-sans text-danger-500">Unable to load shops.</Text>
          ) : null}
          {!shops.isLoading && !shops.error && shops.data?.length === 0 ? (
            <EmptyState title="No shops available" />
          ) : null}
          {shops.data?.map((shop) => (
            <Button
              key={shop.id}
              label={`Start booking at ${shop.name}`}
              onPress={() => router.push(`/book/barber?shopId=${encodeURIComponent(shop.id)}`)}
              size="lg"
              variant="primary"
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/book/index.tsx"
git commit -m "feat: rewrite booking shop-list screen with design system"
```

---

## Task 6: Rewrite `app/(public)/book/barber.tsx`

**Files:**
- Modify: `app/(public)/book/barber.tsx` (full rewrite)

**Interfaces:**
- Consumes: `BarberCard` (Task 1's optional-`rating` version), `EmptyState`, `SkeletonBlock`, `listPublicBarbers` (existing, `../../../src/features/barbers/api`), `useSupabaseSession`, `useRouter`.
- Produces: same route (`/book/barber`), same `shopId` param read, same query, navigates to `/book/service?shopId=...&barberId=...` — identical to today.

- [ ] **Step 1: Rewrite the screen**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, Text, View } from "react-native";

import { BarberCard } from "../../../src/components/domain/BarberCard";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { listPublicBarbers } from "../../../src/features/barbers/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookBarberScreen() {
  const { shopId: rawShopId } = useLocalSearchParams<{ shopId?: string }>();
  const shopId = param(rawShopId);
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const barbers = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicBarbers(supabase, shopId),
    queryKey: ["public-barbers", shopId],
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-6">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
          Choose your barber
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {barbers.isLoading ? (
            <>
              <SkeletonBlock height={72} width={320} />
              <SkeletonBlock height={72} width={320} />
            </>
          ) : null}
          {barbers.error ? (
            <Text className="text-sm font-sans text-danger-500">Unable to load barbers.</Text>
          ) : null}
          {!barbers.isLoading && !barbers.error && barbers.data?.length === 0 ? (
            <EmptyState title="No barbers available" />
          ) : null}
          {barbers.data?.map((barber) => (
            <BarberCard
              key={barber.id}
              name={barber.name}
              onPress={() => router.push(
                `/book/service?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barber.id)}`,
              )}
              testID={`barber-card-${barber.id}`}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/book/barber.tsx"
git commit -m "feat: rewrite booking barber-list screen with design system"
```

---

## Task 7: Rewrite `app/(public)/book/service.tsx`

**Files:**
- Modify: `app/(public)/book/service.tsx` (full rewrite)

**Interfaces:**
- Consumes: `ServiceCard`, `EmptyState`, `SkeletonBlock`, `resolveEffectiveServiceFields` (Task 4), `useSupabaseSession`, `useRouter`.
- Produces: same route (`/book/service`), same `shopId`/`barberId` params, expanded query (adds `duration_override_minutes, price_override_cents` and the joined `services(name, duration_minutes, price_cents)`), navigates to `/book/date?shopId=...&barberId=...&barberServiceId=...` — identical target to today.

- [ ] **Step 1: Rewrite the screen**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, Text, View } from "react-native";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { ServiceCard } from "../../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { resolveEffectiveServiceFields } from "../../../src/features/services/resolve-effective-fields";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type BarberServiceRow = {
  id: string;
  duration_override_minutes: number | null;
  price_override_cents: number | null;
  services: { name: string; duration_minutes: number; price_cents: number } | null;
};

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookServiceScreen() {
  const { barberId: rawBarberId, shopId: rawShopId } = useLocalSearchParams<{ barberId?: string; shopId?: string }>();
  const barberId = param(rawBarberId);
  const shopId = param(rawShopId);
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const services = useQuery({
    enabled: Boolean(barberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("id, duration_override_minutes, price_override_cents, services(name, duration_minutes, price_cents)")
        .eq("barber_id", barberId)
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as BarberServiceRow[];
    },
    queryKey: ["public-barber-services", barberId],
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-6">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
          Choose a service
        </Text>
        <View className="w-full max-w-[420px] gap-3">
          {services.isLoading ? (
            <>
              <SkeletonBlock height={76} width={320} />
              <SkeletonBlock height={76} width={320} />
            </>
          ) : null}
          {services.error ? (
            <Text className="text-sm font-sans text-danger-500">Unable to load services.</Text>
          ) : null}
          {!services.isLoading && !services.error && services.data?.length === 0 ? (
            <EmptyState title="No services available" />
          ) : null}
          {services.data?.map((service) => {
            const effective = resolveEffectiveServiceFields({
              durationMinutes: service.services?.duration_minutes ?? 0,
              durationOverrideMinutes: service.duration_override_minutes,
              priceCents: service.services?.price_cents ?? 0,
              priceOverrideCents: service.price_override_cents,
            });

            return (
              <ServiceCard
                durationMinutes={effective.durationMinutes}
                key={service.id}
                name={service.services?.name ?? "Service"}
                onPress={() => router.push(
                  `/book/date?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(service.id)}`,
                )}
                priceCents={effective.priceCents}
                testID={`service-card-${service.id}`}
              />
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/book/service.tsx"
git commit -m "feat: rewrite booking service-list screen with design system"
```

---

## Task 8: Rewrite `app/(public)/book/date.tsx`

**Files:**
- Modify: `app/(public)/book/date.tsx` (full rewrite)

**Interfaces:**
- Consumes: `CalendarStrip` (existing), `buildCalendarStripDays` (Task 3), `Button` (`../../../src/components/ui/Button`), `useRouter`.
- Produces: same route (`/book/date`), same `shopId`/`barberId`/`barberServiceId` params read and forwarded, navigates to `/book/review?shopId=...&barberId=...&barberServiceId=...&localDate=...`. The free-text date field and its `YYYY-MM-DD` validation are gone entirely — `localDate` now always comes from `buildCalendarStripDays`, defaulting to today, so there is no invalid-format case left to handle.

- [ ] **Step 1: Rewrite the screen**

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, Text, View } from "react-native";

import { CalendarStrip } from "../../../src/components/domain/CalendarStrip";
import { Button } from "../../../src/components/ui/Button";
import { buildCalendarStripDays } from "../../../src/lib/dates/calendar-strip-days";

const DAYS_AHEAD = 14;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookDateScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; shopId?: string }>();
  const router = useRouter();
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const shopId = param(params.shopId);
  const days = useMemo(() => buildCalendarStripDays(new Date(), DAYS_AHEAD), []);
  const [localDate, setLocalDate] = useState(days[0].date);

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-6 p-6">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
          Choose a date
        </Text>
        <View className="w-full">
          <CalendarStrip days={days} onSelectDate={setLocalDate} selectedDate={localDate} />
        </View>
        <View className="w-full max-w-[420px]">
          <Button
            label="Continue to review"
            onPress={() => router.push(
              `/book/review?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(barberServiceId)}&localDate=${encodeURIComponent(localDate)}`,
            )}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/book/date.tsx"
git commit -m "feat: rewrite booking date-picker screen with design system"
```

---

## Task 9: Rewrite `app/(public)/book/review.tsx`

**Files:**
- Modify: `app/(public)/book/review.tsx` (full rewrite)

**Interfaces:**
- Consumes: `TimeSlotPicker`/`TimeSlot` (existing), `Toast` (existing), `EmptyState`, `SkeletonBlock`, `Input` (Task 2's `multiline` version), `Button`, `bookAppointment`/`getAvailableSlotsQueryOptions`/`listMyCustomers` (all existing, unchanged), `useSupabaseSession`.
- Produces: same route (`/book/review`), same params read, same mutation call shape (`bookAppointment(supabase, { barberServiceId, customerId, notes, source: "customer", startsAt })`) and same `disabled` logic on the confirm button — identical booking behavior to today. Drops `react-hook-form`'s `useForm`/`Controller` for the single `notes` field in favor of local `useState`, since `Input` doesn't expose an `onBlur` prop to wire up and this form has no other fields needing form-level state.

- [ ] **Step 1: Rewrite the screen**

```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";
import { z } from "zod";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { bookAppointment } from "../../../src/features/appointments/api";
import { getAvailableSlotsQueryOptions } from "../../../src/features/availability/query";
import type { AvailableSlot } from "../../../src/features/availability/types";
import { listMyCustomers } from "../../../src/features/customers/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

const notesSchema = z.object({ notes: z.string().trim().max(500) });

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookReviewScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; localDate?: string }>();
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const localDate = param(params.localDate);
  const { profile, supabase } = useSupabaseSession();
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId && localDate),
  });
  const customers = useQuery({
    enabled: profile?.role === "customer",
    queryFn: () => listMyCustomers(supabase),
    queryKey: ["my-customers"],
  });
  const customer = customers.data?.find(
    (candidate) => candidate.active && candidate.userId === profile?.userId,
  );
  const booking = useMutation({
    mutationFn: (submittedNotes: string) => {
      if (profile?.role !== "customer" || !customer || !startsAt) {
        throw new Error("Choose an available time before booking.");
      }
      return bookAppointment(supabase, {
        barberServiceId,
        customerId: customer.id,
        notes: submittedNotes || null,
        source: "customer",
        startsAt,
      });
    },
    onError: (error) => setFeedback({
      message: error instanceof Error ? error.message : "Unable to book this appointment.",
      variant: "error",
    }),
    onSuccess: () => setFeedback({ message: "Booking confirmed.", variant: "success" }),
  });

  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({
    status: slot.startsAt === startsAt ? "selected" : "free",
    time: slot.localTime,
  }));

  const selectSlot = (time: string) => {
    const match = availability.data?.find((slot: AvailableSlot) => slot.localTime === time);
    setStartsAt(match?.startsAt ?? null);
  };

  const submit = () => {
    const parsed = notesSchema.safeParse({ notes });
    if (!parsed.success) {
      setFeedback({ message: "Notes must be 500 characters or fewer.", variant: "error" });
      return;
    }
    setFeedback(null);
    booking.mutate(parsed.data.notes);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1" testID="booking-review-scroll">
        <View className="items-center gap-4 p-6">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
            Review your booking
          </Text>
          <Text className="w-full max-w-[420px] text-base font-sans text-neutral-600">{localDate}</Text>
          <View className="w-full max-w-[420px] gap-2">
            {availability.isLoading ? (
              <>
                <SkeletonBlock height={56} width={320} />
                <SkeletonBlock height={56} width={320} />
              </>
            ) : null}
            {availability.error ? (
              <Text className="text-sm font-sans text-danger-500">Unable to load availability.</Text>
            ) : null}
            {!availability.isLoading && !availability.error && slots.length === 0 ? (
              <EmptyState title="No times available this day" />
            ) : null}
            {slots.length > 0 ? <TimeSlotPicker onSelectSlot={selectSlot} slots={slots} /> : null}
          </View>
          <View className="w-full max-w-[420px]">
            <Input label="Notes (optional)" multiline onChangeText={setNotes} testID="booking-notes-input" value={notes} />
          </View>
          <Toast
            message={feedback?.message ?? ""}
            onDismiss={() => setFeedback(null)}
            variant={feedback?.variant ?? "info"}
            visible={feedback !== null}
          />
          <View className="w-full max-w-[420px]">
            <Button
              disabled={!startsAt || !customer || booking.isPending}
              label="Confirm booking"
              onPress={submit}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/book/review.tsx"
git commit -m "feat: rewrite booking review screen with design system"
```

---

## Task 10: Rewrite the e2e spec and run the full gate

**Files:**
- Modify: `tests/e2e/booking.web.spec.ts`

**Interfaces:**
- Consumes: nothing new — same 5 existing test cases, same mocked Supabase REST routes, same fixture IDs.
- Produces: selectors updated to match `Button`/`BarberCard`/`ServiceCard`'s `accessibilityRole="button"` (was `"link"`), the date step drops the now-removed free-text input, and the `/barber_services` mock response gains the fields `service.tsx` (Task 7) now selects.

- [ ] **Step 1: Update the `/barber_services` route mock in both booking tests**

In `tests/e2e/booking.web.spec.ts`, in **both** `test("an authenticated customer can select a public slot and submit a booking", ...)` and `test("a customer sees an unavailable error when booking loses the slot", ...)`, replace:

```ts
    if (url.pathname.endsWith("/barber_services")) {
      await json([{ id: barberServiceId, service_id: "service-1", services: { name: "Browser Cut" } }]);
      return;
    }
```

(and the second test's single-line equivalent:)

```ts
    if (url.pathname.endsWith("/barber_services")) return json([{ id: barberServiceId, service_id: "service-1", services: { name: "Browser Cut" } }]);
```

with:

```ts
    if (url.pathname.endsWith("/barber_services")) {
      await json([{
        duration_override_minutes: null,
        id: barberServiceId,
        price_override_cents: null,
        service_id: "service-1",
        services: { duration_minutes: 30, name: "Browser Cut", price_cents: 4000 },
      }]);
      return;
    }
```

(using the `await json(...); return;` form in both places — the second test's route handler already uses early `return json(...)` for other branches, but this block needs the multi-line object, so keep it consistent with the block form shown above.)

- [ ] **Step 2: Update the interaction steps in both booking tests**

In `test("an authenticated customer can select a public slot and submit a booking", ...)`, replace:

```ts
  await page.goto("/book");
  await page.getByRole("link", { name: "Start booking at Browser Shop" }).click();
  await page.getByRole("link", { name: "Browser Barber" }).click();
  await page.getByRole("link", { name: "Browser Cut" }).click();
  await page.getByPlaceholder("Local date (YYYY-MM-DD)").fill("2026-08-17");
  await page.getByRole("link", { name: "Continue to review" }).click();
```

with:

```ts
  await page.goto("/book");
  await page.getByRole("button", { name: "Start booking at Browser Shop" }).click();
  await page.getByRole("button", { name: "Browser Barber" }).click();
  await page.getByRole("button", { name: "Browser Cut" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();
```

In `test("a customer sees an unavailable error when booking loses the slot", ...)`, replace:

```ts
  await page.goto("/book");
  await page.getByRole("link", { name: "Start booking at Browser Shop" }).click();
  await page.getByRole("link", { name: "Browser Barber" }).click();
  await page.getByRole("link", { name: "Browser Cut" }).click();
  await page.getByPlaceholder("Local date (YYYY-MM-DD)").fill("2026-08-17");
  await page.getByRole("link", { name: "Continue to review" }).click();
```

with the same replacement as above.

Leave the other 3 tests in this file (`"an owner is redirected away..."`, `"a customer can reschedule..."`, `"a customer can cancel..."`) untouched — they exercise `/appointments`, not `/book/*`, and are out of scope for this plan.

- [ ] **Step 3: Run the Jest suite**

Run: `npm test -- --runInBand`
Expected: PASS — 39 suites (unchanged count; no new Jest test files were added since Task 4), all green.

- [ ] **Step 4: Run the full standard gate**

Run: `npm run verify`
Expected: PASS — typecheck, lint, every Jest suite, the e2e-runner meta-test, and the pgTAP suite all green, **except** the 4 pre-existing `010_full_rls.sql` seed-count failures, which also reproduce identically on `main` (confirmed independently — this is a pre-existing local Supabase seed-state issue, not something this plan introduces or is responsible for fixing).

- [ ] **Step 5: Run the real Playwright suite against a live server**

Run: `npm run test:e2e:web`
Expected: PASS — all 5 tests in `tests/e2e/booking.web.spec.ts`, plus every other `*.web.spec.ts` file in `tests/e2e/`, green. This is the authoritative check that the rewritten screens' interaction model actually works end to end; `npm run verify` alone does not run it.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/booking.web.spec.ts
git commit -m "test: update booking e2e spec for design-system screens"
```

- [ ] **Step 7: Request a code review**

Invoke the `requesting-code-review` skill against the full diff introduced by this plan (Tasks 1–10) before considering the public booking screens retrofit done.
