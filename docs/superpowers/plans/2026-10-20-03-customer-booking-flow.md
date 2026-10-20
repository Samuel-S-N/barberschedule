# Customer Booking Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Booking wizard becomes barber → service → date → time → checkout review → confirm; barber photos show in the picker; the "Agenda" title is no longer clipped; every wizard screen shows a step indicator ("Passo 3 de 6 · Data").

**Architecture:** Split today's `book/review.tsx` (time picker + notes + confirm) into `book/time.tsx` (slots) and `book/review.tsx` (pure checkout: summary + notes + confirm). The chosen `startsAt` travels as a route param. Photos: `barbers.avatar_url` is not in the customer column grant (`0005_barbers.sql:17`), so add the grant, select the column, and render `Avatar` in `BarberCard`.

**Tech Stack:** Expo Router stack (`book/_layout.tsx`), React Query, Supabase column grants, Playwright web e2e.

**Spec:** `docs/superpowers/plans/2026-10-20-ux-overhaul-index.md`

## Global Constraints
- Branch `feat-booking-checkout` from `main` (after Plan 1 is merged; date text uses `formatDateNumeric`).
- Route params stay URL-encoded with `encodeURIComponent`; `startsAt` is the ISO instant returned by `get_available_slots`.
- Reschedule screen (`app/(customer)/reschedule.tsx`) and the "Book again" shortcut keep working: "Book again" pushes `/book/date?…` (must still land on the date step, then continue to time).
- Memory: TDD, verify UI in a browser (screenshot + computed CSS), `rtk` for shell output, jest only `tests/**/*.test.ts`.

---

### Task 1: Barber photo (DB grant + data + card)

**Files:** Create `supabase/migrations/0047_public_barber_avatar.sql` (use next free number); Modify `src/features/barbers/api.ts` (`publicBarberColumns`, `toPublicBarber`), `src/features/barbers/types.ts` (`PublicBarber`, `PublicBarberRow`), `src/components/domain/BarberCard.tsx`, `app/(customer)/(tabs)/book/barber.tsx`; Test `tests/integration/barber-booking.test.ts` (or new `tests/unit/public-barbers.test.ts`), `supabase/tests/` optional.

**Interfaces — Produces:** `PublicBarber.avatarUrl: string | null`; `BarberCardProps.avatarUrl?: string | null`.

- [ ] **Step 1: failing test** `tests/unit/public-barbers.test.ts`

```ts
import { listPublicBarbers } from "../../src/features/barbers/api";

it("selects avatar_url and maps it", async () => {
  const order = jest.fn().mockResolvedValue({ data: [{ id: "b1", shop_id: "s1", name: "Ana", active: true, archived_at: null, avatar_url: "https://x/y.jpg" }], error: null });
  const select = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order }) });
  const supabase = { from: jest.fn().mockReturnValue({ select }), rpc: jest.fn() };

  const [barber] = await listPublicBarbers(supabase as never, "s1");

  expect(select).toHaveBeenCalledWith(expect.stringContaining("avatar_url"));
  expect(barber.avatarUrl).toBe("https://x/y.jpg");
});
```
- [ ] **Step 2:** `npx jest tests/unit/public-barbers.test.ts` → FAIL.
- [ ] **Step 3: implement.** Migration:

```sql
-- Customers (and anonymous visitors of the public booking page) may see a barber's profile photo.
grant select (avatar_url) on table public.barbers to anon, authenticated;
```
`api.ts`: `const publicBarberColumns = "id, shop_id, name, active, archived_at, avatar_url";` and in `toPublicBarber` add `avatarUrl: row.avatar_url ?? null`. Types: add `avatarUrl: string | null` to `PublicBarber` and `avatar_url?: string | null` to `PublicBarberRow`. **Check first** what the barber profile stores in `avatar_url` (path vs full URL): read `src/features/account/avatar.ts` and `app/(barber)/my-profile/account.tsx`; if it stores a storage path, resolve with `supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl` inside `listPublicBarbers`'s caller (see `src/features/account/use-my-profile.ts:17`) — add a test for that mapping.
  Verified: `app/(barber)/my-profile/account.tsx` stores the **full public URL** in `barbers.avatar_url` (it calls `getPublicUrl` before `updateMyBarberProfile`), so no path resolution is needed — skip the path-vs-URL check below.
  Note: `OwnerBarber extends PublicBarber & { avatarUrl … }` — remove the now-duplicate field from `OwnerBarber` and `toOwnerBarber` keeps spreading `toPublicBarber`.
