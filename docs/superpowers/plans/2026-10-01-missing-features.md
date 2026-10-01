# Missing Customer Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add signup password confirmation, retry/pull-to-refresh on list errors, booking review summary, reschedule context, shop info (address/contact/weekly hours with breaks), calendar export + "book again", and push registration.

**Architecture:** Mostly client-side additions to existing Expo Router screens, with small shared pieces (`ErrorRetry`, `useRefresh`, `useBarberServices`, `useShopInfo`, `ShopInfoCard`). Shop info adds one migration (`shops` contact columns + `shop_hours` table + owner-only `set_shop_hours` RPC); a break is a gap between two periods of the same weekday. Pure helpers hold all logic that can be unit-tested.

**Tech Stack:** Expo SDK 57 / React Native 0.86 / expo-router / NativeWind / react-query / zod 4 / i18next (en, pt, es) / Supabase (pgTAP) / jest-expo (tests are `.ts`, use `React.createElement`).

**Spec:** `docs/superpowers/specs/2026-10-01-missing-features-design.md`

## Global Constraints

- Tests: jest files live in `tests/unit/*.test.ts` (no JSX); pgTAP in `supabase/tests/NNN_*.sql`. TDD: failing test first, then code.
- Every user-visible string goes through `t()`; add each key to **all of** `src/i18n/locales/{en,pt,es}.ts` (parity test enforces it; `en.ts` defines the type, `pt`/`es` are `DeepStringRecord<typeof en>`). The no-hardcoded-text test rejects literal JSX text / `label=""`.
- `className` (NativeWind) only on plain RN elements (`View`, `Text`, `Pressable`, `ScrollView`), never on custom components. Owner screens use `StyleSheet`.
- Weekday numbering is ISO 1..7 (1 = Monday), like `working_periods`. Times are `HH:mm` strings client-side.
- No map, no dated shop closures, no change to the availability engine.
- Commit per task on branch `feat-missing-features`; commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Verify commands: `npm test -- <file>`, `npm run typecheck`, `npm run lint`; DB: `npm run test:db`.

---

### Task 1: Signup password confirmation

**Files:**
- Modify: `src/features/auth/validation.ts`, `app/(auth)/signup.tsx`, `tests/unit/signup-validation.test.ts`, `tests/e2e/auth.web.spec.ts`, `tests/e2e/i18n.web.spec.ts`, `src/i18n/locales/{en,pt,es}.ts`

**Interfaces:**
- Produces: `parseSignupInput` input now requires `confirmPassword: string`; error key `auth.validation.passwordMismatch` on field `confirmPassword`. `SignupInput` (the output) is unchanged.

- [ ] **Step 1: Write the failing test** — in `tests/unit/signup-validation.test.ts` add `confirmPassword` equal to `password` to the valid fixture used by existing tests, then add:

