import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { BarberCard } from "../../../src/components/domain/BarberCard";
import { BottomActionBar } from "../../../src/components/domain/BottomActionBar";
import { ConfirmDialog } from "../../../src/components/domain/ConfirmDialog";
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
import type { AvailableSlot } from "../../../src/features/availability/types";
import { listPublicBarbers } from "../../../src/features/barbers/api";
import { useWeekdaySlots } from "../../../src/features/recurrence/customer-flow/use-weekday-slots";
import { WeekdayList } from "../../../src/features/recurrence/customer-flow/WeekdayList";
import { PlanCard } from "../../../src/features/recurrence/PlanCard";
import { buildPlanOffers } from "../../../src/features/recurrence/plan-offers";
import type { PlanOffer, PlanOfferBarber } from "../../../src/features/recurrence/plan-offers";
import { listPlansForBarber } from "../../../src/features/recurrence/plans-api";
import { recurrenceLabel } from "../../../src/features/recurrence/pricing";
import { planValue } from "../../../src/features/recurrence/price-text";
import { PlanSummary } from "../../../src/features/recurrence/PlanSummary";
import {
  cancelMyRecurrenceRequest, listMyRecurrenceRequests, requestDisplayStatus, requestRecurrence, requestSeriesCancellation,
} from "../../../src/features/recurrence/requests-api";
import type { RecurrenceRequest } from "../../../src/features/recurrence/requests-api";
import { listPublicShops } from "../../../src/features/shops/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../../src/lib/i18n/format";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useNow } from "../../../src/lib/use-now";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Step = "barber" | "list" | "plan" | "review" | "time" | "weekday";
const FLOW = ["plan", "barber", "weekday", "time", "review", "send"] as const;
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const CURRENT = ["pending", "active", "cancel_requested"];