- [ ] **Step 4:** `BarberCard`: replace `<View className="h-14 w-14 rounded-full bg-mist" />` with `<Avatar name={name} size={56} uri={avatarUrl} />` (import from `./Avatar`; it already falls back to the initial and to the initial on load error). Add prop `avatarUrl?: string | null`. `barber.tsx`: pass `avatarUrl={barber.avatarUrl}`.
- [ ] **Step 5:** apply migration locally (`npx supabase db reset` or `migration up`), run jest + `npm run typecheck`, check in browser that a seeded barber with `avatar_url` shows the photo (UPDATE one row via psql for the check).
- [ ] **Step 6:** commit `fix: show barber photo in booking picker`.

---

### Task 2: Time step screen

**Files:** Create `app/(customer)/(tabs)/book/time.tsx`; Modify `app/(customer)/(tabs)/book/date.tsx` (continue target), `app/(customer)/(tabs)/book/_layout.tsx` (no change needed — Stack auto-registers files; verify), `src/i18n/locales/{en,es,pt}.ts` (`book.timeTitle`, `book.continueToCheckout`, `book.dateContinue`); Test: e2e in Task 4.

**Interfaces — Produces:** route `/book/time?shopId&barberId&barberServiceId&localDate`; on continue pushes `/book/review?…&localDate&startsAt`.