```ts
it("rejects a confirmation that differs from the password", () => {
  const result = parseSignupInput({ ...validInput, confirmPassword: "different-1" });

  expect(result).toEqual({ errors: { confirmPassword: "auth.validation.passwordMismatch" }, ok: false });
});

it("does not leak confirmPassword into the parsed value", () => {
  const result = parseSignupInput(validInput);

  expect(result.ok && "confirmPassword" in result.value).toBe(false);
});
```
(Use whatever the file's valid-fixture variable is named; keep the existing ones passing by adding `confirmPassword`.)

- [ ] **Step 2: Run** `npm test -- signup-validation` → new tests FAIL.

- [ ] **Step 3: Implement.** In `validation.ts` add `confirmPassword: z.string(),` to the object and chain a refine:

```ts
const signupSchema = z
  .object({ /* existing fields */ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    error: "auth.validation.passwordMismatch",
    path: ["confirmPassword"],
  });
```
Widen the error-map type to `Partial<Record<keyof SignupInput | "confirmPassword", string>>`. In `signup.tsx` add `confirmPassword: ""` to the form state and, after the password input:

```tsx
<Input error={fieldError("confirmPassword")} label={t("auth.signup.confirmPassword")} onChangeText={set("confirmPassword")} secureTextEntry testID="signup-confirm-password" value={form.confirmPassword} />
```
Locales: `auth.signup.confirmPassword` = "Confirm password" / "Confirmar senha" / "Confirmar contraseña"; `auth.validation.passwordMismatch` = "Passwords do not match." / "As senhas não coincidem." / "Las contraseñas no coinciden."
In the two e2e specs that fill `signup-password`, also fill `signup-confirm-password` with the same value.

- [ ] **Step 4: Run** `npm test -- signup-validation locale-parity`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(auth): ask for password confirmation on signup`

---

### Task 2: ErrorRetry + pull-to-refresh on list screens

**Files:**
- Create: `src/components/domain/ErrorRetry.tsx`, `src/lib/use-refresh.ts`, `tests/unit/error-retry.test.ts`, `tests/unit/use-refresh.test.ts`
- Modify: `src/components/domain/index.ts`, `app/(customer)/(tabs)/home.tsx`, `app/(customer)/(tabs)/appointments.tsx`, `app/(customer)/(tabs)/book/barber.tsx`, `tests/unit/component-exports.test.ts` (if it enumerates exports)

**Interfaces:**
- Produces: `ErrorRetry({ message: string; onRetry: () => void; testID?: string })`; `useRefresh(refetchers: Array<() => Promise<unknown>>): { onRefresh: () => Promise<void>; refreshing: boolean }`.

- [ ] **Step 1: Failing tests.**

```ts
// tests/unit/error-retry.test.ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { ErrorRetry } from "../../src/components/domain/ErrorRetry";
import i18n from "../../src/i18n";

describe("ErrorRetry", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows the message and calls onRetry from the retry button", async () => {
    const onRetry = jest.fn();
    const view = await render(React.createElement(ErrorRetry, { message: "Boom", onRetry }));

    expect(view.getByText("Boom")).toBeTruthy();
    await fireEvent.press(view.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```
```ts
// tests/unit/use-refresh.test.ts
import { act, renderHook } from "@testing-library/react-native";

import { useRefresh } from "../../src/lib/use-refresh";

describe("useRefresh", () => {
  it("runs every refetcher and toggles refreshing, even if one rejects", async () => {
    const ok = jest.fn().mockResolvedValue(1);
    const bad = jest.fn().mockRejectedValue(new Error("x"));
    const { result } = await renderHook(() => useRefresh([ok, bad]));

    await act(async () => { await result.current.onRefresh(); });

    expect(ok).toHaveBeenCalled();
    expect(bad).toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });
});
```
(If `common.tryAgain` copy in en differs from "Try again", match the en locale.)

- [ ] **Step 2: Run** `npm test -- error-retry use-refresh` → FAIL (modules missing).

- [ ] **Step 3: Implement.**

```tsx
// src/components/domain/ErrorRetry.tsx
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../ui/Button";

export type ErrorRetryProps = { message: string; onRetry: () => void; testID?: string };

export function ErrorRetry({ message, onRetry, testID }: ErrorRetryProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-2" testID={testID}>
      <Text className="text-sm font-sans text-danger-500">{message}</Text>
      <Button label={t("common.tryAgain")} onPress={onRetry} size="sm" variant="outline" />
    </View>
  );
}
```
```ts
// src/lib/use-refresh.ts
import { useState } from "react";

export function useRefresh(refetchers: Array<() => Promise<unknown>>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled(refetchers.map((refetch) => refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  return { onRefresh, refreshing };
}
```
Export `ErrorRetry` from `domain/index.ts`. Screens:
- `home.tsx`: `const refresh = useRefresh([upcoming.refetch, customers.refetch]);` add to ScrollView `refreshControl={<RefreshControl onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} />}` (import `RefreshControl` from `react-native`); replace the error `<Text>` with `<ErrorRetry message={t("home.loadError")} onRetry={() => void upcoming.refetch()} testID="home-retry" />`.
- `appointments.tsx`: `useRefresh([upcoming.refetch, history.refetch])`; replace `{failed ? <Text…>}` with `<ErrorRetry message={t("appointments.loadError")} onRetry={() => void (segment === "upcoming" ? upcoming : history).refetch()} testID="agenda-retry" />`.
- `book/barber.tsx`: change the root `<View className="flex-1 items-center …">` into a `ScrollView` with `contentContainerClassName` unnecessary — keep the inner `View` classes, wrap with `<ScrollView className="flex-1" refreshControl={…}>`, `useRefresh([barbers.refetch])`; replace the error text with `<ErrorRetry message={t("book.barbersError")} onRetry={() => void barbers.refetch()} testID="barbers-retry" />`.

- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(ui): retry button and pull-to-refresh on list errors`

---

### Task 3: Booking review summary

**Files:**
- Create: `src/features/services/use-barber-services.ts`, `src/components/domain/BookingSummary.tsx`, `tests/unit/booking-summary.test.ts`
- Modify: `app/(customer)/(tabs)/book/service.tsx` (use the hook), `app/(customer)/(tabs)/book/review.tsx`, `src/components/domain/index.ts`, locales

**Interfaces:**
- Produces: `useBarberServices(barberId: string)` → react-query result whose `data` is `BarberServiceOption[]` = `{ barberServiceId: string; durationMinutes: number; name: string | null; priceCents: number }[]` (queryKey `["public-barber-services", barberId]`); `BookingSummary({ barberName: string; dateLabel: string; durationMinutes: number; priceCents: number; serviceName: string })`.

- [ ] **Step 1: Failing test**

```ts
// tests/unit/booking-summary.test.ts
import { render } from "@testing-library/react-native";
import React from "react";

import { BookingSummary } from "../../src/components/domain/BookingSummary";
import i18n from "../../src/i18n";

describe("BookingSummary", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows barber, service, duration, price and date", async () => {
    const view = await render(
      React.createElement(BookingSummary, {
        barberName: "João", dateLabel: "17/08/2026", durationMinutes: 45, priceCents: 5500, serviceName: "Corte",
      }),
    );

    for (const text of ["João", "Corte", "45 min", "R$ 55,00", "17/08/2026"]) {
      expect(view.getByText(text)).toBeTruthy();
    }
  });
});
```
- [ ] **Step 2: Run** `npm test -- booking-summary` → FAIL.
- [ ] **Step 3: Implement.** Hook (moved verbatim from `service.tsx`, mapped through `resolveEffectiveServiceFields`):

```ts
// src/features/services/use-barber-services.ts
import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { resolveEffectiveServiceFields } from "./resolve-effective-fields";

type Row = {
  duration_override_minutes: number | null;
  id: string;
  price_override_cents: number | null;
  services: { duration_minutes: number; name: string; price_cents: number } | null;
};

export type BarberServiceOption = { barberServiceId: string; durationMinutes: number; name: string | null; priceCents: number };

export function useBarberServices(barberId: string) {
  const { supabase } = useSupabaseSession();

  return useQuery({
    enabled: Boolean(barberId),
    queryFn: async (): Promise<BarberServiceOption[]> => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("id, duration_override_minutes, price_override_cents, services(name, duration_minutes, price_cents)")
        .eq("barber_id", barberId)
        .order("id");
      if (error) throw error;

      return ((data ?? []) as unknown as Row[]).map((row) => ({
        ...resolveEffectiveServiceFields({
          durationMinutes: row.services?.duration_minutes ?? 0,
          durationOverrideMinutes: row.duration_override_minutes,
          priceCents: row.services?.price_cents ?? 0,
          priceOverrideCents: row.price_override_cents,
        }),
        barberServiceId: row.id,
        name: row.services?.name ?? null,
      }));
    },
    queryKey: ["public-barber-services", barberId],
  });
}
```
Update `service.tsx`: delete the local `BarberServiceRow` type and inline query; `const services = useBarberServices(barberId);` and map `service.barberServiceId`, `service.name ?? t("book.fallbackService")`, `service.durationMinutes`, `service.priceCents` (drop the `resolveEffectiveServiceFields` import there).

`BookingSummary` (uses `formatPriceBRL` from `ServiceCard`):

```tsx
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "./ServiceCard";

export type BookingSummaryProps = { barberName: string; dateLabel: string; durationMinutes: number; priceCents: number; serviceName: string };

export function BookingSummary({ barberName, dateLabel, durationMinutes, priceCents, serviceName }: BookingSummaryProps) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [t("book.summary.barber"), barberName],
    [t("book.summary.service"), serviceName],
    [t("book.summary.duration"), `${durationMinutes} min`],
    [t("book.summary.price"), formatPriceBRL(priceCents)],
    [t("book.summary.date"), dateLabel],
  ];

  return (
    <View className="gap-2 rounded-[20px] bg-neutral-50 p-4" testID="booking-summary">
      {rows.map(([label, value]) => (
        <View className="flex-row justify-between" key={label}>
          <Text className="text-sm font-sans text-neutral-600">{label}</Text>
          <Text className="text-sm font-sans-semibold text-ink">{value}</Text>
        </View>
      ))}
    </View>
  );
}
```
`review.tsx`: read `shopId = param(params.shopId)`; add `const barbers = useQuery({ enabled: Boolean(shopId), queryFn: () => listPublicBarbers(supabase, shopId), queryKey: ["public-barbers", shopId] }); const services = useBarberServices(barberId);` and `const option = services.data?.find((s) => s.barberServiceId === barberServiceId); const barber = barbers.data?.find((b) => b.id === barberId);`. Replace the lone date `<Text>` with:

```tsx
{option && barber && localDate ? (
  <BookingSummary
    barberName={barber.name}
    dateLabel={formatDateNumeric(localDate, language)}
    durationMinutes={option.durationMinutes}
    priceCents={option.priceCents}
    serviceName={option.name ?? t("book.fallbackService")}
  />
) : null}
```
(Keep the date text as a fallback only when the summary can't render: `{!(option && barber) && localDate ? <Text …>{formatDateNumeric(...)}</Text> : null}`.)
Locales: `book.summary.{barber,service,duration,price,date}` = Barber/Service/Duration/Price/Date · Barbeiro/Serviço/Duração/Preço/Data · Barbero/Servicio/Duración/Precio/Fecha.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(booking): show barber, service, duration and price on the review screen`

---

### Task 4: Reschedule shows the appointment being moved

**Files:**
- Modify: `app/(customer)/reschedule.tsx`, locales (`reschedule.current`)
- Test: `tests/unit/reschedule-current.test.ts`

**Interfaces:** Consumes `listMyAppointments`, `useAppointmentCards`, `AppointmentCard` (existing).

- [ ] **Step 1: Failing test** (source-level, same style as `review-customer-feedback.test.ts`):

```ts
import { readFileSync } from "fs";
import { join } from "path";

const read = (file: string) => readFileSync(join(__dirname, "..", "..", file), "utf8");

describe("reschedule screen", () => {
  const screen = read("app/(customer)/reschedule.tsx");

  it("shows the appointment being moved", () => {
    expect(screen).toContain('t("reschedule.current")');
    expect(screen).toContain("useAppointmentCards");
    expect(screen).toContain('testID="reschedule-current"');
  });

  it.each(["en", "pt", "es"])("%s locale has reschedule.current", (locale) => {
    expect(read(`src/i18n/locales/${locale}.ts`)).toMatch(/current:/);
  });
});
```
- [ ] **Step 2: Run** `npm test -- reschedule-current` → FAIL.
- [ ] **Step 3: Implement** in `reschedule.tsx`: imports `AppointmentCard`, `listMyAppointments`, `useAppointmentCards`. Inside the component:

```tsx
const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
const current = upcoming.data?.find((appointment) => appointment.id === appointmentId);
const toCardProps = useAppointmentCards(current ? [current] : []);
```
and under the title:

```tsx
{current ? (
  <View className="w-full max-w-[420px] gap-2">
    <Text className="text-sm font-sans-medium text-neutral-600">{t("reschedule.current")}</Text>
    <AppointmentCard {...toCardProps(current)} testID="reschedule-current" />
  </View>
) : null}
```
Locales `reschedule.current`: "Current appointment" / "Agendamento atual" / "Cita actual".
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(reschedule): show the appointment being moved`

---

### Task 5: Shop info — database

**Files:**
- Create: `supabase/migrations/0030_shop_info.sql`, `supabase/tests/016_shop_info.sql`
- Modify: `src/lib/errors/domain-errors.ts`, locales (`errors.codes.SHOP_HOURS_INVALID`), `tests/unit/error-message.test.ts` only if it enumerates codes

**Interfaces:**
- Produces (DB): `shops.address|phone|whatsapp` (text, nullable, ≤200/30/30 chars); table `shop_hours(id, shop_id, weekday, start_time, end_time)` publicly selectable; `public.set_shop_hours(p_periods jsonb)` where each element is `{"weekday":1..7,"start":"HH:mm","end":"HH:mm"}`; errors: `42501` FORBIDDEN (non-owner), `P0023` SHOP_HOURS_INVALID.
- Produces (TS): `DomainErrorCode` gains `"SHOP_HOURS_INVALID"`, mapped from `P0023`.

- [ ] **Step 1: Failing pgTAP test** `supabase/tests/016_shop_info.sql` (copy the setup style of `015_profile_nickname.sql`: `begin; create extension…; select plan(N);` insert one owner user + shop + one customer user, then):

```sql
-- owner writes hours with a lunch break
set local role authenticated;
select set_config('request.jwt.claim.sub', '<owner uuid>', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$ select public.set_shop_hours('[{"weekday":1,"start":"09:00","end":"12:00"},{"weekday":1,"start":"13:00","end":"18:00"}]'::jsonb) $$, 'owner can set hours with a break');
select is((select count(*)::int from public.shop_hours), 2, 'both periods stored');
select throws_ok($$ select public.set_shop_hours('[{"weekday":2,"start":"09:00","end":"12:00"},{"weekday":2,"start":"11:00","end":"13:00"}]'::jsonb) $$, 'P0023', null, 'overlapping periods rejected');
select is((select count(*)::int from public.shop_hours), 2, 'a rejected call leaves the previous hours untouched');
select throws_ok($$ select public.set_shop_hours('[{"weekday":9,"start":"09:00","end":"12:00"}]'::jsonb) $$, 'P0023', null, 'weekday outside 1..7 rejected');
select throws_ok($$ select public.set_shop_hours('[{"weekday":1,"start":"18:00","end":"09:00"}]'::jsonb) $$, 'P0023', null, 'end before start rejected');
select lives_ok($$ update public.shops set address = 'Rua A, 10', phone = '(11) 3000-0000', whatsapp = '(11) 99999-0000' where id = '<shop uuid>' $$, 'owner updates contact info');

-- customer: reads, cannot write
select set_config('request.jwt.claim.sub', '<customer uuid>', true);
select is((select count(*)::int from public.shop_hours), 2, 'customer can read hours');
select is((select address from public.shops where id = '<shop uuid>'), 'Rua A, 10', 'customer can read the address');
select throws_ok($$ select public.set_shop_hours('[]'::jsonb) $$, '42501', null, 'non-owner cannot set hours');

-- anonymous can read too
reset role; set local role anon;
select is((select count(*)::int from public.shop_hours), 2, 'anon can read hours');
```
Set `plan(N)` to the real count (11) and use real UUIDs (`92000000-…` pattern). The rejected-call atomicity relies on the failed function call rolling back its own statement; wrap each `throws_ok` call in its own subtransaction automatically.
- [ ] **Step 2: Run** `npm run test:db` (needs `npx supabase start` already running per the running-barberschedule-locally skill) → FAIL (function/table missing).
- [ ] **Step 3: Implement** `0030_shop_info.sql`:

```sql
alter table public.shops
  add column address text,
  add column phone text,
  add column whatsapp text,
  add constraint shops_address_len check (address is null or char_length(address) <= 200),
  add constraint shops_phone_len check (phone is null or char_length(phone) <= 30),
  add constraint shops_whatsapp_len check (whatsapp is null or char_length(whatsapp) <= 30);

grant select (address, phone, whatsapp) on table public.shops to anon, authenticated;
grant update (address, phone, whatsapp) on table public.shops to authenticated;

create table public.shop_hours (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  constraint shop_hours_weekday_valid check (weekday between 1 and 7),
  constraint shop_hours_valid_interval check (start_time < end_time),
  constraint shop_hours_no_overlap exclude using gist (
    shop_id with =,
    weekday with =,
    tsrange(timestamp '2000-01-03' + start_time, timestamp '2000-01-03' + end_time, '[)') with &&
  )
);

revoke all on table public.shop_hours from anon, authenticated;
grant select on table public.shop_hours to anon, authenticated;
alter table public.shop_hours enable row level security;
create policy "shop_hours_select_public" on public.shop_hours for select to anon, authenticated using (true);

create function public.set_shop_hours(p_periods jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  target_shop uuid;
  item jsonb;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select id into target_shop from public.shops where owner_user_id = actor;
  if target_shop is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if jsonb_typeof(coalesce(p_periods, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0023', message = 'SHOP_HOURS_INVALID';
  end if;

  delete from public.shop_hours where shop_id = target_shop;
  for item in select * from jsonb_array_elements(p_periods) loop
    begin
      insert into public.shop_hours (shop_id, weekday, start_time, end_time)
      values (target_shop, (item ->> 'weekday')::smallint, (item ->> 'start')::time, (item ->> 'end')::time);
    exception when check_violation or exclusion_violation or not_null_violation
      or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = 'P0023', message = 'SHOP_HOURS_INVALID';
    end;
  end loop;
end;
$$;

revoke all on function public.set_shop_hours(jsonb) from public, anon;
grant execute on function public.set_shop_hours(jsonb) to authenticated;
```
TS: in `domain-errors.ts` add `| "SHOP_HOURS_INVALID"` and `case "P0023": return new DomainError("SHOP_HOURS_INVALID", "Check the opening hours and breaks.");`. Locales `errors.codes.SHOP_HOURS_INVALID`: "Check the opening hours and breaks." / "Confira os horários e as pausas." / "Revisa los horarios y las pausas."
- [ ] **Step 4: Run** `npm run test:db` and `npm test -- error-message locale-parity` → PASS.
- [ ] **Step 5: Commit** `feat(shop): add contact columns and shop_hours with owner-only set_shop_hours`

---

### Task 6: Shop info — pure helpers and API

**Files:**
- Create: `src/features/shops/hours.ts`, `src/features/shops/contact.ts`, `tests/unit/shop-hours.test.ts`, `tests/unit/shop-contact.test.ts`
- Modify: `src/features/shops/api.ts`

**Interfaces:**
- Produces (`hours.ts`):
  - `type Period = { end: string; start: string }`; `type ShopPeriod = Period & { weekday: number }`
  - `type DayDraft = { breaks: Period[]; enabled: boolean; end: string; start: string }`
  - `draftToPeriods(day: DayDraft): { ok: true; periods: Period[] } | { error: "time" | "range" | "break"; ok: false }`
  - `periodsToDraft(periods: Period[]): DayDraft` (closed day → `{ enabled: false, start: "09:00", end: "18:00", breaks: [] }`)
  - `groupWeek(rows: ShopPeriod[]): Array<{ from: number; periods: Period[]; to: number }>` (open weekdays only, consecutive days with identical periods merged)
  - `formatPeriods(periods: Period[]): string` → `"09:00–12:00 · 13:00–18:00"`
  - `weekdayLabel(weekday: number, language: Language): string`
- Produces (`contact.ts`): `telUrl(phone: string): string | null`, `whatsappUrl(number: string): string | null`.
- Produces (`api.ts`): `PublicShop = { address: string | null; id: string; name: string; phone: string | null; whatsapp: string | null }`; `listShopHours(supabase, shopId): Promise<ShopPeriod[]>`; `saveShopHours(supabase, periods: ShopPeriod[]): Promise<void>`; `updateShopContact(supabase, shopId, input: { address: string; phone: string; whatsapp: string }): Promise<void>`.

- [ ] **Step 1: Failing tests.**

```ts
// tests/unit/shop-hours.test.ts
import { draftToPeriods, formatPeriods, groupWeek, periodsToDraft } from "../../src/features/shops/hours";

const day = { breaks: [], enabled: true, end: "18:00", start: "09:00" };

describe("draftToPeriods", () => {
  it("returns no periods for a closed day", () => {
    expect(draftToPeriods({ ...day, enabled: false })).toEqual({ ok: true, periods: [] });
  });

  it("returns one period without breaks", () => {
    expect(draftToPeriods(day)).toEqual({ ok: true, periods: [{ end: "18:00", start: "09:00" }] });
  });

  it("splits the day around lunch and other breaks, in order", () => {
    const result = draftToPeriods({ ...day, breaks: [{ end: "16:30", start: "16:00" }, { end: "13:00", start: "12:00" }] });

    expect(result).toEqual({
      ok: true,
      periods: [
        { end: "12:00", start: "09:00" },
        { end: "16:00", start: "13:00" },
        { end: "18:00", start: "16:30" },
      ],
    });
  });

  it.each([
    ["bad time", { ...day, start: "9h" }, "time"],
    ["end before start", { ...day, end: "08:00" }, "range"],
    ["break outside the day", { ...day, breaks: [{ end: "19:00", start: "17:00" }] }, "break"],
    ["break touching the opening", { ...day, breaks: [{ end: "10:00", start: "09:00" }] }, "break"],
    ["break with end before start", { ...day, breaks: [{ end: "12:00", start: "13:00" }] }, "break"],
    ["overlapping breaks", { ...day, breaks: [{ end: "13:00", start: "12:00" }, { end: "14:00", start: "12:30" }] }, "break"],
  ])("rejects %s", (_name, draft, error) => {
    expect(draftToPeriods(draft)).toEqual({ error, ok: false });
  });
});

describe("periodsToDraft", () => {
  it("round-trips breaks as gaps", () => {
    const draft = periodsToDraft([{ end: "12:00", start: "09:00" }, { end: "18:00", start: "13:00" }]);

    expect(draft).toEqual({ breaks: [{ end: "13:00", start: "12:00" }], enabled: true, end: "18:00", start: "09:00" });
  });

  it("defaults a day without periods to closed", () => {
    expect(periodsToDraft([])).toEqual({ breaks: [], enabled: false, end: "18:00", start: "09:00" });
  });
});

describe("groupWeek / formatPeriods", () => {
  const rows = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { end: "12:00", start: "09:00", weekday },
    { end: "18:00", start: "13:00", weekday },
  ]).concat([{ end: "13:00", start: "09:00", weekday: 6 }]);

  it("merges consecutive identical days and skips closed ones", () => {
    expect(groupWeek(rows)).toEqual([
      { from: 1, periods: [{ end: "12:00", start: "09:00" }, { end: "18:00", start: "13:00" }], to: 5 },
      { from: 6, periods: [{ end: "13:00", start: "09:00" }], to: 6 },
    ]);
  });

  it("formats periods with a separator", () => {
    expect(formatPeriods([{ end: "12:00", start: "09:00" }, { end: "18:00", start: "13:00" }])).toBe("09:00–12:00 · 13:00–18:00");
  });
});
```
```ts
// tests/unit/shop-contact.test.ts
import { telUrl, whatsappUrl } from "../../src/features/shops/contact";

describe("contact links", () => {
  it("builds a tel: link keeping a leading +", () => {
    expect(telUrl("(11) 3000-0000")).toBe("tel:1130000000");
    expect(telUrl("+55 11 3000-0000")).toBe("tel:+551130000000");
    expect(telUrl("  ")).toBeNull();
  });

  it("builds a wa.me link, adding Brazil's 55 to national numbers", () => {
    expect(whatsappUrl("(11) 99999-0000")).toBe("https://wa.me/5511999990000");
    expect(whatsappUrl("+55 11 99999-0000")).toBe("https://wa.me/5511999990000");
    expect(whatsappUrl("")).toBeNull();
  });
});
```
- [ ] **Step 2: Run** `npm test -- shop-hours shop-contact` → FAIL.
- [ ] **Step 3: Implement.**

```ts
// src/features/shops/contact.ts
const digits = (value: string) => value.replace(/\D/g, "");

export function telUrl(phone: string) {
  const number = digits(phone);

  return number ? `tel:${phone.trim().startsWith("+") ? "+" : ""}${number}` : null;
}

export function whatsappUrl(value: string) {
  const number = digits(value);
  if (!number) return null;

  // National Brazilian numbers (DDD + 8/9 digits) get the country code.
  return `https://wa.me/${number.length <= 11 ? `55${number}` : number}`;
}
```
```ts
// src/features/shops/hours.ts
import type { Language } from "../../i18n/language";
import { formatWeekdayShort } from "../../lib/i18n/format";

export type Period = { end: string; start: string };
export type ShopPeriod = Period & { weekday: number };
export type DayDraft = { breaks: Period[]; enabled: boolean; end: string; start: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function draftToPeriods(day: DayDraft):
  | { ok: true; periods: Period[] }
  | { error: "break" | "range" | "time"; ok: false } {
  if (!day.enabled) return { ok: true, periods: [] };
  const times = [day.start, day.end, ...day.breaks.flatMap((pause) => [pause.start, pause.end])];
  if (!times.every((value) => TIME.test(value))) return { error: "time", ok: false };
  if (day.start >= day.end) return { error: "range", ok: false };

  const periods: Period[] = [];
  let cursor = day.start;
  for (const pause of [...day.breaks].sort((a, b) => a.start.localeCompare(b.start))) {
    if (pause.start >= pause.end || pause.start <= cursor || pause.end >= day.end) return { error: "break", ok: false };
    periods.push({ end: pause.start, start: cursor });
    cursor = pause.end;
  }
  periods.push({ end: day.end, start: cursor });

  return { ok: true, periods };
}

export function periodsToDraft(periods: Period[]): DayDraft {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.length === 0) return { breaks: [], enabled: false, end: "18:00", start: "09:00" };

  return {
    breaks: sorted.slice(1).map((period, index) => ({ end: period.start, start: sorted[index].end })),
    enabled: true,
    end: sorted[sorted.length - 1].end,
    start: sorted[0].start,
  };
}

export function formatPeriods(periods: Period[]) {
  return periods.map((period) => `${period.start}–${period.end}`).join(" · ");
}

export function groupWeek(rows: ShopPeriod[]) {
  const groups: Array<{ from: number; periods: Period[]; to: number }> = [];
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const periods = rows
      .filter((row) => row.weekday === weekday)
      .map(({ end, start }) => ({ end, start }))
      .sort((a, b) => a.start.localeCompare(b.start));
    if (periods.length === 0) continue;
    const last = groups[groups.length - 1];
    if (last && last.to === weekday - 1 && formatPeriods(last.periods) === formatPeriods(periods)) {
      last.to = weekday;
    } else {
      groups.push({ from: weekday, periods, to: weekday });
    }
  }

  return groups;
}

// 2026-01-05 is a Monday, so weekday 1..7 maps to the 5th..11th.
export function weekdayLabel(weekday: number, language: Language) {
  return formatWeekdayShort(`2026-01-${String(4 + weekday).padStart(2, "0")}`, language);
}
```
`api.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";
import type { ShopPeriod } from "./hours";

export type PublicShop = { address: string | null; id: string; name: string; phone: string | null; whatsapp: string | null };

export async function listPublicShops(supabase: Pick<SupabaseClient, "from">) {
  const { data, error } = await supabase.from("shops").select("id, name, address, phone, whatsapp").order("name");
  if (error) throw error;

  return (data ?? []) as PublicShop[];
}

export async function listShopHours(supabase: Pick<SupabaseClient, "from">, shopId: string): Promise<ShopPeriod[]> {
  const { data, error } = await supabase
    .from("shop_hours")
    .select("weekday, start_time, end_time")
    .eq("shop_id", shopId)
    .order("weekday")
    .order("start_time");
  if (error) throw toDomainError(error);

  return (data ?? []).map((row) => ({
    end: String(row.end_time).slice(0, 5),
    start: String(row.start_time).slice(0, 5),
    weekday: Number(row.weekday),
  }));
}

export async function saveShopHours(supabase: Pick<SupabaseClient, "rpc">, periods: ShopPeriod[]) {
  const { error } = await supabase.rpc("set_shop_hours", { p_periods: periods });
  if (error) throw toDomainError(error);
}

export async function updateShopContact(
  supabase: Pick<SupabaseClient, "from">,
  shopId: string,
  input: { address: string; phone: string; whatsapp: string },
) {
  const clean = (value: string) => value.trim() || null;
  const { error } = await supabase
    .from("shops")
    .update({ address: clean(input.address), phone: clean(input.phone), whatsapp: clean(input.whatsapp) })
    .eq("id", shopId);
  if (error) throw toDomainError(error);
}
```
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` → PASS (fix any test that built a `PublicShop` without the new fields).
- [ ] **Step 5: Commit** `feat(shop): hours/contact helpers and API`

---

### Task 7: Shop info — owner editor

**Files:**
- Create: `app/(owner)/shop.tsx`, `tests/unit/owner-shop-screen.test.ts`
- Modify: `app/(owner)/settings.tsx` (link), locales (`owner.shop.*`, `owner.settings.shopLink`)

**Interfaces:** Consumes `listPublicShops`, `listShopHours`, `saveShopHours`, `updateShopContact`, `draftToPeriods`, `periodsToDraft`, `weekdayLabel`, `DayDraft` (Task 6).
Locale keys produced: `owner.shop.{title,address,phone,whatsapp,open,closed,addBreak,removeBreak,breakStart,breakEnd,save,saved,saveError}`, `owner.shop.errors.{time,range,break}`, `owner.settings.shopLink`.

- [ ] **Step 1: Failing test** (source-level + locale keys, same style as Task 4):

```ts
import { readFileSync } from "fs";
import { join } from "path";

const read = (file: string) => readFileSync(join(__dirname, "..", "..", file), "utf8");

describe("owner shop screen", () => {
  const screen = read("app/(owner)/shop.tsx");

  it("edits contact info, weekly hours and breaks and saves both", () => {
    for (const needle of ["draftToPeriods", "saveShopHours", "updateShopContact", 't("owner.shop.addBreak")', 't("owner.shop.save")']) {
      expect(screen).toContain(needle);
    }
  });

  it("is reachable from settings", () => {
    expect(read("app/(owner)/settings.tsx")).toContain('"/shop"');
  });
});
```
- [ ] **Step 2: Run** `npm test -- owner-shop-screen` → FAIL.
- [ ] **Step 3: Implement** `app/(owner)/shop.tsx` (plain RN + `StyleSheet`, like `settings.tsx`; text inputs `HH:mm`):

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Screen } from "../../src/components/ui/Screen";
import { draftToPeriods, periodsToDraft, weekdayLabel } from "../../src/features/shops/hours";
import type { DayDraft, ShopPeriod } from "../../src/features/shops/hours";
import { listPublicShops, listShopHours, saveShopHours, updateShopContact } from "../../src/features/shops/api";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export default function OwnerShopScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shop = shops.data?.[0];
  const hours = useQuery({
    enabled: Boolean(shop),
    queryFn: () => listShopHours(supabase, shop!.id),
    queryKey: ["shop-hours", shop?.id],
  });
  const [contact, setContact] = useState({ address: "", phone: "", whatsapp: "" });
  const [days, setDays] = useState<Record<number, DayDraft>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!shop) return;
    setContact({ address: shop.address ?? "", phone: shop.phone ?? "", whatsapp: shop.whatsapp ?? "" });
  }, [shop]);
  useEffect(() => {
    if (!hours.data) return;
    setDays(Object.fromEntries(WEEKDAYS.map((day) => [day, periodsToDraft(hours.data.filter((row) => row.weekday === day))])));
  }, [hours.data]);

  const patchDay = (weekday: number, patch: Partial<DayDraft>) =>
    setDays((current) => ({ ...current, [weekday]: { ...current[weekday], ...patch } }));

  const save = async () => {
    const periods: ShopPeriod[] = [];
    for (const weekday of WEEKDAYS) {
      const result = draftToPeriods(days[weekday]);
      if (!result.ok) {
        setFeedback(`${weekdayLabel(weekday, language)}: ${t(`owner.shop.errors.${result.error}`)}`);
        return;
      }
      periods.push(...result.periods.map((period) => ({ ...period, weekday })));
    }
    try {
      await saveShopHours(supabase, periods);
      if (shop) await updateShopContact(supabase, shop.id, contact);
      await queryClient.invalidateQueries({ queryKey: ["public-shops"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-hours"] });
      setFeedback(t("owner.shop.saved"));
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("owner.shop.saveError")));
    }
  };

  const field = (key: keyof typeof contact, label: string) => (
    <View style={styles.field}>
      <Text>{label}</Text>
      <TextInput accessibilityLabel={label} onChangeText={(value) => setContact((c) => ({ ...c, [key]: value }))} style={styles.input} value={contact[key]} />
    </View>
  );
  const time = (label: string, value: string, onChange: (value: string) => void) => (
    <TextInput accessibilityLabel={label} onChangeText={onChange} placeholder="HH:mm" style={[styles.input, styles.time]} value={value} />
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{t("owner.shop.title")}</Text>
        {field("address", t("owner.shop.address"))}
        {field("phone", t("owner.shop.phone"))}
        {field("whatsapp", t("owner.shop.whatsapp"))}
        {WEEKDAYS.map((weekday) => {
          const day = days[weekday];
          if (!day) return null;

          return (
            <View key={weekday} style={styles.day} testID={`shop-day-${weekday}`}>
              <View style={styles.row}>
                <Text style={styles.dayName}>{weekdayLabel(weekday, language)}</Text>
                <Switch accessibilityLabel={`${weekdayLabel(weekday, language)} ${t("owner.shop.open")}`} onValueChange={(enabled) => patchDay(weekday, { enabled })} value={day.enabled} />
                {!day.enabled ? <Text>{t("owner.shop.closed")}</Text> : null}
              </View>
              {day.enabled ? (
                <>
                  <View style={styles.row}>
                    {time(t("common.startTime"), day.start, (start) => patchDay(weekday, { start }))}
                    {time(t("common.endTime"), day.end, (end) => patchDay(weekday, { end }))}
                  </View>
                  {day.breaks.map((pause, index) => (
                    <View key={index} style={styles.row}>
                      {time(t("owner.shop.breakStart"), pause.start, (start) => patchDay(weekday, { breaks: day.breaks.map((b, i) => (i === index ? { ...b, start } : b)) }))}
                      {time(t("owner.shop.breakEnd"), pause.end, (end) => patchDay(weekday, { breaks: day.breaks.map((b, i) => (i === index ? { ...b, end } : b)) }))}
                      <Button onPress={() => patchDay(weekday, { breaks: day.breaks.filter((_, i) => i !== index) })} title={t("owner.shop.removeBreak")} />
                    </View>
                  ))}
                  <Button onPress={() => patchDay(weekday, { breaks: [...day.breaks, { end: "13:00", start: "12:00" }] })} title={t("owner.shop.addBreak")} />
                </>
              ) : null}
            </View>
          );
        })}
        {feedback ? <Text>{feedback}</Text> : null}
        <Button onPress={() => void save()} title={t("owner.shop.save")} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, maxWidth: 520, width: "100%" },
  day: { borderColor: "#e5e7eb", borderRadius: 8, borderWidth: 1, gap: 8, padding: 12 },
  dayName: { fontWeight: "600", minWidth: 48 },
  field: { gap: 4 },
  input: { borderColor: "#d1d5db", borderRadius: 6, borderWidth: 1, padding: 8 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  time: { width: 90 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
```
In `settings.tsx` add `import { useRouter } from "expo-router";`, `const router = useRouter();` and a `<Button onPress={() => router.push("/shop")} title={t("owner.settings.shopLink")} />` above sign-out. Locales: en = Shop details / Address / Phone / WhatsApp / Open / Closed / Add break / Remove / Break start (HH:mm) / Break end (HH:mm) / Save / Shop details saved. / Could not save the shop details.; errors time "Use the HH:mm format." range "Opening must be before closing." break "Breaks must fit inside opening hours without overlapping."; settings link "Shop details and hours". Provide pt/es equivalents (pt: Dados da barbearia, Endereço, Telefone, WhatsApp, Aberto, Fechado, Adicionar pausa, Remover, Início da pausa (HH:mm), Fim da pausa (HH:mm), Salvar, Dados da barbearia salvos., Não foi possível salvar os dados da barbearia., "Use o formato HH:mm.", "A abertura deve ser antes do fechamento.", "As pausas devem ficar dentro do expediente e sem se sobrepor.", "Dados e horários da barbearia"; es: Datos de la barbería, Dirección, Teléfono, WhatsApp, Abierto, Cerrado, Agregar pausa, Quitar, Inicio de la pausa (HH:mm), Fin de la pausa (HH:mm), Guardar, Datos de la barbería guardados., No se pudieron guardar los datos de la barbería., "Usa el formato HH:mm.", "La apertura debe ser antes del cierre.", "Las pausas deben quedar dentro del horario y sin superponerse.", "Datos y horarios de la barbería").
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. Then browser check (web): sign in as the seeded owner, open `/shop`, add a lunch break on Monday, save, reload — values persist.
- [ ] **Step 5: Commit** `feat(owner): edit shop contact info and weekly hours with breaks`

---

### Task 8: Shop info — customer card and locked-cancel contact

**Files:**
- Create: `src/features/shops/use-shop-info.ts`, `src/components/domain/ShopInfoCard.tsx`, `tests/unit/shop-info-card.test.ts`
- Modify: `src/components/domain/index.ts`, `app/(customer)/(tabs)/home.tsx`, `app/(customer)/(tabs)/appointments.tsx`, locales (`shop.*`)

**Interfaces:**
- Produces: `useShopInfo(): { hours: ShopPeriod[]; shop: PublicShop | undefined }`; `ShopInfoCard({ hours: ShopPeriod[]; shop: PublicShop })`; `ShopContactButtons({ phone: string | null; whatsapp: string | null })` (renders nothing when both are empty). Locale keys `shop.{title,hours,noHours,call,whatsapp,contactToChange}`.

- [ ] **Step 1: Failing test**

```ts
// tests/unit/shop-info-card.test.ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { Linking } from "react-native";

import { ShopContactButtons, ShopInfoCard } from "../../src/components/domain/ShopInfoCard";
import i18n from "../../src/i18n";

const shop = { address: "Rua A, 10", id: "s1", name: "Shop", phone: "(11) 3000-0000", whatsapp: "(11) 99999-0000" };
const hours = [
  { end: "12:00", start: "09:00", weekday: 1 },
  { end: "18:00", start: "13:00", weekday: 1 },
];

describe("ShopInfoCard", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows address and hours with the break", async () => {
    const view = await render(React.createElement(ShopInfoCard, { hours, shop }));

    expect(view.getByText("Rua A, 10")).toBeTruthy();
    expect(view.getByText("09:00–12:00 · 13:00–18:00")).toBeTruthy();
  });

  it("opens tel: and wa.me links", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const view = await render(React.createElement(ShopContactButtons, { phone: shop.phone, whatsapp: shop.whatsapp }));

    await fireEvent.press(view.getByText("Call"));
    await fireEvent.press(view.getByText("WhatsApp"));

    expect(open).toHaveBeenCalledWith("tel:1130000000");
    expect(open).toHaveBeenCalledWith("https://wa.me/5511999990000");
  });

  it("renders nothing when there is no contact", async () => {
    const view = await render(React.createElement(ShopContactButtons, { phone: null, whatsapp: null }));

    expect(view.toJSON()).toBeNull();
  });
});
```
- [ ] **Step 2: Run** `npm test -- shop-info-card` → FAIL.
- [ ] **Step 3: Implement.**

```ts
// src/features/shops/use-shop-info.ts
import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { listPublicShops, listShopHours } from "./api";

