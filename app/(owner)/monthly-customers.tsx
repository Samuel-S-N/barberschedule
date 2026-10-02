import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { RadioBlock } from "../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import { listMonthlyCustomers } from "../../src/features/customers/monthly-api";
import {
  cancelRecurrenceOccurrence,
  createRecurrenceSeries,
  editRecurrenceSeries,
  endRecurrenceSeries,
  ensureRecurrenceWindow,
  setRecurrenceSeriesActive,
} from "../../src/features/recurrence/api";
import type { RecurrenceSeries } from "../../src/features/recurrence/types";
import { listOwnerBarberServices, listOwnerServices } from "../../src/features/services/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function MonthlyCustomersScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const today = formatInstantInShopTime(new Date()).localDate;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [editing, setEditing] = useState<RecurrenceSeries | null>(null);
  const [intervalWeeks, setIntervalWeeks] = useState("4");
  const [localStartDate, setLocalStartDate] = useState(today);
  const [localStartTime, setLocalStartTime] = useState("09:00");
  const [occurrenceDate, setOccurrenceDate] = useState(today);
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBarberServiceId, setSelectedBarberServiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

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
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-recurring"] });

  const resetForm = () => {
    setEditing(null);
    setIntervalWeeks("4");
    setLocalStartDate(today);
    setLocalStartTime("09:00");
    setPrice("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const interval = Number(intervalWeeks);
      const specialPrice = price.trim() === "" ? null : parseReaisToCents(price);
      if (!shopId || !Number.isInteger(interval) || interval <= 0 || (price.trim() !== "" && specialPrice === null)) throw new Error("validation");
      if (!editing && (!selectedCustomerId || !selectedBarberServiceId)) throw new Error("choose");

      if (editing) {
        await editRecurrenceSeries(supabase, editing.id, { endsOn: editing.endsOn, intervalWeeks: interval, localStartTime, specialPriceCents: specialPrice });
      } else {
        await createRecurrenceSeries(supabase, { barberServiceId: selectedBarberServiceId ?? "", customerId: selectedCustomerId ?? "", intervalWeeks: interval, localStartDate, localStartTime, specialPriceCents: specialPrice });
      }
      await ensureRecurrenceWindow(supabase, shopId, addDays(today, 90));
    },
    onError: (error) =>
      error instanceof Error && error.message === "validation"
        ? setFeedback({ message: t("owner.recurring.validation"), variant: "error" })
        : error instanceof Error && error.message === "choose"
          ? setFeedback({ message: t("owner.recurring.chooseCustomerService"), variant: "error" })
          : fail(error, t("owner.recurring.saveError")),
    onSuccess: () => {
      setFeedback({ message: editing ? t("owner.recurring.updated") : t("owner.recurring.saved"), variant: "success" });
      resetForm();
      void refresh();
    },
  });

  const change = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onError: (error) => fail(error, t("owner.recurring.updateError")),
    onSuccess: () => void refresh(),
  });

  const startEdit = (item: RecurrenceSeries) => {
    setEditing(item);
    setIntervalWeeks(String(item.intervalWeeks));
    setLocalStartTime(item.localStartTime);
    setPrice(item.specialPriceCents === null ? "" : centsToReaisInput(item.specialPriceCents));
  };

  const term = search.trim().toLowerCase();
  const customers = (data.data?.customers ?? []).filter((customer) => !term || customer.fullName.toLowerCase().includes(term));
  const busy = save.isPending || change.isPending;
  const loading = shop.isLoading || data.isLoading;
  const loadError = shop.error ?? data.error;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.recurring.title")} />
            <Text className="text-sm font-sans text-neutral-600">{t("owner.recurring.note")}</Text>
            <Button label={t("owner.recurring.conflictsLink")} onPress={() => router.push("/recurrence-conflicts")} size="sm" testID="recurrence-conflicts-link" variant="outline" />

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.recurring.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            <Card>
              <View className="gap-3">
                {editing ? (
                  <Text className="text-sm font-sans text-neutral-600">{t("owner.recurring.editing", { name: editing.customerName || t("owner.recurring.thisCustomer") })}</Text>
                ) : (
                  <>
                    <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("common.customer")}</Text>
                    <Input label={t("owner.appointmentForm.searchCustomer")} onChangeText={setSearch} testID="recurrence-customer-search" value={search} />
                    <ScrollView className="max-h-[220px]" nestedScrollEnabled>
                      <RadioBlock items={customers.map((customer) => ({ key: customer.id, label: customer.fullName, onPress: () => setSelectedCustomerId(customer.id), selected: customer.id === selectedCustomerId }))} />
                    </ScrollView>
                    <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("common.service")}</Text>
                    <RadioBlock items={[...labels.entries()].map(([id, label]) => ({ key: id, label, onPress: () => setSelectedBarberServiceId(id), selected: id === selectedBarberServiceId }))} />
                    <Input label={t("owner.recurring.startDateLabel")} onChangeText={setLocalStartDate} testID="recurrence-start-date" value={localStartDate} />
                  </>
                )}
                <Input keyboardType="number-pad" label={t("owner.recurring.intervalLabel")} onChangeText={setIntervalWeeks} testID="recurrence-interval" value={intervalWeeks} />
                <Input label={t("owner.recurring.timeLabel")} onChangeText={setLocalStartTime} testID="recurrence-time" value={localStartTime} />
                <Input keyboardType="numeric" label={t("owner.recurring.specialPriceLabel")} onChangeText={setPrice} testID="recurrence-price" value={price} />
                <View className="flex-row gap-2">
                  <Button disabled={busy || loading} label={editing ? t("owner.recurring.saveEdit") : t("owner.recurring.create")} onPress={() => save.mutate()} testID="recurrence-save" />
                  {editing ? <Button disabled={busy} label={t("common.cancelEdit")} onPress={resetForm} variant="outline" /> : null}
                </View>
              </View>
            </Card>

            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("owner.recurring.series")}</Text>
            <Input label={t("owner.recurring.occurrenceLabel")} onChangeText={setOccurrenceDate} testID="recurrence-occurrence-date" value={occurrenceDate} />
            {(data.data?.series ?? []).map((item: RecurrenceSeries) => (
              <Card key={item.id} testID={`series-${item.id}`} variant="outlined">
                <View className="gap-2">
                  <Text className="text-base font-sans-semibold text-ink">{t("owner.recurring.everyWeeks", { count: item.intervalWeeks, customer: item.customerName || item.customerId })}</Text>
                  {labels.get(item.barberServiceId) ? <Text className="text-sm font-sans text-neutral-600">{labels.get(item.barberServiceId)}</Text> : null}
                  <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                    {t("owner.recurring.detail", {
                      date: item.localStartDate,
                      price: item.specialPriceCents === null ? t("owner.recurring.catalogPrice") : formatPriceBRL(item.specialPriceCents),
                      state: item.active ? t("owner.recurring.active") : t("owner.recurring.inactive"),
                      time: item.localStartTime,
                    })}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Button disabled={busy} label={t("common.edit")} onPress={() => startEdit(item)} size="sm" testID={`series-edit-${item.id}`} variant="outline" />
                    {item.active ? <Button disabled={busy} label={t("common.deactivate")} onPress={() => change.mutate(() => setRecurrenceSeriesActive(supabase, item.id, false))} size="sm" testID={`series-deactivate-${item.id}`} variant="outline" /> : null}
                    <Button disabled={busy} label={t("owner.recurring.cancelOccurrence")} onPress={() => change.mutate(() => cancelRecurrenceOccurrence(supabase, item.id, occurrenceDate))} size="sm" testID={`series-cancel-${item.id}`} variant="outline" />
                    <Button disabled={busy || !item.active} label={t("owner.recurring.endSeries")} onPress={() => change.mutate(() => endRecurrenceSeries(supabase, item.id))} size="sm" testID={`series-end-${item.id}`} variant="danger" />
                  </View>
                </View>
              </Card>
            ))}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
