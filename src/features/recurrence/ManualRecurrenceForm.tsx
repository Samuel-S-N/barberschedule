import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { RadioBlock } from "../../components/domain/RadioBlock";
import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DateInput, TimeInput } from "../../components/ui/MaskedInputs";
import { SearchInput } from "../../components/ui/SearchInput";
import { errorMessage } from "../../i18n/errors";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { useSupabaseSession } from "../../providers/AppProviders";
import { fourWeekTotalCents, recurrenceLabelKey, sessionsPer4Weeks } from "./pricing";
import type { RecurrenceWeeks } from "./pricing";
import { createRecurrenceForCustomer, getRecurrenceQuote } from "./requests-api";

type Props = {
  customers: { id: string; name: string }[];
  onCreated: () => void;
  onSearch?: (term: string) => void;
  services: { barberServiceId: string; label: string }[];
};

// Staff-created recurring series, for customers who cannot send a request (no account). The price comes from the price table.
export function ManualRecurrenceForm({ customers, onCreated, onSearch, services }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [barberServiceId, setBarberServiceId] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<RecurrenceWeeks>(1);
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);

  const quote = useQuery({
    enabled: barberServiceId !== null,
    queryFn: () => getRecurrenceQuote(supabase, barberServiceId ?? ""),
    queryKey: ["recurrence-quote", barberServiceId],
  });
  const current = quote.data?.find((item) => item.weeks === weeks);

  const term = search.trim().toLowerCase();
  const shown = customers.filter((customer) => !term || customer.name.toLowerCase().includes(term));
  const valid = customerId !== null && barberServiceId !== null && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);

  const create = useMutation({
    mutationFn: () => createRecurrenceForCustomer(supabase, { barberServiceId: barberServiceId ?? "", customerId: customerId ?? "", startDate, startTime, weeks }),
    onError: (caught) => setError(errorMessage(caught, t, t("recurrence.sendError"))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-recurring"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
      onCreated();
    },
  });

  return (
    <Card testID="manual-recurrence">
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("recurrence.manualCustomer")}</Text>
        <SearchInput label={t("owner.appointmentForm.searchCustomer")} onChangeText={(value) => { setSearch(value); onSearch?.(value); }} placeholder={t("examples.search")} testID="manual-customer-search" value={search} />
        <ScrollView className="max-h-[220px]" nestedScrollEnabled>
          <RadioBlock items={shown.map((customer) => ({ key: `customer-${customer.id}`, label: customer.name, onPress: () => setCustomerId(customer.id), selected: customer.id === customerId }))} />
        </ScrollView>
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("recurrence.manualService")}</Text>
        <RadioBlock items={services.map((service) => ({ key: `service-${service.barberServiceId}`, label: service.label, onPress: () => setBarberServiceId(service.barberServiceId), selected: service.barberServiceId === barberServiceId }))} />
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("recurrence.chooseFrequency")}</Text>
        <RadioBlock items={([1, 2] as const).map((value) => ({ key: `weeks-${value}`, label: t(recurrenceLabelKey(value)), onPress: () => setWeeks(value), selected: value === weeks }))} />
        {current ? (
          <Text className="text-sm font-sans-medium text-ink" testID="manual-recurrence-price">
            {current.recurrenceCents !== null
              ? `${t("recurrence.perSession", { price: formatPriceBRL(current.recurrenceCents) })} · ${t("recurrence.fourWeeks", { count: sessionsPer4Weeks(weeks), total: formatPriceBRL(fourWeekTotalCents(current.recurrenceCents, weeks)) })}`
              : t("recurrence.normalPrice", { price: formatPriceBRL(current.normalCents) })}
          </Text>
        ) : null}
        <View className="flex-row items-end gap-2">
          <View className="flex-1"><DateInput label={t("owner.recurring.startDateLabel")} onChangeValue={setStartDate} testID="manual-recurrence-date" value={startDate} /></View>
          <View className="flex-1"><TimeInput label={t("owner.recurring.timeLabel")} onChangeValue={setStartTime} testID="manual-recurrence-time" value={startTime} /></View>
        </View>
        {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
        <Button disabled={!valid || create.isPending} label={t("owner.recurring.create")} onPress={() => create.mutate()} testID="manual-recurrence-save" />
      </View>
    </Card>
  );
}