// Single-shop MVP, like useAppointmentCards.
export function useShopInfo() {
  const { supabase } = useSupabaseSession();
  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shop = shops.data?.[0];
  const hours = useQuery({
    enabled: Boolean(shop),
    queryFn: () => listShopHours(supabase, shop!.id),
    queryKey: ["shop-hours", shop?.id],
  });

  return { hours: hours.data ?? [], shop };
}
```
```tsx
// src/components/domain/ShopInfoCard.tsx
import { useTranslation } from "react-i18next";
import { Linking, Text, View } from "react-native";

import { telUrl, whatsappUrl } from "../../features/shops/contact";
import { formatPeriods, groupWeek, weekdayLabel } from "../../features/shops/hours";
import type { ShopPeriod } from "../../features/shops/hours";
import type { PublicShop } from "../../features/shops/api";
import { useLanguage } from "../../i18n/use-language";
import { Button } from "../ui/Button";

export function ShopContactButtons({ phone, whatsapp }: { phone: string | null; whatsapp: string | null }) {
  const { t } = useTranslation();
  const tel = phone ? telUrl(phone) : null;
  const wa = whatsapp ? whatsappUrl(whatsapp) : null;
  if (!tel && !wa) return null;

  return (
    <View className="flex-row gap-2">
      {tel ? <Button label={t("shop.call")} onPress={() => void Linking.openURL(tel)} size="sm" testID="shop-call" variant="outline" /> : null}
      {wa ? <Button label={t("shop.whatsapp")} onPress={() => void Linking.openURL(wa)} size="sm" testID="shop-whatsapp" variant="outline" /> : null}
    </View>
  );
}