- [ ] **Step 1:** in `date.tsx`, change the continue `router.push` target from `/book/review` to `/book/time` (same query string) and the button label key to `book.continue` → "Continue" (en), "Continuar" (pt), "Continuar" (es). Update `book.continue` text in all three locales (currently "Continue to review"); the "Continue to review" string is also used by e2e (`booking.web.spec.ts`, search `rg "Continue to review" tests`).
- [ ] **Step 2:** create `time.tsx` by moving from `review.tsx` the availability query, `slots` mapping, `selectSlot`, `TimeSlotPicker` block and its loading/error/empty states:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../../../src/components/domain/TimeSlotPicker";
import { Button } from "../../../../src/components/ui/Button";
import { Screen } from "../../../../src/components/ui/Screen";
import { getAvailableSlotsQueryOptions } from "../../../../src/features/availability/query";
import type { AvailableSlot } from "../../../../src/features/availability/types";
import { useLanguage } from "../../../../src/i18n/use-language";
import { formatDateNumeric } from "../../../../src/lib/i18n/format";
import { useBack } from "../../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookTimeScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; localDate?: string; shopId?: string }>();
  const { barberId, barberServiceId, localDate, shopId } = { barberId: param(params.barberId), barberServiceId: param(params.barberServiceId), localDate: param(params.localDate), shopId: param(params.shopId) };
  const router = useRouter();
  const back = useBack("/book");
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const availability = useQuery({ ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }), enabled: Boolean(barberId && barberServiceId && localDate) });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime }));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <View className="w-full max-w-[420px] gap-1">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("book.timeTitle")} />
            <Text className="text-base font-sans text-neutral-600">{formatDateNumeric(localDate, language)}</Text>
          </View>
          <View className="w-full max-w-[420px] gap-2">
            {availability.isLoading ? (<><SkeletonBlock height={56} width={320} /><SkeletonBlock height={56} width={320} /></>) : null}
            {availability.error ? <Text className="text-sm font-sans text-danger-500">{t("book.timesError")}</Text> : null}
            {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title={t("book.noTimes")} /> : null}
            {slots.length > 0 ? (
              <TimeSlotPicker
                onSelectSlot={(time) => setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime === time)?.startsAt ?? null)}
                slots={slots}
              />
            ) : null}
          </View>
          <View className="w-full max-w-[420px]">
            <Button
              disabled={!startsAt}
              label={t("book.continueToCheckout")}
              onPress={() => router.push(`/book/review?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(barberServiceId)}&localDate=${encodeURIComponent(localDate)}&startsAt=${encodeURIComponent(startsAt ?? "")}`)}
              testID="book-time-continue"
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```
(`useBack(fallback)` signature comes from Plan 1; if Plan 1 is not merged yet, use the current zero-arg `useBack()`.)
Locale strings: `timeTitle` "Choose a time"/"Escolha o horário"/"Elige la hora"; `continueToCheckout` "Continue to checkout"/"Ir para o checkout"/"Ir al pago".
- [ ] **Step 3:** `npm run typecheck && npm run lint`; commit `feat: separate time step in booking`.

---

### Task 3: Checkout review screen

**Files:** Modify `app/(customer)/(tabs)/book/review.tsx`; locales (`book.reviewTitle` → "Checkout"/"Checkout"/"Resumen").

- [ ] **Step 1:** Remove from `review.tsx`: `availability` query, `slots`, `selectSlot`, `TimeSlotPicker`/`EmptyState`/`SkeletonBlock` imports and JSX, `useState(startsAt)`. Read `const startsAt = param(params.startsAt);` instead, and add it to the `params` generic type.
- [ ] **Step 2:** Show full summary incl. time: extend `BookingSummary` with a `timeLabel` row (`book.summary.time`: "Time"/"Horário"/"Hora") fed by `formatInstantInShopTime(new Date(startsAt)).localTime`; `BookingSummary` is used only here and in screenshots — grep `rg "BookingSummary" app src` to confirm.
- [ ] **Step 3:** Mutation guard: `if (profile?.role !== "customer" || !customer || !startsAt) throw new Error(NO_SLOT_SELECTED)` stays; button `disabled={!startsAt || !customer || booking.isPending}`; `onError` keeps invalidating `available-slots`; on error also `router.back()` is NOT done (user sees the toast and can go back to pick another time). Header: `ScreenHeader` with `book.reviewTitle` (back button replaces the bare `Text` title).
- [ ] **Step 4:** `npm run typecheck && npm run lint`; commit `feat: checkout review screen`.

---

### Task 3b: Step indicator

**Files:** Create `src/features/booking/steps.ts`, `src/components/domain/StepIndicator.tsx`; Modify `app/(customer)/(tabs)/book/{barber,service,date,time,review}.tsx`, `src/components/domain/index.ts`, locales; Test `tests/unit/booking-steps.test.ts`, `tests/e2e/booking.web.spec.ts`

**Interfaces — Produces:**
```ts
export const BOOKING_STEPS = ["barber", "service", "date", "time", "review", "confirm"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];
stepNumber(step: BookingStep): number                       // 1-based
stepHref(step: BookingStep, ids: { shopId: string; barberId?: string; barberServiceId?: string; localDate?: string }): string | null
<StepIndicator current={BookingStep} ids={...} />          // "review" is the last navigable screen; "confirm" is the button on it
```

Look: a row of 6 slim segments (`h-1.5 flex-1 rounded-full`, `gap-1.5`): done `bg-primary-400`, current `bg-primary-600`, upcoming `bg-neutral-200`; under it one line `Passo 3 de 6 · Data` (`text-sm font-sans-medium text-neutral-600`, `tabular-nums`). Completed segments are tappable (44px-high hit area via `hitSlop`) and go back to that step with the choices made so far; the current and upcoming ones are not. The checkout screen shows "Passo 5 de 6 · Revisão"; step 6 is the **Confirmar** button on that screen (completing it leaves the wizard, so there is no sixth screen).

- [ ] **Step 1: failing test**

```ts
import { BOOKING_STEPS, stepHref, stepNumber } from "../../src/features/booking/steps";

it("numbers the six steps", () => {
  expect(BOOKING_STEPS).toHaveLength(6);
  expect(stepNumber("barber")).toBe(1);
  expect(stepNumber("time")).toBe(4);
  expect(stepNumber("confirm")).toBe(6);
});

it("builds the route of a completed step from the choices so far", () => {
  const ids = { barberId: "b 1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" };
  expect(stepHref("barber", ids)).toBe("/book/barber?shopId=s1");
  expect(stepHref("service", ids)).toBe("/book/service?shopId=s1&barberId=b%201");
  expect(stepHref("date", ids)).toBe("/book/date?shopId=s1&barberId=b%201&barberServiceId=bs1");
  expect(stepHref("time", ids)).toBe("/book/time?shopId=s1&barberId=b%201&barberServiceId=bs1&localDate=2026-11-02");
});

