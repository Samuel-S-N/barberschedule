import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { BarberCard } from "../../components/domain/BarberCard";
import { EmptyState } from "../../components/domain/EmptyState";
import { RadioBlock } from "../../components/domain/RadioBlock";
import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { SkeletonBlock } from "../../components/domain/SkeletonLoader";
import { StepBar } from "../../components/domain/StepBar";
import { TimeSlotPicker } from "../../components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../components/domain/TimeSlotPicker";
import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { SearchInput } from "../../components/ui/SearchInput";
import { errorMessage } from "../../i18n/errors";
import { useLanguage } from "../../i18n/use-language";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { formatDateNumeric } from "../../lib/i18n/format";
import { useSupabaseSession } from "../../providers/AppProviders";
import type { AvailableSlot } from "../availability/types";
import { useWeekdaySlots } from "./customer-flow/use-weekday-slots";
import { WeekdayList } from "./customer-flow/WeekdayList";
import { PlanCard } from "./PlanCard";
import { buildPlanOffers } from "./plan-offers";
import type { PlanOffer, PlanOfferBarber } from "./plan-offers";
import { listPlansForBarber } from "./plans-api";
import { recurrenceLabel } from "./pricing";
import { planValue } from "./price-text";
import { PlanSummary } from "./PlanSummary";
import { createRecurrenceForCustomer } from "./requests-api";

type Props = {
  // Owner: the active barbers; barber: just themself. With more than one, the flow has a Barber step.
  barbers: { avatarUrl: string | null; id: string; name: string }[];
  customers: { id: string; name: string }[];
  // The series was created: refresh and leave.
  onCreated: () => void;
  // Back on the first step.
  onExit: () => void;
  // Server-side customer search (the barber's customers); the owner's list is filtered locally.
  onSearch?: (term: string) => void;
  today: string;
};

type Step = "barber" | "customer" | "plan" | "review" | "time" | "weekday";
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

