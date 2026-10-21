import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { BarberCard } from "../../../src/components/domain/BarberCard";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { StepBar } from "../../../src/components/domain/StepBar";
import { TimeSlotPicker } from "../../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { getAvailableSlotsQueryOptions } from "../../../src/features/availability/query";
import type { AvailableSlot } from "../../../src/features/availability/types";
import { listPublicBarbers } from "../../../src/features/barbers/api";
import { PlanCard } from "../../../src/features/recurrence/PlanCard";
import { listPlansForBarber, planTitle } from "../../../src/features/recurrence/plans-api";
import type { BarberPlan } from "../../../src/features/recurrence/plans-api";
import { recurrenceLabel } from "../../../src/features/recurrence/pricing";
import { recurrencePriceText } from "../../../src/features/recurrence/price-text";
import { cancelMyRecurrenceRequest, listMyRecurrenceRequests, requestRecurrence } from "../../../src/features/recurrence/requests-api";
import { nextDateForWeekday } from "../../../src/features/recurrence/weekday";
import { listPublicShops } from "../../../src/features/shops/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../../src/lib/i18n/format";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useNow } from "../../../src/lib/use-now";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Step = "barber" | "list" | "plan" | "review" | "time" | "weekday";
const FLOW = ["barber", "plan", "weekday", "time", "review", "send"] as const;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