export function ShopInfoCard({ hours, shop }: { hours: ShopPeriod[]; shop: PublicShop }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const groups = groupWeek(hours);
  if (!shop.address && !shop.phone && !shop.whatsapp && groups.length === 0) return null;

  return (
    <View className="gap-2 rounded-[20px] bg-neutral-50 p-4" testID="shop-info-card">
      <Text className="text-base font-sans-semibold text-ink">{shop.name}</Text>
      {shop.address ? <Text className="text-sm font-sans text-neutral-600">{shop.address}</Text> : null}
      {groups.map((group) => (
        <View className="flex-row justify-between" key={group.from}>
          <Text className="text-sm font-sans text-neutral-600">
            {group.from === group.to ? weekdayLabel(group.from, language) : `${weekdayLabel(group.from, language)}–${weekdayLabel(group.to, language)}`}
          </Text>
          <Text className="text-sm font-sans-semibold text-ink">{formatPeriods(group.periods)}</Text>
        </View>
      ))}
      <ShopContactButtons phone={shop.phone} whatsapp={shop.whatsapp} />
    </View>
  );
}
```
Export both from `domain/index.ts`. `home.tsx`: `const { hours, shop } = useShopInfo();` and, after the "Book" button: `{shop ? <ShopInfoCard hours={hours} shop={shop} /> : null}`. `appointments.tsx`: `const { shop } = useShopInfo();` and inside the `!open` branch replace the lone locked `<Text>` block with:

```tsx
{!open ? (
  <View className="gap-2">
    <Text className="text-sm font-sans text-neutral-600">{t("appointments.locked")}</Text>
    {shop?.phone || shop?.whatsapp ? <Text className="text-sm font-sans text-neutral-600">{t("shop.contactToChange")}</Text> : null}
    {shop ? <ShopContactButtons phone={shop.phone} whatsapp={shop.whatsapp} /> : null}
  </View>
) : null}
```
Locales `shop`: en = Call / WhatsApp / "To change this appointment, contact the shop." ; pt = Ligar / WhatsApp / "Para alterar este agendamento, fale com a barbearia." ; es = Llamar / WhatsApp / "Para cambiar esta cita, contacta a la barbería." (keys `call`, `whatsapp`, `contactToChange`; drop unused `title/hours/noHours` — only add keys that are used).
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`; browser check Home card + locked agenda item (seed an appointment <90 min or temporarily check via an appointment close to now).
- [ ] **Step 5: Commit** `feat(customer): show shop info and contact options`

