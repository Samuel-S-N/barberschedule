import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
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
import { Input } from "../../src/components/ui/Input";
import { DateInput } from "../../src/components/ui/MaskedInputs";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import { listMonthlyCustomers } from "../../src/features/customers/monthly-api";
import { fourWeekTotalCents, recurrenceLabelKey } from "../../src/features/recurrence/pricing";
import type { RecurrenceWeeks } from "../../src/features/recurrence/pricing";
import {
  cancelRecurrenceOccurrence,
  endRecurrenceSeries,
  setRecurrenceSeriesActive,
} from "../../src/features/recurrence/api";
import { ManualRecurrenceForm } from "../../src/features/recurrence/ManualRecurrenceForm";
import { RequestCard } from "../../src/features/recurrence/RequestCard";
import { decideRecurrenceRequest, listRecurrencePrices, listRecurrenceRequests, setRecurrencePrice } from "../../src/features/recurrence/requests-api";
import type { RecurrenceSeries } from "../../src/features/recurrence/types";
import { listOwnerBarberServices, listOwnerServices } from "../../src/features/services/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

type Tab = "active" | "prices" | "requests";
const WEEKS: RecurrenceWeeks[] = [1, 2];

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
  const [manualOpen, setManualOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [occurrenceDate, setOccurrenceDate] = useState(today);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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

      return {
        barberServices: barberServices.filter((item) => item.active),
        barbers,
        customers: customers.filter((customer) => customer.active),
        series,
        services,
      };
    },
    queryKey: ["owner-recurring", shopId],
  });
  const requests = useQuery({ enabled: shopId !== null, queryFn: () => listRecurrenceRequests(supabase, shopId ?? ""), queryKey: ["owner-recurrence-requests", shopId] });
  useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const rows = await listRecurrencePrices(supabase, shopId ?? "");

      setDrafts(Object.fromEntries(rows.map((row) => [`${row.serviceId}:${row.weeks}`, centsToReaisInput(row.priceCents)])));

      return rows;
    },
    queryKey: ["owner-recurrence-prices", shopId],
  });

  // Service choices are labelled "Barber · Service"; the same label names the service on each series.
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of data.data?.barberServices ?? []) {
      const barber = data.data?.barbers.find((candidate: OwnerBarber) => candidate.id === item.barberId);
      const service = data.data?.services.find((candidate) => candidate.id === item.serviceId);
      if (barber && service) map.set(item.id, `${barber.name} · ${service.name}`);
    }

    return map;
  }, [data.data]);

  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-recurring"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
  };

  const decide = useMutation({
    mutationFn: (input: { accept: boolean; id: string }) => decideRecurrenceRequest(supabase, input.id, input.accept),
    onError: (error) => fail(error, t("recurrence.decideError")),
    onSuccess: refresh,
  });

  const change = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onError: (error) => fail(error, t("owner.recurring.updateError")),
    onSuccess: refresh,
  });

  const savePrices = useMutation({
    mutationFn: async (serviceId: string) => {
      for (const weeks of WEEKS) {
        const text = (drafts[`${serviceId}:${weeks}`] ?? "").trim();
        const cents = text === "" ? null : parseReaisToCents(text);

        if (text !== "" && cents === null) throw Object.assign(new Error("invalid"), { code: "P0032" });
        await setRecurrencePrice(supabase, serviceId, weeks, cents);
      }
    },
    onError: (error) => fail(error, t("owner.recurring.validation")),
    onSuccess: () => {
      setFeedback({ message: t("recurrence.priceSaved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-prices"] });
    },
  });

  const busy = decide.isPending || change.isPending || savePrices.isPending;
  const loading = shop.isLoading || data.isLoading;
  const loadError = shop.error ?? data.error;
  const services = (data.data?.services ?? []).filter((service) => service.active);
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
              {tabButton("prices", t("recurrence.pricesTab"))}
            </View>

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.recurring.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            {tab === "requests" ? (
              <>
                {requests.data && requests.data.length === 0 ? <EmptyState title={t("recurrence.noRequests")} /> : null}
                {(requests.data ?? []).map((request) => (
                  <RequestCard busy={busy} key={request.id} onDecide={(accept) => decide.mutate({ accept, id: request.id })} request={request} />
                ))}
              </>
            ) : null}

            {tab === "prices" ? (
              <>
                <Text className="text-sm font-sans text-neutral-600">{t("recurrence.priceHint")}</Text>
                {services.map((service) => (
                  <Card key={service.id} testID={`price-row-${service.id}`} variant="outlined">
                    <View className="gap-2">
                      <Text className="text-base font-sans-semibold text-ink">{service.name} · {formatPriceBRL(service.priceCents)}</Text>
                      {WEEKS.map((weeks) => {
                        const text = drafts[`${service.id}:${weeks}`] ?? "";
                        const cents = text.trim() === "" ? null : parseReaisToCents(text);

                        return (
                          <View key={weeks}>
                            <Input
                              keyboardType="numeric"
                              label={t("recurrence.priceLabel", { frequency: t(recurrenceLabelKey(weeks)) })}
                              onChangeText={(value) => setDrafts((current) => ({ ...current, [`${service.id}:${weeks}`]: value }))}
                              placeholder={t("examples.money")} testID={`price-${service.id}-${weeks}`}
                              value={text}
                            />
                            {cents !== null ? (
                              <Text className="pt-1 text-xs font-sans text-neutral-600" testID={`price-total-${service.id}-${weeks}`}>
                                {t("recurrence.fourWeeks", { count: 4 / weeks, total: formatPriceBRL(fourWeekTotalCents(cents, weeks)) })}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                      <Button disabled={busy} label={t("recurrence.savePrice")} onPress={() => savePrices.mutate(service.id)} size="sm" testID={`price-save-${service.id}`} />
                    </View>
                  </Card>
                ))}
              </>
            ) : null}

            {tab === "active" ? (
              <>
                <Button label={t("recurrence.addManual")} onPress={() => setManualOpen((open) => !open)} size="sm" testID="recurring-manual" variant="outline" />
                {manualOpen ? (
                  <ManualRecurrenceForm
                    customers={(data.data?.customers ?? []).map((customer) => ({ id: customer.id, name: customer.fullName }))}
                    onCreated={() => {
                      setManualOpen(false);
                      setFeedback({ message: t("owner.recurring.saved"), variant: "success" });
                    }}
                    services={[...labels.entries()].map(([barberServiceId, label]) => ({ barberServiceId, label }))}
                  />
                ) : null}
                <DateInput label={t("owner.recurring.occurrenceLabel")} onChangeValue={setOccurrenceDate} testID="recurrence-occurrence-date" value={occurrenceDate} />
                {(data.data?.series ?? []).map((item: RecurrenceSeries) => (
                  <Card key={item.id} testID={`series-${item.id}`} variant="outlined">
                    <View className="gap-2">
                      <Text className="text-base font-sans-semibold text-ink">{item.customerName || item.customerId} · {t(recurrenceLabelKey(item.intervalWeeks))}</Text>
                      {labels.get(item.barberServiceId) ? <Text className="text-sm font-sans text-neutral-600">{labels.get(item.barberServiceId)}</Text> : null}
                      <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                        {t("owner.recurring.detail", {
                          date: formatDateNumeric(item.localStartDate, language),
                          price: item.specialPriceCents === null ? t("owner.recurring.catalogPrice") : formatPriceBRL(item.specialPriceCents),
                          state: item.active ? t("owner.recurring.active") : t("owner.recurring.inactive"),
                          time: item.localStartTime,
                        })}
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {item.active ? <Button disabled={busy} label={t("common.deactivate")} onPress={() => change.mutate(() => setRecurrenceSeriesActive(supabase, item.id, false))} size="sm" testID={`series-deactivate-${item.id}`} variant="outline" /> : null}
                        <Button disabled={busy} label={t("owner.recurring.cancelOccurrence")} onPress={() => change.mutate(() => cancelRecurrenceOccurrence(supabase, item.id, occurrenceDate))} size="sm" testID={`series-cancel-${item.id}`} variant="outline" />
                        <Button disabled={busy || !item.active} label={t("owner.recurring.endSeries")} onPress={() => change.mutate(() => endRecurrenceSeries(supabase, item.id))} size="sm" testID={`series-end-${item.id}`} variant="danger" />
                      </View>
                    </View>
                  </Card>
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
