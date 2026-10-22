import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { DateInput } from "../../src/components/ui/MaskedInputs";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import { listMonthlyCustomers } from "../../src/features/customers/monthly-api";
import { cancelRecurrenceOccurrence, endRecurrenceSeries, reactivateRecurrenceSeries, setRecurrenceSeriesActive } from "../../src/features/recurrence/api";
import { recurrenceLabel } from "../../src/features/recurrence/pricing";
import { CancellationCard } from "../../src/features/recurrence/CancellationCard";
import { RequestCard } from "../../src/features/recurrence/RequestCard";
import { decideRecurrenceRequest, decideSeriesCancellation, listCancellationRequests, listRecurrenceRequests } from "../../src/features/recurrence/requests-api";
import type { RecurrenceSeries } from "../../src/features/recurrence/types";
import { listOwnerBarberServices, listOwnerServices } from "../../src/features/services/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { useBack } from "../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type Tab = "active" | "requests";

export default function MonthlyCustomersScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const today = formatInstantInShopTime(new Date()).localDate;
  const [tab, setTab] = useState<Tab>("requests");
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  // Coming back from the manual recurrence steps after creating the plan: confirm it here, once.
  useEffect(() => {
    if (!created) return;
    setTab("active");
    setFeedback({ message: t("owner.recurring.saved"), variant: "success" });
    router.setParams({ created: undefined });
  }, [created]);
  const [occurrenceDate, setOccurrenceDate] = useState(today);

  const data = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const id = shopId ?? "";
      const [customers, barberServices, barbers, services, series] = await Promise.all([
        listOwnerCustomers(supabase, id),
        listOwnerBarberServices(supabase, id),
        listOwnerBarbers(supabase, id),
        listOwnerServices(supabase, id),
        listMonthlyCustomers(supabase, id),
      ]);

      return { barberServices: barberServices.filter((item) => item.active), barbers, customers: customers.filter((customer) => customer.active), series, services };
    },
    queryKey: ["owner-recurring", shopId],
  });
  const requests = useQuery({ enabled: shopId !== null, queryFn: () => listRecurrenceRequests(supabase, shopId ?? ""), queryKey: ["owner-recurrence-requests", shopId] });
  const cancellations = useQuery({ enabled: shopId !== null, queryFn: () => listCancellationRequests(supabase, shopId ?? ""), queryKey: ["owner-recurrence-cancellations", shopId] });

  // Service choices are labelled "Barber · Service"; the same label names the service on each series.
  const labels = useMemo(() => {
    const map = new Map<string, { barberId: string; label: string }>();
    for (const item of data.data?.barberServices ?? []) {
      const barber = data.data?.barbers.find((candidate: OwnerBarber) => candidate.id === item.barberId);
      const service = data.data?.services.find((candidate) => candidate.id === item.serviceId);
      if (barber && service) map.set(item.id, { barberId: barber.id, label: `${barber.name} · ${service.name}` });
    }

    return map;
  }, [data.data]);

  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-recurring"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-cancellations"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
  };

  const decide = useMutation({
    mutationFn: (input: { accept: boolean; id: string }) => decideRecurrenceRequest(supabase, input.id, input.accept),
    onError: (error) => fail(error, t("recurrence.decideError")),
    onSuccess: refresh,
  });
  const decideCancel = useMutation({
    mutationFn: (input: { accept: boolean; seriesId: string }) => decideSeriesCancellation(supabase, input.seriesId, input.accept),
    onError: (error) => fail(error, t("recurrence.decideError")),
    onSuccess: (_data, input) => {
      setFeedback({ message: t(input.accept ? "recurrence.cancellationAccepted" : "recurrence.cancellationDeclined"), variant: "success" });
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onError: (error) => fail(error, t("owner.recurring.updateError")),
    onSuccess: refresh,
  });

  const activeSeries = (data.data?.series ?? []).filter((item: RecurrenceSeries) => item.endedAt === null);
  const endedSeries = (data.data?.series ?? []).filter((item: RecurrenceSeries) => item.endedAt !== null);
  const busy = decide.isPending || change.isPending || decideCancel.isPending;
  const loading = shop.isLoading || data.isLoading;
  const loadError = shop.error ?? data.error;
  const tabButton = (key: Tab, label: string) => (
    <Button key={key} label={label} onPress={() => setTab(key)} size="sm" testID={`recurring-tab-${key}`} variant={tab === key ? "dark" : "outline"} />
  );

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.recurring.title")} />
            <Button label={t("owner.recurring.conflictsLink")} onPress={() => router.push("/recurrence-conflicts")} size="sm" testID="recurrence-conflicts-link" variant="outline" />
            <View className="flex-row gap-2">
              {tabButton("requests", t("recurrence.requestsTab"))}
              {tabButton("active", t("recurrence.activeTab"))}
            </View>

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.recurring.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            {tab === "requests" ? (
              <>
                {requests.data && requests.data.length === 0 && (cancellations.data ?? []).length === 0 ? <EmptyState title={t("recurrence.noRequests")} /> : null}
                {(requests.data ?? []).map((request) => (
                  <RequestCard busy={busy} key={request.id} onDecide={(accept) => decide.mutate({ accept, id: request.id })} request={request} />
                ))}
                {(cancellations.data ?? []).length > 0 ? (
                  <View className="gap-3">
                    <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.cancellationTitle")}</Text>
                    {(cancellations.data ?? []).map((request) => (
                      <CancellationCard busy={busy} key={request.seriesId} onDecide={(accept) => decideCancel.mutate({ accept, seriesId: request.seriesId })} request={request} />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}

            {tab === "active" ? (
              <>
                <Button label={t("recurrence.addManual")} onPress={() => router.push("/recurrence-manual")} size="sm" testID="recurring-manual" variant="outline" />
                <DateInput label={t("owner.recurring.occurrenceLabel")} onChangeValue={setOccurrenceDate} testID="recurrence-occurrence-date" value={occurrenceDate} />
                {[
                  { items: activeSeries, key: "active", title: t("owner.recurring.activeSection") },
                  { items: endedSeries, key: "ended", title: t("owner.recurring.endedSection") },
                ].map((group) => (
                  group.items.length > 0 ? (
                    <View className="gap-3" key={group.key}>
                      <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{group.title}</Text>
                      {group.items.map((item: RecurrenceSeries) => (
                      <Card key={item.id} testID={`series-${item.id}`} variant="outlined">
                        <View className={`gap-2 ${item.endedAt !== null ? "opacity-70" : ""}`}>
                          <Text className="text-base font-sans-semibold text-ink">{item.customerName || item.customerId} · {recurrenceLabel(t, item.intervalWeeks)}</Text>
                          {labels.get(item.barberServiceId) ? <Text className="text-sm font-sans text-neutral-600">{labels.get(item.barberServiceId)?.label}</Text> : null}
                          <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                            {t("owner.recurring.detail", {
                              date: formatDateNumeric(item.localStartDate, language),
                              price: item.specialPriceCents === null ? t("owner.recurring.catalogPrice") : formatPriceBRL(item.specialPriceCents),
                              state: item.endedAt !== null ? t("owner.recurring.endedBadge") : item.active ? t("owner.recurring.active") : t("owner.recurring.inactive"),
                              time: item.localStartTime,
                            })}
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {item.endedAt !== null ? (
                              <Button
                                disabled={busy}
                                label={t("owner.recurring.reactivate")}
                                onPress={() => change.mutate(async () => {
                                  await reactivateRecurrenceSeries(supabase, item.id);
                                  setFeedback({ message: t("owner.recurring.reactivated"), variant: "success" });
                                })}
                                size="sm"
                                testID={`series-reactivate-${item.id}`}
                              />
                            ) : (
                              <>
                                {item.active ? <Button disabled={busy} label={t("common.deactivate")} onPress={() => change.mutate(() => setRecurrenceSeriesActive(supabase, item.id, false))} size="sm" testID={`series-deactivate-${item.id}`} variant="outline" /> : null}
                                <Button disabled={busy} label={t("owner.recurring.cancelOccurrence")} onPress={() => change.mutate(() => cancelRecurrenceOccurrence(supabase, item.id, occurrenceDate))} size="sm" testID={`series-cancel-${item.id}`} variant="outline" />
                                <Button disabled={busy || !item.active} label={t("owner.recurring.endSeries")} onPress={() => change.mutate(() => endRecurrenceSeries(supabase, item.id))} size="sm" testID={`series-end-${item.id}`} variant="danger" />
                              </>
                            )}
                          </View>
                        </View>
                      </Card>

                      ))}
                    </View>
                  ) : null
                ))}
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