---

### Task 9: Add to calendar (.ics) and book again

**Files:**
- Create: `src/features/appointments/ics.ts`, `src/features/appointments/save-calendar-file.ts`, `tests/unit/ics.test.ts`
- Modify: `app/(customer)/(tabs)/appointments.tsx`, `package.json` (via `npx expo install expo-file-system expo-sharing`), locales (`appointments.{addToCalendar,bookAgain,calendarError}`)

**Interfaces:**
- Produces: `buildAppointmentIcs(input: { description?: string | null; endsAt: string; id: string; location?: string | null; startsAt: string; summary: string }, now?: Date): string`; `saveCalendarFile(filename: string, content: string): Promise<void>`.

- [ ] **Step 1: Failing test**

```ts
// tests/unit/ics.test.ts
import { buildAppointmentIcs } from "../../src/features/appointments/ics";

describe("buildAppointmentIcs", () => {
  const ics = buildAppointmentIcs(
    {
      description: "Barber: João",
      endsAt: "2026-08-17T12:45:00.000Z",
      id: "abc",
      location: "Rua A, 10; Centro",
      startsAt: "2026-08-17T12:00:00.000Z",
      summary: "Corte, barba",
    },
    new Date("2026-08-01T10:00:00.000Z"),
  );

  it("uses CRLF line endings and the calendar envelope", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
  });

  it("writes UTC times, a stable UID and escaped text", () => {
    expect(ics).toContain("UID:abc@barberschedule\r\n");
    expect(ics).toContain("DTSTAMP:20260801T100000Z\r\n");
    expect(ics).toContain("DTSTART:20260817T120000Z\r\n");
    expect(ics).toContain("DTEND:20260817T124500Z\r\n");
    expect(ics).toContain("SUMMARY:Corte\\, barba\r\n");
    expect(ics).toContain("LOCATION:Rua A\\, 10\\; Centro\r\n");
  });

  it("omits empty optional fields", () => {
    expect(buildAppointmentIcs({ endsAt: "2026-08-17T12:45:00Z", id: "x", startsAt: "2026-08-17T12:00:00Z", summary: "S" })).not.toContain("LOCATION");
  });
});
```
- [ ] **Step 2: Run** `npm test -- ics` → FAIL.
- [ ] **Step 3: Implement.**

