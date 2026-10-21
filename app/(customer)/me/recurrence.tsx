import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { BarberCard } from "../../../src/components/domain/BarberCard";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { MonthCalendar } from "../../../src/components/domain/MonthCalendar";
import { RadioBlock } from "../../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { ServiceCard, formatPriceBRL } from "../../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { getAvailableSlotsQueryOptions } from "../../../src/features/availability/query";
import type { AvailableSlot } from "../../../src/features/availability/types";
import { listPublicBarbers } from "../../../src/features/barbers/api";
import { fourWeekTotalCents, recurrenceLabelKey, sessionsPer4Weeks } from "../../../src/features/recurrence/pricing";
import type { RecurrenceWeeks } from "../../../src/features/recurrence/pricing";
import { cancelMyRecurrenceRequest, getRecurrenceQuote, listMyRecurrenceRequests, requestRecurrence } from "../../../src/features/recurrence/requests-api";
import { useBarberServices } from "../../../src/features/services/use-barber-services";
import { listPublicShops } from "../../../src/features/shops/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../../src/lib/i18n/format";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useNow } from "../../../src/lib/use-now";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Step = "barber" | "frequency" | "list" | "service" | "when";

// The customer asks for a fixed recurrence; the chosen barber or the owner answers.
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
  const [barberServiceId, setBarberServiceId] = useState("");
  const [weeks, setWeeks] = useState<RecurrenceWeeks>(1);
  const [picked, setPicked] = useState(today);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const localDate = picked < today ? today : picked;
  const go = (next: Step) => setTrail((current) => [...current, next]);
  const goBack = () => (trail.length > 1 ? setTrail((current) => current.slice(0, -1)) : back());

  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shopId = shops.data?.[0]?.id ?? "";
  const barbers = useQuery({ enabled: Boolean(shopId), queryFn: () => listPublicBarbers(supabase, shopId), queryKey: ["public-barbers", shopId] });
  const services = useBarberServices(barberId);
  const requests = useQuery({ queryFn: () => listMyRecurrenceRequests(supabase), queryKey: ["my-recurrence-requests"] });
  const quote = useQuery({ enabled: Boolean(barberServiceId), queryFn: () => getRecurrenceQuote(supabase, barberServiceId), queryKey: ["recurrence-quote", barberServiceId] });
  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: step === "when" && Boolean(barberId && barberServiceId),
  });

  const priceText = (item: { normalCents: number; recurrenceCents: number | null; weeks: RecurrenceWeeks }) =>
    item.recurrenceCents !== null
      ? `${t("recurrence.perSession", { price: formatPriceBRL(item.recurrenceCents) })} · ${t("recurrence.fourWeeks", { count: sessionsPer4Weeks(item.weeks), total: formatPriceBRL(fourWeekTotalCents(item.recurrenceCents, item.weeks)) })} · ${t("recurrence.normalPrice", { price: formatPriceBRL(item.normalCents) })}`
      : t("recurrence.normalPrice", { price: formatPriceBRL(item.normalCents) });

  const send = useMutation({
    mutationFn: () => {
      const local = formatInstantInShopTime(new Date(startsAt ?? ""));

      return requestRecurrence(supabase, { barberServiceId, startDate: local.localDate, startTime: local.localTime, weeks });
    },
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

  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({ status: slot.startsAt === startsAt ? "selected" : "free", time: slot.localTime }));
  const slotStillFree = Boolean(startsAt && availability.data?.some((slot: AvailableSlot) => slot.startsAt === startsAt));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={t("recurrence.title")} />

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
                        {t(recurrenceLabelKey(request.weeks))} · {formatDateNumeric(request.startDate, language)} {request.startTime}
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
                  <BarberCard avatarUrl={barber.avatarUrl} key={barber.id} name={barber.name} onPress={() => { setBarberId(barber.id); go("service"); }} testID={`barber-card-${barber.id}`} />
                ))}
              </>
            ) : null}

            {step === "service" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseService")}</Text>
                {(services.data ?? []).map((service) => (
                  <ServiceCard
                    durationMinutes={service.durationMinutes}
                    key={service.barberServiceId}
                    name={service.name ?? t("book.fallbackService")}
                    onPress={() => { setBarberServiceId(service.barberServiceId); go("frequency"); }}
                    priceCents={service.priceCents}
                    testID={`service-card-${service.barberServiceId}`}
                  />
                ))}
              </>
            ) : null}

            {step === "frequency" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseFrequency")}</Text>
                {quote.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
                <RadioBlock
                  items={(quote.data ?? []).map((item) => ({
                    key: `weeks-${item.weeks}`,
                    label: `${t(recurrenceLabelKey(item.weeks))} — ${priceText(item)}`,
                    onPress: () => setWeeks(item.weeks),
                    selected: item.weeks === weeks,
                  }))}
                />
                <Button disabled={!quote.data} label={t("book.continue")} onPress={() => go("when")} testID="recurrence-frequency-continue" />
              </>
            ) : null}

            {step === "when" ? (
              <>
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.chooseFirst")}</Text>
                <MonthCalendar onSelectDate={(date) => { setPicked(date); setStartsAt(null); }} selectedDate={localDate} today={today} />
                {availability.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
                {!availability.isLoading && slots.length === 0 ? <EmptyState title={t("book.noTimes")} /> : null}
                {slots.length > 0 ? <TimeSlotPicker onSelectSlot={(time) => setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime === time)?.startsAt ?? null)} slots={slots} /> : null}
                <Button disabled={!slotStillFree || send.isPending} label={t("recurrence.send")} onPress={() => send.mutate()} testID="recurrence-send" />
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