// Staff create a recurring plan for a customer (no account needed) with the same steps as every booking:
// customer › plan › [barber] › weekday › time › review › create. Plans and prices come from the barbers' plans.
export function ManualRecurrenceFlow({ barbers, customers, onCreated, onExit, onSearch, today }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const withBarberStep = barbers.length > 1;
  const flow: string[] = ["customer", "plan", ...(withBarberStep ? ["barber"] : []), "weekday", "time", "review", "send"];
  const [trail, setTrail] = useState<Step[]>(["customer"]);
  const step = trail[trail.length - 1];
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [offer, setOffer] = useState<PlanOffer | null>(null);
  const [barber, setBarber] = useState<PlanOfferBarber | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = (next: Step) => setTrail((existing) => [...existing, next]);
  const goBack = () => (trail.length > 1 ? setTrail((existing) => existing.slice(0, -1)) : onExit());

  const planQueries = useQueries({
    queries: barbers.map((item) => ({ queryFn: () => listPlansForBarber(supabase, item.id), queryKey: ["barber-plans", item.id] })),
  });
  const plansLoading = planQueries.some((query) => query.isLoading);
  const offers = buildPlanOffers(barbers, Object.fromEntries(barbers.map((item, index) => [item.id, planQueries[index]?.data ?? []])));

  const { dates, disabledDays, queries: weekdaySlots } = useWeekdaySlots({ barberId: barber?.barberId ?? "", barberServiceId: barber?.barberServiceId ?? "", enabled: step === "weekday" && Boolean(barber), today });
  const slots = weekday ? weekdaySlots[weekday - 1].data ?? [] : [];
  const slotRows: TimeSlot[] = slots.map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime.slice(0, 5) }));
  const chosen = startsAt ? formatInstantInShopTime(new Date(startsAt)) : null;
  const customer = customers.find((candidate) => candidate.id === customerId) ?? null;
  const term = search.trim().toLowerCase();
  const shownCustomers = customers.filter((candidate) => !term || candidate.name.toLowerCase().includes(term));
  const weekdayName = weekday ? t(`owner.schedule.weekdays.${WEEKDAY_KEYS[weekday - 1]}`) : "";

  const choosePlan = (candidate: PlanOffer) => {
    setOffer(candidate);
    setWeekday(null);
    setStartsAt(null);
    // One barber offers it (or the barber role): no choice to make, the Barber step lists only those who offer it.
    if (withBarberStep) {
      setBarber(null);
      go("barber");
    } else {
      setBarber(candidate.barbers[0] ?? null);
      go("weekday");
    }
  };

  const create = useMutation({
    mutationFn: () => createRecurrenceForCustomer(supabase, { barberServiceId: barber?.barberServiceId ?? "", customerId: customerId ?? "", startDate: chosen?.localDate ?? "", startTime: chosen?.localTime ?? "", weeks: offer?.weeks ?? 1 }),
    onError: (caught) => {
      setError(errorMessage(caught, t, t("recurrence.sendError")));
      // The time may have just been taken: drop the stale choice, go back to the times and reload them.
      setStartsAt(null);
      setTrail((existing) => existing.slice(0, existing.indexOf("time") + 1));
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-recurring"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
      onCreated();
    },
  });

  const value = offer ? planValue(t, offer.priceCents, offer.weeks) : null;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={t(`recurrence.manual.${step}Title`)} />
            <StepBar
              canSelect={(key) => trail.includes(key as Step)}
              currentKey={step}
              label={t("book.stepOf", { current: flow.indexOf(step) + 1, name: t(`recurrence.manual.steps.${step}`), total: flow.length })}
              onSelect={(key) => setTrail((existing) => existing.slice(0, existing.indexOf(key as Step) + 1))}
              steps={flow.map((key) => ({ key, label: t(`recurrence.manual.steps.${key as Step | "send"}`) }))}
            />

            {step === "customer" ? (
              <>
                <SearchInput label={t("owner.appointmentForm.searchCustomer")} onChangeText={(next) => { setSearch(next); onSearch?.(next); }} placeholder={t("examples.search")} testID="manual-customer-search" value={search} />
                <RadioBlock items={shownCustomers.map((candidate) => ({ key: candidate.id, label: candidate.name, onPress: () => { setCustomerId(candidate.id); go("plan"); }, selected: candidate.id === customerId }))} />
              </>
            ) : null}

            {step === "plan" ? (
              <>
                {plansLoading ? <SkeletonBlock height={72} width={320} /> : null}
                {!plansLoading && offers.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("recurrence.noPlansShop")}</Text> : null}
                {offers.map((candidate) => {
                  const amount = planValue(t, candidate.priceCents, candidate.weeks);

                  return (
                    <PlanCard
                      amountText={formatPriceBRL(amount.amountCents)}
                      caption={amount.caption}
                      key={candidate.planId}
                      normalText={t("recurrence.normalPrice", { price: formatPriceBRL(candidate.normalCents) })}
                      onPress={() => choosePlan(candidate)}
                      periodicity={recurrenceLabel(t, candidate.weeks)}
                      testID={`offer-${candidate.planId}`}
                      title={candidate.name}
                    />
                  );
                })}
              </>
            ) : null}

            {step === "barber" && offer ? (
              offer.barbers.map((item) => (
                <BarberCard avatarUrl={item.avatarUrl} key={item.barberId} name={item.barberName} onPress={() => { setBarber(item); setWeekday(null); setStartsAt(null); go("weekday"); }} testID={`offer-barber-${item.barberId}`} />
              ))
            ) : null}

            {step === "weekday" ? (
              <WeekdayList dates={dates} disabledDays={disabledDays} onSelect={(day) => { setWeekday(day); setStartsAt(null); go("time"); }} selectedDay={weekday} />
            ) : null}

            {step === "time" && weekday ? (
              <>
                <Text className="text-sm font-sans text-neutral-600">{t("recurrence.everyWeekday", { weekday: weekdayName })} · {t("recurrence.startsOn", { date: formatDateNumeric(dates[weekday], language) })}</Text>
                {weekdaySlots[weekday - 1].isLoading ? <SkeletonBlock height={56} width={320} /> : null}
                {weekdaySlots[weekday - 1].isSuccess && slots.length === 0 ? <EmptyState title={t("recurrence.noTimesWeekday")} /> : null}
                {slotRows.length > 0 ? (
                  <TimeSlotPicker onSelectSlot={(time) => setStartsAt(slots.find((slot: AvailableSlot) => slot.localTime.slice(0, 5) === time)?.startsAt ?? null)} slots={slotRows} />
                ) : null}
                <Button disabled={!startsAt} label={t("book.continue")} onPress={() => go("review")} size="lg" testID="manual-continue" />
              </>
            ) : null}

            {step === "review" && offer && barber && chosen && value ? (
              <>
                <Card testID="manual-summary">
                  <View className="gap-2">
                    <PlanSummary amountText={formatPriceBRL(value.amountCents)} caption={value.caption} normalText={t("recurrence.normalPrice", { price: formatPriceBRL(offer.normalCents) })} periodicity={recurrenceLabel(t, offer.weeks)} title={offer.name} />
                    <Text className="text-sm font-sans text-neutral-700">{customer?.name}</Text>
                    <Text className="text-sm font-sans text-neutral-700">{barber.barberName}</Text>
                    <Text className="text-sm font-sans text-neutral-700">{t("recurrence.everyWeekday", { weekday: weekdayName })}</Text>
                    <Text className="text-sm font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>{t("recurrence.startsOn", { date: formatDateNumeric(chosen.localDate, language) })} · {chosen.localTime}</Text>
                  </View>
                </Card>
                <Button disabled={create.isPending} label={t("owner.recurring.create")} onPress={() => create.mutate()} size="lg" testID="manual-recurrence-save" />
              </>
            ) : null}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