```ts
// src/features/appointments/ics.ts
type IcsInput = { description?: string | null; endsAt: string; id: string; location?: string | null; startsAt: string; summary: string };

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildAppointmentIcs(input: IcsInput, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barberschedule//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.id}@barberschedule`,
    `DTSTAMP:${utc(now.toISOString())}`,
    `DTSTART:${utc(input.startsAt)}`,
    `DTEND:${utc(input.endsAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}
```
Install: `npx expo install expo-file-system expo-sharing`, then open `node_modules/expo-file-system` typings to confirm the SDK 57 API (`File`, `Paths`; `file.create({ overwrite: true })`, `file.write(string)`) and adapt the call names if they differ. Then:

```ts
// src/features/appointments/save-calendar-file.ts
import { Platform } from "react-native";

import { saveExportFile } from "../account/export-file";

export async function saveCalendarFile(filename: string, content: string) {
  if (Platform.OS === "web") {
    await saveExportFile({ content, filename, mimeType: "text/calendar" });
    return;
  }
  // Native modules are loaded lazily so jest and web never touch them.
  const { File, Paths } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { UTI: "public.calendar-event", mimeType: "text/calendar" });
}
```
`appointments.tsx` — inside `renderAppointment`, for the selected card, before the lock/confirm block:

```tsx
{withActions ? (
  <Button
    label={t("appointments.addToCalendar")}
    onPress={() => void addToCalendar(appointment)}
    testID={`appointment-calendar-${appointment.id}`}
    variant="outline"
  />
) : (
  <Button
    label={t("appointments.bookAgain")}
    onPress={() => router.push(
      `/book/date?shopId=${encodeURIComponent(appointment.shopId)}&barberId=${encodeURIComponent(appointment.barberId)}&barberServiceId=${encodeURIComponent(appointment.barberServiceId)}`,
    )}
    testID={`appointment-rebook-${appointment.id}`}
  />
)}
```
Because history cards currently render no actions (`withActions && selectedId === …`), change the condition to `selectedId === appointment.id` and wrap the existing lock/cancel/reschedule block in `{withActions ? (…) : null}`. Handler:

```tsx
const addToCalendar = async (appointment: Appointment) => {
  const card = toCardProps(appointment);
  try {
    await saveCalendarFile(
      `appointment-${appointment.id}.ics`,
      buildAppointmentIcs({
        description: card.barberName,
        endsAt: appointment.endsAt,
        id: appointment.id,
        location: shop?.address ?? null,
        startsAt: appointment.startsAt,
        summary: `${card.serviceName} — ${card.shopName}`,
      }),
    );
  } catch {
    setFeedback({ message: t("appointments.calendarError"), variant: "error" });
  }
};
```
Locales: `appointments.addToCalendar` = Add to calendar / Adicionar ao calendário / Añadir al calendario; `bookAgain` = Book again / Agendar de novo / Reservar de nuevo; `calendarError` = Could not create the calendar file. / Não foi possível criar o arquivo do calendário. / No se pudo crear el archivo de calendario.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`; browser check: History → select item → "Book again" lands on the date step; Upcoming → "Add to calendar" downloads a `.ics`.
- [ ] **Step 5: Commit** `feat(appointments): add to calendar and book again`

---

### Task 10: Push registration

**Files:**
- Create: `src/features/notifications/use-push-registration.ts`, `tests/unit/push-registration.test.ts`
- Modify: `app/(customer)/_layout.tsx`, `app.json` (plugin), `package.json` (via `npx expo install expo-notifications`)

**Interfaces:**
- Consumes: `saveExpoPushToken(supabase, token, platform)` (existing).
- Produces: `registerPushToken(supabase): Promise<string | null>`; `usePushRegistration(enabled: boolean): void`.

- [ ] **Step 1: Failing test**

```ts
// tests/unit/push-registration.test.ts
import { Platform } from "react-native";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  getExpoPushTokenAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { easConfig: { projectId: "proj" }, expoConfig: { extra: {} } } }));
jest.mock("../../src/features/notifications/register-token", () => ({ saveExpoPushToken: jest.fn().mockResolvedValue(undefined) }));