// Plans: the customer has at most one current plan (pending or active). Without one they subscribe from the top button;
// with one a bottom bar offers "Change plan" and an active plan can ask for its cancellation. The flow is
// plan › barber › weekday › time › review › send; the barber or the owner answers.
export default function CustomerRecurrenceScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(useNow()).localDate;
  const [trail, setTrail] = useState<Step[]>(["list"]);
  const step = trail[trail.length - 1];
  const [offer, setOffer] = useState<PlanOffer | null>(null);
  const [barber, setBarber] = useState<PlanOfferBarber | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<RecurrenceRequest | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const go = (next: Step) => setTrail((existing) => [...existing, next]);
  const goBack = () => (trail.length > 1 ? setTrail((existing) => existing.slice(0, -1)) : back());

  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shopId = shops.data?.[0]?.id ?? "";
  const barbers = useQuery({ enabled: Boolean(shopId), queryFn: () => listPublicBarbers(supabase, shopId), queryKey: ["public-barbers", shopId] });
  const requests = useQuery({ queryFn: () => listMyRecurrenceRequests(supabase), queryKey: ["my-recurrence-requests"] });

  // Plan-first: every barber's plans merged, so one plan lists the barbers that offer it.
  const barberList = barbers.data ?? [];
  const planQueries = useQueries({
    queries: barberList.map((item) => ({ queryFn: () => listPlansForBarber(supabase, item.id), queryKey: ["barber-plans", item.id] })),
  });
  const plansLoading = barbers.isLoading || planQueries.some((query) => query.isLoading);
  const offers = buildPlanOffers(
    barberList.map((item) => ({ avatarUrl: item.avatarUrl ?? null, id: item.id, name: item.name })),
    Object.fromEntries(barberList.map((item, index) => [item.id, planQueries[index]?.data ?? []])),
  );

  // The first date of a weekday is its next occurrence; weekdays without any free time are disabled.
  const { dates, disabledDays, queries: weekdaySlots } = useWeekdaySlots({ barberId: barber?.barberId ?? "", barberServiceId: barber?.barberServiceId ?? "", enabled: step === "weekday" && Boolean(barber), today });
  const slots = weekday ? weekdaySlots[weekday - 1].data ?? [] : [];
  const slotRows: TimeSlot[] = slots.map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime }));
  const chosen = startsAt ? formatInstantInShopTime(new Date(startsAt)) : null;

  const all = requests.data ?? [];
  const currentPlans = all.filter((request) => CURRENT.includes(requestDisplayStatus(request)));
  const history = all.filter((request) => !CURRENT.includes(requestDisplayStatus(request)));
  const currentPlan = currentPlans[0] ?? null;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["my-recurrence-requests"] });
  const resetFlow = () => {
    setOffer(null);
    setBarber(null);
    setWeekday(null);
    setStartsAt(null);
    setReplacing(false);
    setTrail(["list"]);
  };

  const send = useMutation({
    mutationFn: () => {
      const status = currentPlan ? requestDisplayStatus(currentPlan) : null;

      return requestRecurrence(supabase, {
        barberServiceId: barber?.barberServiceId ?? "",
        replacesRequestId: replacing && status === "pending" ? currentPlan?.id : undefined,
        replacesSeriesId: replacing && currentPlan?.seriesId && (status === "active" || status === "cancel_requested") ? currentPlan.seriesId : undefined,
        startDate: chosen?.localDate ?? "",
        startTime: chosen?.localTime ?? "",
        weeks: offer?.weeks ?? 1,
      });
    },
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.sendError")), variant: "error" }),
    onSuccess: () => {
      refresh();
      setFeedback({ message: t(replacing ? "recurrence.changeSent" : "recurrence.sent"), variant: "success" });
      resetFlow();
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelMyRecurrenceRequest(supabase, id),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.sendError")), variant: "error" }),
    onSuccess: refresh,
  });

  const requestCancellation = useMutation({
    mutationFn: (seriesId: string) => requestSeriesCancellation(supabase, seriesId),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.sendError")), variant: "error" }),
    onSettled: () => setCancelTarget(null),
    onSuccess: () => {
      refresh();
      setFeedback({ message: t("recurrence.cancelRequested"), variant: "success" });
    },
  });

  const startFlow = (isChange: boolean) => {
    setReplacing(isChange);
    go("plan");
  };

  const stepLabels = FLOW.map((key) => ({ key, label: t(`recurrence.steps.${key}`) }));
  const flowStep = step === "list" ? null : step;
  const weekdayName = weekday ? t(`owner.schedule.weekdays.${WEEKDAY_KEYS[weekday - 1]}`) : "";
  const showBar = step === "list" && currentPlan !== null;

  const requestCard = (request: RecurrenceRequest, muted: boolean) => {
    const status = requestDisplayStatus(request);

    return (
      <Card key={request.id} testID={`my-request-${request.id}`} variant="outlined">
        <View className={`gap-2 ${muted ? "opacity-60" : ""}`}>
          <Text className="text-base font-sans-semibold text-ink">{request.planName ?? request.serviceName} · {request.barberName}</Text>
          <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
            {recurrenceLabel(t, request.weeks)} · {formatDateNumeric(request.startDate, language)} {request.startTime}
          </Text>
          <Text className="text-sm font-sans-medium text-ink" testID={`my-request-status-${request.id}`}>{t(`recurrence.status.${status}`)}</Text>
          {status === "pending" ? (
            <View className="flex-row">
              <Button disabled={cancel.isPending} label={t("recurrence.cancelRequest")} onPress={() => cancel.mutate(request.id)} size="sm" testID={`my-request-cancel-${request.id}`} variant="outline" />
            </View>
          ) : null}
          {status === "active" && request.seriesId ? (
            <View className="flex-row">
              <Button label={t("recurrence.requestCancellation")} onPress={() => setCancelTarget(request)} size="sm" testID="plan-cancel-request" variant="outline" />
            </View>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: showBar ? 140 : 24 }}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={t("recurrence.title")} />
            {flowStep ? (
              <StepBar
                canSelect={(key) => trail.includes(key as Step)}
                currentKey={flowStep}
                label={t("book.stepOf", { current: FLOW.indexOf(flowStep) + 1, name: t(`recurrence.steps.${flowStep}`), total: FLOW.length })}
                onSelect={(key) => setTrail((existing) => existing.slice(0, existing.indexOf(key as Step) + 1))}
                steps={stepLabels}
              />
            ) : null}

            {step === "list" ? (
              <>
                {currentPlans.length === 0 ? <Button label={t("recurrence.request")} onPress={() => startFlow(false)} testID="recurrence-request" /> : null}
                {requests.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
                {requests.data && requests.data.length === 0 ? <EmptyState title={t("recurrence.empty")} /> : null}
                {currentPlans.map((request) => requestCard(request, false))}
                {history.length > 0 ? (
                  <View className="gap-3">
                    <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.history")}</Text>
                    {history.map((request) => requestCard(request, true))}
                  </View>
                ) : null}
              </>
            ) : null}

            {step === "plan" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.choosePlan")}</Text>
                {plansLoading ? <SkeletonBlock height={72} width={320} /> : null}
                {!plansLoading && offers.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("recurrence.noPlansShop")}</Text> : null}
                {offers.map((candidate) => {
                  const value = planValue(t, candidate.priceCents, candidate.weeks);

                  return (
                    <PlanCard
                      amountText={formatPriceBRL(value.amountCents)}
                      caption={value.caption}
                      key={candidate.planId}
                      normalText={t("recurrence.normalPrice", { price: formatPriceBRL(candidate.normalCents) })}
                      onPress={() => { setOffer(candidate); setBarber(null); setWeekday(null); setStartsAt(null); go("barber"); }}
                      periodicity={recurrenceLabel(t, candidate.weeks)}
                      testID={`offer-${candidate.planId}`}
                      title={candidate.name}
                    />
                  );
                })}
              </>
            ) : null}

            {step === "barber" && offer ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseBarber")}</Text>
                {offer.barbers.map((item) => (
                  <BarberCard avatarUrl={item.avatarUrl} key={item.barberId} name={item.barberName} onPress={() => { setBarber(item); setWeekday(null); setStartsAt(null); go("weekday"); }} testID={`offer-barber-${item.barberId}`} />
                ))}
              </>
            ) : null}

            {step === "weekday" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseWeekday")}</Text>
                <WeekdayList dates={dates} disabledDays={disabledDays} onSelect={(day) => { setWeekday(day); setStartsAt(null); go("time"); }} selectedDay={weekday} />
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

            {step === "review" && offer && barber && chosen ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.review")}</Text>
                <Card testID="recurrence-review">
                  <View className="gap-2">
                    <PlanSummary
                      amountText={formatPriceBRL(planValue(t, offer.priceCents, offer.weeks).amountCents)}
                      caption={planValue(t, offer.priceCents, offer.weeks).caption}
                      normalText={t("recurrence.normalPrice", { price: formatPriceBRL(offer.normalCents) })}
                      periodicity={recurrenceLabel(t, offer.weeks)}
                      title={offer.name}
                    />
                    <Text className="text-sm font-sans text-neutral-700">{barber.barberName}</Text>
                    <Text className="text-sm font-sans text-neutral-700">{t("recurrence.everyWeekday", { weekday: weekdayName })}</Text>
                    <Text className="text-sm font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>{t("recurrence.startsOn", { date: formatDateNumeric(chosen.localDate, language) })} · {chosen.localTime}</Text>
                  </View>
                </Card>
                <Button disabled={send.isPending} label={t("recurrence.send")} onPress={() => send.mutate()} testID="recurrence-send" />
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
      {showBar ? (
        <BottomActionBar>
          <Button label={t("recurrence.changePlan")} onPress={() => startFlow(true)} testID="plan-change" />
        </BottomActionBar>
      ) : null}
      <ConfirmDialog
        body={t("recurrence.cancelDialogBody")}
        busy={requestCancellation.isPending}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("recurrence.requestCancellation")}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget?.seriesId && requestCancellation.mutate(cancelTarget.seriesId)}
        title={t("recurrence.cancelDialogTitle")}
        visible={cancelTarget !== null}
      />
    </Screen>
  );
}
