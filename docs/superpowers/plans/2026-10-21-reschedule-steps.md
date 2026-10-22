# Reschedule Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The customer's and the barber's reschedule become **Data › Horário › Revisão › Confirmar** with the step bar on top.

**Architecture:** One shared `RescheduleFlow` component holds the steps (local trail), the availability query, the mutation and the error handling; the two route files only load their appointment and pass a few props. No new routes, no database change.

**Tech Stack:** Expo Router, React Query, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-reschedule-steps-design.md`

## Global Constraints
- Branch `feat-reschedule-steps` from `main` (already created). Commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR bodies end with the Claude Code line; use `gh api` REST; never force-push; the user merges.
- Test ids keep their prefixes: customer `reschedule-*`, barber `move-*` (`-current`, `-continue`, `-summary`, `-confirm`, `-keep`).
- i18n: en is the type source; es/pt must match. Static scans (route parents, placeholders) must keep passing; no new routes.
- Verify UI at 375px; web e2e needs `.env.local` moved aside and an Expo restart after each source change (`/tmp/claude-1000/restart.sh`; restore `.env.local` and restart the user's Metro at the end).
- Use `rtk` for noisy commands.

---

### Task 1: Strings and the shared flow

**Files:** Create `src/features/appointments/RescheduleFlow.tsx`; modify `src/i18n/locales/{en,pt,es}.ts`; test `tests/e2e/reschedule-steps.web.spec.ts` (Task 2 writes it first, see below).

**Interfaces — Produces:**
```tsx
export type RescheduleFlowProps = {
  appointmentId: string;
  barberId: string;
  barberServiceId: string;
  current: { localDate: string; localTime: string } | null;   // the slot being moved; shown in the review
  currentCard: ReactNode;                                      // shown above the calendar (Date step)
  onExit: () => void;                                          // back on the first step and "Manter horário"
  onMoved: () => Promise<void> | void;                         // after a successful move (invalidate + navigate)
  summaryRows: Array<[label: string, value: string]>;          // service / barber or customer rows of the review
  testPrefix: "move" | "reschedule";
};
export function RescheduleFlow(props: RescheduleFlowProps): JSX.Element
```
Strings added to `reschedule` in all three locales: `steps: { confirm, date, review, time }`, `dateTitle`, `timeTitle`, `reviewTitle`, `currentSlot`, `newSlot` (en: "Confirm" / "Date" / "Review" / "Time"; "Choose the new date"; "Choose the new time"; "Review the change"; "Current time"; "New time"; pt: "Confirmar" / "Data" / "Revisão" / "Horário"; "Escolha a nova data"; "Escolha o novo horário"; "Revise a remarcação"; "Horário atual"; "Novo horário"; es: "Confirmar" / "Fecha" / "Revisión" / "Hora"; "Elige la nueva fecha"; "Elige la nueva hora"; "Revisa el cambio"; "Hora actual"; "Nueva hora").

- [ ] **Step 1: Write the failing e2e first** (Task 2). Do it before the component: the spec fails because the screens still have no step bar.
- [ ] **Step 2: Strings** in the three locales (`reschedule` block already exists: add the keys).
- [ ] **Step 3: Component.**

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../components/domain/EmptyState";
import { MonthCalendar } from "../../components/domain/MonthCalendar";
import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { SkeletonBlock } from "../../components/domain/SkeletonLoader";
import { StepBar } from "../../components/domain/StepBar";
import { TimeSlotPicker } from "../../components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../components/domain/TimeSlotPicker";
import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { errorMessage } from "../../i18n/errors";
import { useLanguage } from "../../i18n/use-language";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { formatDateNumeric } from "../../lib/i18n/format";
import { useSupabaseSession } from "../../providers/AppProviders";
import { getAvailableSlotsQueryOptions } from "../availability/query";
import type { AvailableSlot } from "../availability/types";
import { rescheduleAppointment } from "./lifecycle";

type Step = "date" | "review" | "time";
const FLOW = ["date", "time", "review", "confirm"] as const;

// Reschedule like the booking wizard: date › time › review › confirm, with the step bar on top.
export function RescheduleFlow({ appointmentId, barberId, barberServiceId, current, currentCard, onExit, onMoved, summaryRows, testPrefix }: RescheduleFlowProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [trail, setTrail] = useState<Step[]>(["date"]);
  const step = trail[trail.length - 1];
  const [localDate, setLocalDate] = useState(today);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = (next: Step) => setTrail((existing) => [...existing, next]);
  const goBack = () => (trail.length > 1 ? setTrail((existing) => existing.slice(0, -1)) : onExit());

  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId),
  });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime.slice(0, 5) }));
  const chosen = startsAt ? formatInstantInShopTime(new Date(startsAt)) : null;

  const move = useMutation({
    mutationFn: (newStartsAt: string) => rescheduleAppointment(supabase, appointmentId, newStartsAt),
    onError: (caught) => {
      setError(errorMessage(caught, t, t("reschedule.error")));
      // The time may have just been taken: drop the stale choice, go back to the times and reload them.
      setStartsAt(null);
      setTrail((existing) => existing.slice(0, existing.indexOf("time") + 1));
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      await onMoved();
    },
  });

  const title = step === "date" ? t("reschedule.dateTitle") : step === "time" ? t("reschedule.timeTitle") : t("reschedule.reviewTitle");
  const rows: Array<[string, string]> = [
    ...summaryRows,
    ...(current ? ([[t("reschedule.currentSlot"), `${formatDateNumeric(current.localDate, language)} · ${current.localTime}`]] as Array<[string, string]>) : []),
    ...(chosen ? ([[t("reschedule.newSlot"), `${formatDateNumeric(chosen.localDate, language)} · ${chosen.localTime}`]] as Array<[string, string]>) : []),
  ];

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "bottom", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <View className="w-full max-w-[420px]">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={title} />
          </View>
          <StepBar
            canSelect={(key) => trail.includes(key as Step)}
            currentKey={step}
            label={t("book.stepOf", { current: FLOW.indexOf(step) + 1, name: t(`reschedule.steps.${step}`), total: FLOW.length })}
            onSelect={(key) => setTrail((existing) => existing.slice(0, existing.indexOf(key as Step) + 1))}
            steps={FLOW.map((key) => ({ key, label: t(`reschedule.steps.${key}`) }))}
          />

          {step === "date" ? (
            <>
              <View className="w-full max-w-[420px] gap-2">
                <Text className="text-sm font-sans-medium text-neutral-600">{t("reschedule.current")}</Text>
                {currentCard}
              </View>
              <MonthCalendar onSelectDate={(date) => { setLocalDate(date); setStartsAt(null); }} selectedDate={localDate} today={today} />
              <View className="w-full max-w-[420px]">
                <Button label={t("book.continue")} onPress={() => go("time")} size="lg" testID={`${testPrefix}-continue`} />
              </View>
            </>
          ) : null}

          {step === "time" ? (
            <View className="w-full max-w-[420px] gap-3">
              <Text className="text-sm font-sans text-neutral-600">{formatDateNumeric(localDate, language)}</Text>
              {availability.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
              {availability.error ? <Text className="text-sm font-sans text-danger-500">{t("reschedule.loadError")}</Text> : null}
              {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title={t("reschedule.noTimes")} /> : null}
              {slots.length > 0 ? (
                <TimeSlotPicker onSelectSlot={(time) => setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime.slice(0, 5) === time)?.startsAt ?? null)} slots={slots} />
              ) : null}
              <Button disabled={!startsAt} label={t("book.continue")} onPress={() => go("review")} size="lg" testID={`${testPrefix}-continue`} />
            </View>
          ) : null}

          {step === "review" ? (
            <View className="w-full max-w-[420px] gap-4">
              <View className="gap-2 rounded-[20px] bg-neutral-50 p-4" testID={`${testPrefix}-summary`}>
                {rows.map(([label, value]) => (
                  <View className="flex-row justify-between gap-3" key={label}>
                    <Text className="text-sm font-sans text-neutral-600">{label}</Text>
                    <Text className="flex-shrink text-right text-sm font-sans-semibold text-ink">{value}</Text>
                  </View>
                ))}
              </View>
              <View className="gap-2">
                <Button disabled={!startsAt || move.isPending} label={t("reschedule.confirm")} onPress={() => startsAt && move.mutate(startsAt)} size="lg" testID={`${testPrefix}-confirm`} />
                <Button label={t("reschedule.keep")} onPress={onExit} testID={`${testPrefix}-keep`} variant="ghost" />
              </View>
            </View>
          ) : null}

          <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
        </View>
      </ScrollView>
    </Screen>
  );
}
```
  (`StepBar`'s `currentKey` must be one of its `steps`; `confirm` has no screen, as in the booking wizard.)
- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` (the two screens are rewired in Task 3; until then the component is unused).

---

### Task 2: E2E first (fails), then wire the screens (Task 3)

**Files:** Create `tests/e2e/reschedule-steps.web.spec.ts`; update `tests/e2e/customer-lifecycle.web.spec.ts` (test "a customer can reschedule…"), `tests/e2e/barber-booking.web.spec.ts` (the three move tests), `tests/unit/reschedule-current.test.ts`.

- [ ] **Step 1: New spec** with helpers copied from the existing specs (customer: `signInAsCustomer`, `mockCustomerRest`, `appointmentRow`; barber: the `signIn`/`mockBarberRest`/`openAppointmentRow` of `barber-booking.web.spec.ts`; extract nothing, duplicate the minimum). Tests (each for customer **and** barber, parametrised by a `role` loop):
  1. step bar labels in order: Date step "Step 1 of 4 · Date" (calendar visible, current card visible, `<prefix>-continue` enabled) → Continue → "Step 2 of 4 · Time" (slot buttons, Continue disabled until a slot is picked) → Continue → "Step 3 of 4 · Review"; the summary contains the service and the **current** and **new** date/time; confirm sends `reschedule_appointment` with `{ appointment_id, new_starts_at }`.
  2. back: from Review the header back returns to Time; from Time to Date; from Date it exits (customer → `/appointments`, barber → `/my-agenda`); tapping a completed segment (`step-date`) from Review jumps to Date.
  3. a taken time (`reschedule_appointment` answers `P0001`) returns to the **Time** step with "That time is no longer available." and Continue disabled.
  4. "Manter horário" on Review makes no `reschedule_appointment` call and exits.
  Run (Expo restarted) → FAIL.
- [ ] **Step 2: Update the existing specs** for the extra steps: after picking the day click `<prefix>-continue`, pick the time, click `<prefix>-continue`, then `<prefix>-confirm`; the failed-move test expects to land on the Time step (`step-label` "Step 2 of 4 · Time") instead of "stays on the calendar"; the keep test goes to Review first (`continue` twice needs a slot: mock one) or uses the header back; `move-current`/`reschedule-current` are looked up on the Date step.
- [ ] **Step 3: Unit test** `reschedule-current.test.ts`: keep it as a static scan but point to the right places: the customer screen still contains `useAppointmentCards` and `testID="reschedule-current"`; the flow file contains `t("reschedule.current")`.

---

### Task 3: Wire the two screens

**Files:** Modify `app/(customer)/reschedule.tsx`, `app/(barber)/move-appointment.tsx`.

- [ ] **Step 1: Customer screen** — keep the params, `upcoming` query, `current` appointment and `useAppointmentCards`; render

```tsx
<RescheduleFlow
  appointmentId={appointmentId}
  barberId={barberId}
  barberServiceId={barberServiceId}
  current={currentSlot}
  currentCard={current ? <AppointmentCard {...cardProps} testID="reschedule-current" /> : null}
  onExit={back}
  onMoved={async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    // dismissTo pops back to the tabs already underneath; replace would mount a second tab navigator.
    router.dismissTo("/appointments");
  }}
  summaryRows={[[t("book.summary.service"), current?.serviceNameSnapshot ?? ""], [t("book.summary.barber"), cardProps?.barberName ?? ""]]}
  testPrefix="reschedule"