import * as Notifications from "expo-notifications";

import { saveExpoPushToken } from "../../src/features/notifications/register-token";
import { registerPushToken } from "../../src/features/notifications/use-push-registration";

const supabase = {} as never;
const setOs = (os: string) => jest.replaceProperty(Platform, "OS", os as never);

describe("registerPushToken", () => {
  afterEach(() => jest.clearAllMocks());

  it("does nothing on web", async () => {
    setOs("web");

    expect(await registerPushToken(supabase)).toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks for permission, then saves the Expo token", async () => {
    setOs("ios");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined" } as never);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: "ExponentPushToken[abc]", type: "expo" } as never);

    expect(await registerPushToken(supabase)).toBe("ExponentPushToken[abc]");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj" });
    expect(saveExpoPushToken).toHaveBeenCalledWith(supabase, "ExponentPushToken[abc]", "ios");
  });

  it("saves nothing when permission is denied", async () => {
    setOs("ios");
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: "denied" } as never);

    expect(await registerPushToken(supabase)).toBeNull();
    expect(saveExpoPushToken).not.toHaveBeenCalled();
  });
});
```
- [ ] **Step 2: Run** `npx expo install expo-notifications` first (so the module resolves), then `npm test -- push-registration` → FAIL (`use-push-registration` missing).
- [ ] **Step 3: Implement.**

```ts
// src/features/notifications/use-push-registration.ts
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useSupabaseSession } from "../../providers/AppProviders";
import { saveExpoPushToken } from "./register-token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function registerPushToken(supabase: Parameters<typeof saveExpoPushToken>[0]) {
  if (Platform.OS === "web") return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { importance: Notifications.AndroidImportance.DEFAULT, name: "default" });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return null;

  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await saveExpoPushToken(supabase, data, Platform.OS);

  return data;
}

// Best effort: simulators, denied permissions and offline starts must never break the app.
export function usePushRegistration(enabled: boolean) {
  const { supabase } = useSupabaseSession();
  useEffect(() => {
    if (enabled) void registerPushToken(supabase).catch(() => undefined);
  }, [enabled, supabase]);
}
```
`app/(customer)/_layout.tsx`: `usePushRegistration(Boolean(bootstrap.data));` right after the `bootstrap` query (hooks must precede the early returns). `app.json`: add `"expo-notifications"` to `plugins` (create the array if `expo-install` did not). Fix any type drift in `Notifications.NotificationBehavior` field names reported by `npm run typecheck` (SDK 57 names).
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] **Step 5: Commit** `feat(notifications): register the Expo push token after customer sign-in`

---

### Task 11: Verification, docs, review

- [ ] **Step 1:** Update `docs/project-status.md` (new section dated 2026-10-01: items done, **pending**: real-device push check, hosted migration `0030` apply, native `.ics` share check) and add `docs/decisions/014-shop-hours-and-info.md` (break = gap between periods; informational only; no map).
- [ ] **Step 2:** `npm run verify` (typecheck, lint, jest, runner tests, pgTAP) → all green. Run web e2e per the e2e `.env.local` gotcha (move `.env.local` aside).
- [ ] **Step 3:** Browser verification of every changed screen (signup, Home, Agenda both tabs, barber list, review, reschedule, owner shop editor): screenshot + computed-CSS spot checks (NativeWind only on plain RN elements).
- [ ] **Step 4:** Run `requesting-code-review` over the branch diff; fix findings.
- [ ] **Step 5:** Push the branch and open a PR (no merge); commit `docs: status and decision record for the missing-features batch`.