it("returns null when a needed choice is missing or the step has no screen", () => {
  expect(stepHref("service", { shopId: "s1" })).toBeNull();
  expect(stepHref("date", { barberId: "b1", shopId: "s1" })).toBeNull();
  expect(stepHref("review", { barberId: "b1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" })).toBeNull();
  expect(stepHref("confirm", { shopId: "s1" })).toBeNull();
});
```
- [ ] **Step 2:** `npx jest tests/unit/booking-steps.test.ts` → FAIL.
- [ ] **Step 3: implement** `steps.ts`

```ts
export const BOOKING_STEPS = ["barber", "service", "date", "time", "review", "confirm"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

type Ids = { shopId: string; barberId?: string; barberServiceId?: string; localDate?: string };

export const stepNumber = (step: BookingStep) => BOOKING_STEPS.indexOf(step) + 1;

export function stepHref(step: BookingStep, ids: Ids) {
  const e = encodeURIComponent;
  const shop = `shopId=${e(ids.shopId)}`;

  if (step === "barber") return `/book/barber?${shop}`;
  if (!ids.barberId) return null;
  const barber = `${shop}&barberId=${e(ids.barberId)}`;
  if (step === "service") return `/book/service?${barber}`;
  if (!ids.barberServiceId) return null;
  const service = `${barber}&barberServiceId=${e(ids.barberServiceId)}`;
  if (step === "date") return `/book/date?${service}`;
  if (step === "time" && ids.localDate) return `/book/time?${service}&localDate=${e(ids.localDate)}`;

  return null;
}
```
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: component** `StepIndicator.tsx`

```tsx
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { BOOKING_STEPS, stepHref, stepNumber } from "../../features/booking/steps";
import type { BookingStep } from "../../features/booking/steps";

type Ids = Parameters<typeof stepHref>[1];

export function StepIndicator({ current, ids }: { current: BookingStep; ids: Ids }) {
  const { t } = useTranslation();
  const router = useRouter();
  const position = stepNumber(current);

  return (
    <View className="w-full max-w-[420px] gap-2" testID="step-indicator">
      <View className="flex-row gap-1.5">
        {BOOKING_STEPS.map((step, index) => {
          const number = index + 1;
          const color = number < position ? "bg-primary-400" : number === position ? "bg-primary-600" : "bg-neutral-200";
          const href = number < position ? stepHref(step, ids) : null;

          return (
            <Pressable
              accessibilityLabel={t(`book.steps.${step}`)}
              accessibilityRole={href ? "button" : "text"}
              className="flex-1 justify-center py-2"
              disabled={!href}
              key={step}
              onPress={() => href && router.navigate(href as never)}
              testID={`step-${step}`}
            >
              <View className={`h-1.5 rounded-full ${color}`} />
            </Pressable>
          );
        })}
      </View>
      <Text className="text-sm font-sans-medium text-neutral-600" style={{ fontVariant: ["tabular-nums"] }} testID="step-label">
        {t("book.stepOf", { current: position, name: t(`book.steps.${current}`), total: BOOKING_STEPS.length })}
      </Text>
    </View>
  );
}
```
Export from `src/components/domain/index.ts`.
- [ ] **Step 6: locales** (`book.steps.*`, `book.stepOf`): pt `Barbeiro / Serviço / Data / Horário / Revisão / Confirmar`, `"Passo {{current}} de {{total}} · {{name}}"`; en `Barber / Service / Date / Time / Review / Confirm`, `"Step {{current}} of {{total}} · {{name}}"`; es `Barbero / Servicio / Fecha / Hora / Revisión / Confirmar`, `"Paso {{current}} de {{total}} · {{name}}"`.
- [ ] **Step 7: place it** directly under the page title block of each screen, passing the params that screen already reads: `barber.tsx` → `<StepIndicator current="barber" ids={{ shopId }} />`; `service.tsx` → `current="service"`, ids `{ barberId, shopId }`; `date.tsx` → `current="date"`, ids `{ barberId, barberServiceId, shopId }`; `time.tsx` → `current="time"`, ids `{ barberId, barberServiceId, localDate, shopId }`; `review.tsx` → `current="review"`, same ids as time. Also give `service.tsx` and `date.tsx` the same `ScreenHeader` with back button that `time`/`review` use (`useBack("/book")`), so every step after the first can go back; `barber.tsx` is the tab root and keeps its plain title. "Book again" (`/book/date?…` straight from the Agenda) starts at step 3: steps 1-2 render as done but are not tappable there only if their ids are missing — `stepHref` handles it by returning `null` (e.g. no `barberId` in the URL), so nothing breaks.
- [ ] **Step 8 (e2e, add to `booking.web.spec.ts`):** on the time screen `step-label` has text "Step 4 of 6 · Time" and `step-date` is enabled; clicking `step-date` shows the calendar again (`month-calendar-title`); on checkout `step-label` is "Step 5 of 6 · Review"; on the barber screen `step-barber` is disabled. Check at 320px width that the 6 segments and the label fit without wrapping (screenshot).
- [ ] **Step 9:** `npm run typecheck && npm run lint && npx jest`; browser check at 375px (computed height of the segments 6px, colours match tokens); commit `feat: booking step indicator`.

---

### Task 4: E2E update

**Files:** Modify `tests/e2e/booking.web.spec.ts` (+ any spec that walks the flow: `rg "Continue to review|booking-review-scroll" tests`)

- [ ] **Step 1 (failing first):** change `walkToReview` to the new steps:

```ts
await page.getByRole("button", { name: "Continue" }).click();          // date → time
await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();
await page.getByRole("button", { name: "09:00" }).click();
await page.getByTestId("book-time-continue").click();                   // time → checkout
await expect(page.getByTestId("booking-review-scroll")).toBeVisible();
await expect(page.getByTestId("booking-summary")).toContainText("09:00");
await page.getByRole("button", { name: "Confirm booking" }).click();
```
and apply the same walk to the second test ("new booking appears on Home"). Run `npm run test:e2e:web -- booking.web.spec.ts` (move `.env.local` aside first, per memory) → FAIL before Tasks 2-3 are in place, PASS after.
- [ ] **Step 2:** add a test: `time.web` — the continue button is disabled until a slot is picked; navigating back from checkout returns to the time step (not the date or Home).
- [ ] **Step 3:** run the whole web e2e suite for booking/customer specs; commit `test(e2e): booking wizard with checkout step`.

---

### Task 5: "Agenda" title clipped by "Próximos"

**Files:** Modify `app/(customer)/(tabs)/appointments.tsx` (header block near the `appointments.title` Text) and possibly a shared title class.

- [ ] **Step 1 (reproduce):** `npm run web`, sign in as a customer (or Playwright mock as in `customer-helpers.ts`), mobile viewport 375×812 (`resize_window` preset mobile). Screenshot "Agenda" tab. In the console run:

```js
const h = [...document.querySelectorAll('[role="heading"]')].find(e => /agenda/i.test(e.textContent));
const b = [...document.querySelectorAll('[data-testid="agenda-segment-upcoming"]')][0];
({ h: getComputedStyle(h).lineHeight + ' / ' + getComputedStyle(h).fontSize, hRect: h.getBoundingClientRect().toJSON(), bRect: b.getBoundingClientRect().toJSON() })
```
Expected hypothesis: heading `lineHeight` < glyph box (NativeWind `text-3xl` sets 36px for 30px font, but the display font's descender extends past) and the button row's top (`gap-4`) overlaps the descender area, or the heading Text is `numberOfLines`-clipped. Record the actual numbers.
- [ ] **Step 2 (fix):** give the title an explicit roomy line height and bottom padding: `className="w-full max-w-[420px] pb-1 text-3xl leading-[40px] font-display-bold text-ink"`; if the overlap is from the button (`z-index`/negative margin in `Button` `size="sm"`), fix there instead. Re-measure: heading bottom ≤ button top − 8px and screenshot shows the full "g".
- [ ] **Step 3:** apply the same title class everywhere the same pattern exists: `rg 'text-3xl font-display-bold' app | wc -l`; make a tiny shared constant or `ScreenTitle` only if ≥ 5 call sites, else leave the others (they are not reported broken).
- [ ] **Step 4:** screenshot before/after in the PR description; commit `fix: agenda title no longer clipped`.

---

### Task 6: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest && npm run test:db`; `/code-review`; push `feat-booking-checkout`; PR via `gh api` REST noting the new migration (hosted deploy is the user's).