// The customer asks for a recurrence plan: barber › plan › weekday › time › review › send. The barber or the owner answers.
export default function CustomerRecurrenceScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(useNow()).localDate;
  const [trail, setTrail] = useState<Step[]>(["list"]);
  const step = trail[trail.length - 1];
  const [barberId, setBarberId] = useState("");
  const [plan, setPlan] = useState<BarberPlan | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const go = (next: Step) => setTrail((current) => [...current, next]);
  const goBack = () => (trail.length > 1 ? setTrail((current) => current.slice(0, -1)) : back());

  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shopId = shops.data?.[0]?.id ?? "";
  const barbers = useQuery({ enabled: Boolean(shopId), queryFn: () => listPublicBarbers(supabase, shopId), queryKey: ["public-barbers", shopId] });
  const plans = useQuery({ enabled: Boolean(barberId), queryFn: () => listPlansForBarber(supabase, barberId), queryKey: ["barber-plans", barberId] });
  const requests = useQuery({ queryFn: () => listMyRecurrenceRequests(supabase), queryKey: ["my-recurrence-requests"] });

  // The first date of a weekday is its next occurrence; weekdays without any free time are disabled.
  const dates = Object.fromEntries(WEEKDAYS.map((day) => [day, nextDateForWeekday(today, day)])) as Record<number, string>;
  const weekdaySlots = useQueries({
    queries: WEEKDAYS.map((day) => ({
      ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId: plan?.barberServiceId ?? "", localDate: dates[day] }),
      enabled: step === "weekday" && Boolean(barberId && plan),
    })),
  });
  const slots = weekday ? weekdaySlots[weekday - 1].data ?? [] : [];
  const slotRows: TimeSlot[] = slots.map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime }));
  const chosen = startsAt ? formatInstantInShopTime(new Date(startsAt)) : null;

  const send = useMutation({
    mutationFn: () => requestRecurrence(supabase, { barberServiceId: plan?.barberServiceId ?? "", startDate: chosen?.localDate ?? "", startTime: chosen?.localTime ?? "", weeks: plan?.weeks ?? 1 }),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.sendError")), variant: "error" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-recurrence-requests"] });
      setFeedback({ message: t("recurrence.sent"), variant: "success" });
      setStartsAt(null);
      setTrail(["list"]);
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelMyRecurrenceRequest(supabase, id),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.sendError")), variant: "error" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-recurrence-requests"] }),
  });

  const stepLabels = FLOW.map((key) => ({ key, label: t(`recurrence.steps.${key}`) }));
  const current = step === "list" ? null : step;
  const weekdayName = weekday ? t(`owner.schedule.weekdays.${WEEKDAY_KEYS[weekday - 1]}`) : "";

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={t("recurrence.title")} />
            {current ? (
              <StepBar
                canSelect={(key) => trail.includes(key as Step)}
                currentKey={current}
                label={t("book.stepOf", { current: FLOW.indexOf(current) + 1, name: t(`recurrence.steps.${current}`), total: FLOW.length })}
                onSelect={(key) => setTrail((existing) => existing.slice(0, existing.indexOf(key as Step) + 1))}
                steps={stepLabels}
              />
            ) : null}

            {step === "list" ? (
              <>
                <Button label={t("recurrence.request")} onPress={() => go("barber")} testID="recurrence-request" />
                <Text className="text-sm font-sans text-neutral-600">{t("recurrence.contactToEnd")}</Text>
                {requests.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
                {requests.data && requests.data.length === 0 ? <EmptyState title={t("recurrence.empty")} /> : null}
                {(requests.data ?? []).map((request) => (
                  <Card key={request.id} testID={`my-request-${request.id}`} variant="outlined">
                    <View className="gap-2">
                      <Text className="text-base font-sans-semibold text-ink">{request.serviceName} · {request.barberName}</Text>
                      <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                        {recurrenceLabel(t, request.weeks)} · {formatDateNumeric(request.startDate, language)} {request.startTime}
                      </Text>
                      <Text className="text-sm font-sans-medium text-ink" testID={`my-request-status-${request.id}`}>{t(`recurrence.status.${request.status}`)}</Text>
                      {request.status === "pending" ? (
                        <View className="flex-row">
                          <Button disabled={cancel.isPending} label={t("recurrence.cancelRequest")} onPress={() => cancel.mutate(request.id)} size="sm" testID={`my-request-cancel-${request.id}`} variant="outline" />
                        </View>
                      ) : null}
                    </View>
                  </Card>
                ))}
              </>
            ) : null}

            {step === "barber" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseBarber")}</Text>
                {(barbers.data ?? []).map((barber) => (
                  <BarberCard avatarUrl={barber.avatarUrl} key={barber.id} name={barber.name} onPress={() => { setBarberId(barber.id); setPlan(null); setWeekday(null); setStartsAt(null); go("plan"); }} testID={`barber-card-${barber.id}`} />
                ))}
              </>
            ) : null}

            {step === "plan" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.choosePlan")}</Text>
                {plans.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
                {plans.data && plans.data.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("recurrence.noPlans")}</Text> : null}
                {(plans.data ?? []).map((candidate) => (
                  <PlanCard
                    key={candidate.planId}
                    normalText={t("recurrence.normalPrice", { price: formatPriceBRL(candidate.normalCents) })}
                    onPress={() => { setPlan(candidate); setWeekday(null); setStartsAt(null); go("weekday"); }}
                    priceText={recurrencePriceText(t, candidate.priceCents, candidate.weeks)}
                    testID={`plan-card-${candidate.planId}`}
                    title={planTitle(t, candidate)}
                  />
                ))}
              </>
            ) : null}

            {step === "weekday" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseWeekday")}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const result = weekdaySlots[day - 1];
                    const noTimes = result.isSuccess && (result.data ?? []).length === 0;

                    return (
                      <Button
                        disabled={noTimes}
                        key={day}
                        label={t(`owner.schedule.weekdays.${WEEKDAY_KEYS[day - 1]}`)}
                        onPress={() => { setWeekday(day); setStartsAt(null); go("time"); }}
                        testID={`weekday-${day}`}
                        variant="outline"
                      />
                    );
                  })}
                </View>
              </>
            ) : null}

            {step === "time" && weekday ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseTime")}</Text>
                <Text className="text-sm font-sans text-neutral-600">{t("recurrence.everyWeekday", { weekday: weekdayName })} · {t("recurrence.startsOn", { date: formatDateNumeric(dates[weekday], language) })}</Text>
                {weekdaySlots[weekday - 1].isLoading ? <SkeletonBlock height={56} width={320} /> : null}
                {weekdaySlots[weekday - 1].isSuccess && slots.length === 0 ? <EmptyState title={t("recurrence.noTimesWeekday")} /> : null}
                {slotRows.length > 0 ? <TimeSlotPicker onSelectSlot={(time) => setStartsAt(slots.find((slot: AvailableSlot) => slot.localTime === time)?.startsAt ?? null)} slots={slotRows} /> : null}
                <Button disabled={!startsAt} label={t("book.continue")} onPress={() => go("review")} testID="recurrence-time-continue" />
              </>
            ) : null}

            {step === "review" && plan && chosen ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.review")}</Text>
                <Card testID="recurrence-review">
                  <View className="gap-2">
                    <Text className="text-base font-sans-semibold text-ink">{planTitle(t, plan)}</Text>
                    <Text className="text-sm font-sans text-neutral-700">{t("recurrence.everyWeekday", { weekday: weekdayName })} · {recurrenceLabel(t, plan.weeks)}</Text>
                    <Text className="text-sm font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>{t("recurrence.startsOn", { date: formatDateNumeric(chosen.localDate, language) })} · {chosen.localTime}</Text>
                    <Text className="text-sm font-sans-medium text-ink">{recurrencePriceText(t, plan.priceCents, plan.weeks)}</Text>
                  </View>
                </Card>
                <Button disabled={send.isPending} label={t("recurrence.send")} onPress={() => send.mutate()} testID="recurrence-send" />
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
