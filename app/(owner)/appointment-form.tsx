import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { RadioBlock } from "../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { StepBar } from "../../src/components/domain/StepBar";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { bookOwnerAppointment } from "../../src/features/appointments/owner-api";
import { DateStep, TimeStep } from "../../src/features/availability/steps";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import { listOwnerBarberServices, listOwnerServices } from "../../src/features/services/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";


type Step = "customer" | "date" | "review" | "service" | "time";
const FLOW = ["customer", "service", "date", "time", "review", "confirm"] as const;

// The owner books for a customer with the same steps as every booking: customer › service › date › time › review › create.
export default function OwnerAppointmentFormScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const back = useBack();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const today = formatInstantInShopTime(new Date()).localDate;
  const [trail, setTrail] = useState<Step[]>(["customer"]);
  const step = trail[trail.length - 1];
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [localDate, setLocalDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBarberServiceId, setSelectedBarberServiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(null);
  const go = (next: Step) => setTrail((existing) => [...existing, next]);
  const goBack = () => (trail.length > 1 ? setTrail((existing) => existing.slice(0, -1)) : back());

  const catalog = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const id = shopId ?? "";
      const [barbers, barberServices, customers, services] = await Promise.all([
        listOwnerBarbers(supabase, id),
        listOwnerBarberServices(supabase, id),
        listOwnerCustomers(supabase, id),
        listOwnerServices(supabase, id),
      ]);

      return {
        barberServices: barberServices.filter((item) => item.active),
        barbers: barbers.filter((barber: OwnerBarber) => barber.active),
        customers: customers.filter((customer) => customer.active),
        services: services.filter((service) => service.active),
      };
    },
    queryKey: ["owner-appointment-form", shopId],
  });

  const choices = useMemo(() => {
    const data = catalog.data;
    if (!data) return [];

    return data.barberServices
      .map((barberService) => ({
        barber: data.barbers.find((barber: OwnerBarber) => barber.id === barberService.barberId),
        barberService,
        service: data.services.find((service) => service.id === barberService.serviceId),
      }))
      .filter((choice) => choice.barber && choice.service);
  }, [catalog.data]);

  const term = search.trim().toLowerCase();
  const customers = (catalog.data?.customers ?? []).filter((customer) => !term || customer.fullName.toLowerCase().includes(term) || (customer.email ?? "").toLowerCase().includes(term));
  const customer = catalog.data?.customers.find((candidate) => candidate.id === selectedCustomerId) ?? null;
  const choice = choices.find((candidate) => candidate.barberService.id === selectedBarberServiceId) ?? null;
  const chosen = selectedStartsAt ? formatInstantInShopTime(new Date(selectedStartsAt)) : null;

  const create = useMutation({
    mutationFn: () => {
      if (!selectedBarberServiceId || !selectedCustomerId || !selectedStartsAt) throw new Error("INCOMPLETE");

      return bookOwnerAppointment(supabase, { barberServiceId: selectedBarberServiceId, customerId: selectedCustomerId, notes: notes.trim() || null, startsAt: selectedStartsAt });
    },
    onError: (error) => {
      // The time may have been taken: go back to the times so the next pick is valid, then show why it failed.
      setSelectedStartsAt(null);
      setTrail((existing) => existing.slice(0, existing.indexOf("time") + 1));
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      setFeedback({ message: errorMessage(error, t, t("owner.appointmentForm.createError")), variant: "error" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
      router.navigate({ params: { created: "1" }, pathname: "/agenda" });
    },
  });

  const title = t(`owner.appointmentForm.${step}Title`);

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={goBack} title={title} />
            <StepBar
              canSelect={(key) => trail.includes(key as Step)}
              currentKey={step}
              label={t("book.stepOf", { current: FLOW.indexOf(step) + 1, name: t(`owner.appointmentForm.steps.${step}`), total: FLOW.length })}
              onSelect={(key) => setTrail((existing) => existing.slice(0, existing.indexOf(key as Step) + 1))}
              steps={FLOW.map((key) => ({ key, label: t(`owner.appointmentForm.steps.${key}`) }))}
            />
            {shop.isLoading || catalog.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {shop.error || catalog.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(shop.error ?? catalog.error, t, t("owner.appointmentForm.loadError"))}</Text> : null}
            {shop.data === null ? <Text className="text-sm font-sans text-neutral-600">{t("common.noShop")}</Text> : null}

            {step === "customer" ? (
              <>
                <Input label={t("owner.appointmentForm.searchCustomer")} onChangeText={setSearch} placeholder={t("examples.search")} testID="owner-customer-search" value={search} />
                <RadioBlock
                  items={customers.map((candidate) => ({ key: candidate.id, label: candidate.fullName, onPress: () => { setSelectedCustomerId(candidate.id); go("service"); }, selected: candidate.id === selectedCustomerId }))}
                  testID="owner-customer-list"
                />
              </>
            ) : null}

            {step === "service" ? (
              <RadioBlock
                items={choices.map(({ barber, barberService, service }) => ({
                  key: barberService.id,
                  label: `${barber?.name} · ${service?.name}`,
                  onPress: () => {
                    setSelectedBarberServiceId(barberService.id);
                    setSelectedStartsAt(null);
                    go("date");
                  },
                  selected: barberService.id === selectedBarberServiceId,
                }))}
                testID="owner-service-list"
              />
            ) : null}

            {step === "date" ? (
              <DateStep localDate={localDate} onChange={(date) => { setLocalDate(date); setSelectedStartsAt(null); }} onContinue={() => go("time")} testID="owner-continue" today={today} />
            ) : null}

            {step === "time" && choice ? (
              <TimeStep barberId={choice.barberService.barberId} barberServiceId={choice.barberService.id} localDate={localDate} onContinue={() => go("review")} onSelect={setSelectedStartsAt} startsAt={selectedStartsAt} testID="owner-continue" />
            ) : null}

            {step === "review" ? (
              <>
                <View className="gap-2 rounded-[20px] bg-neutral-50 p-4" testID="owner-summary">
                  {[
                    [t("common.customer"), customer?.fullName ?? ""],
                    [t("book.summary.barber"), choice?.barber?.name ?? ""],
                    [t("book.summary.service"), choice?.service?.name ?? ""],
                    [t("book.summary.date"), chosen ? formatDateNumeric(chosen.localDate, language) : ""],
                    [t("book.summary.time"), chosen?.localTime ?? ""],
                  ].map(([label, value]) => (
                    <View className="flex-row justify-between gap-3" key={label}>
                      <Text className="text-sm font-sans text-neutral-600">{label}</Text>
                      <Text className="flex-shrink text-right text-sm font-sans-semibold text-ink">{value}</Text>
                    </View>
                  ))}
                </View>
                <Input label={t("book.notes")} multiline onChangeText={setNotes} placeholder={t("examples.notes")} testID="owner-form-notes" value={notes} />
                <Button disabled={!selectedStartsAt || create.isPending} label={t("owner.appointmentForm.create")} onPress={() => create.mutate()} size="lg" testID="owner-form-create" />
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