/>
```
  with `currentSlot = current ? { localDate, localTime } from formatInstantInShopTime(new Date(current.startsAt)) : null` and `cardProps = current ? toCardProps(current) : null`. Remove the now-unused imports and local state.
- [ ] **Step 2: Barber screen** — keep the params (`customerName`, `serviceName`, `startsAt`), `goToAgenda`; `onExit={() => goToAgenda(false)}`; `onMoved` = the existing invalidations then `goToAgenda(true)`; `currentCard` = the existing `Card` with `testID="move-current"`; `summaryRows` = `[[t("agendaCard.customer"), customerName], [t("book.summary.service"), serviceName]]`; `testPrefix="move"`.
- [ ] **Step 4: Verify** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/reschedule-steps.web.spec.ts tests/e2e/customer-lifecycle.web.spec.ts tests/e2e/barber-booking.web.spec.ts tests/e2e/barber-side.web.spec.ts tests/e2e/owner-own-agenda.web.spec.ts tests/e2e/back-navigation.web.spec.ts` → PASS; 375px screenshots of the Date, Time and Review steps for the customer and the barber.

---

### Task 4: Review, branch, PR, CI
- [ ] `npm run typecheck && npm run lint && npx jest`, full web e2e (`--workers=2`; if Expo dies near the end restart and rerun only the failures), `npm run test:db` not needed (no database change). Restore `.env.local`, restart the user's Metro (skill `running-barberschedule-locally`).
- [ ] Commit (small commits per task), push `feat-reschedule-steps`, open the PR with `gh api` REST (base `main`), then watch CI with a single background waiter (no polling loops in the chat); fix any failure and push; report when green. Merging is the user's.
