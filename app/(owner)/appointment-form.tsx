import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { RadioBlock } from "../../src/components/domain/RadioBlock";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { bookOwnerAppointment } from "../../src/features/appointments/owner-api";
import { getAvailableSlots } from "../../src/features/availability/api";
import type { AvailableSlot } from "../../src/features/availability/types";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import { listOwnerBarberServices, listOwnerServices } from "../../src/features/services/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerAppointmentFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localDate, setLocalDate] = useState(formatInstantInShopTime(new Date()).localDate);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBarberServiceId, setSelectedBarberServiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);

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
  const selectedBarberService = choices.find((choice) => choice.barberService.id === selectedBarberServiceId)?.barberService ?? null;
  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });

  const loadSlots = async () => {
    if (!selectedBarberService) return;
    setFeedback(null);
    setIsSaving(true);
    try {
      setSlots(await getAvailableSlots(supabase, { barberId: selectedBarberService.barberId, barberServiceId: selectedBarberService.id, localDate }));
      setSelectedStartsAt(null);
    } catch (error) {
      fail(error, t("owner.appointmentForm.timesError"));
    } finally {
      setIsSaving(false);
    }
  };

  const createAppointment = async () => {
    if (!selectedBarberServiceId || !selectedCustomerId || !selectedStartsAt) return;
    setFeedback(null);
    setIsSaving(true);
    try {
      await bookOwnerAppointment(supabase, { barberServiceId: selectedBarberServiceId, customerId: selectedCustomerId, notes: notes.trim() || null, startsAt: selectedStartsAt });
      setFeedback({ message: t("owner.appointmentForm.created"), variant: "success" });
      setSlots([]);
      setSelectedStartsAt(null);
    } catch (error) {
      // The slot may have been taken: refresh the times so the next pick is valid, then show why it failed.
      await loadSlots();
      fail(error, t("owner.appointmentForm.createError"));
    } finally {
      setIsSaving(false);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/agenda"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("owner.appointmentForm.backToAgenda")} onBack={back} title={t("owner.appointmentForm.title")} />
            {shop.isLoading || catalog.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {shop.error || catalog.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(shop.error ?? catalog.error, t, t("owner.appointmentForm.loadError"))}</Text> : null}
            {shop.data === null ? <Text className="text-sm font-sans text-neutral-600">{t("common.noShop")}</Text> : null}

            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("common.customer")}</Text>
            <Input label={t("owner.appointmentForm.searchCustomer")} onChangeText={setSearch} testID="owner-customer-search" value={search} />
            <ScrollView className="max-h-[280px]" nestedScrollEnabled>
              <RadioBlock
                items={customers.map((customer) => ({ key: customer.id, label: customer.fullName, onPress: () => setSelectedCustomerId(customer.id), selected: customer.id === selectedCustomerId }))}
                testID="owner-customer-list"
              />
            </ScrollView>

            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("common.service")}</Text>
            <RadioBlock
              items={choices.map(({ barber, barberService, service }) => ({
                key: barberService.id,
                label: `${barber?.name} · ${service?.name}`,
                onPress: () => {
                  setSelectedBarberServiceId(barberService.id);
                  setSlots([]);
                  setSelectedStartsAt(null);
                },
                selected: barberService.id === selectedBarberServiceId,
              }))}
              testID="owner-service-list"
            />

            <Input label={t("common.localDate")} onChangeText={setLocalDate} testID="owner-appointment-date" value={localDate} />
            <Button disabled={!selectedBarberService || isSaving} label={t("owner.appointmentForm.loadTimes")} onPress={() => void loadSlots()} testID="owner-form-load-times" variant="outline" />
            {slots.length > 0 ? (
              <View className="flex-row flex-wrap gap-2" testID="owner-form-slots">
                {slots.map((slot) => (
                  <Button key={slot.startsAt} label={slot.localTime.slice(0, 5)} onPress={() => setSelectedStartsAt(slot.startsAt)} size="sm" variant={slot.startsAt === selectedStartsAt ? "dark" : "outline"} />
                ))}
              </View>
            ) : null}

            <Input label={t("book.notes")} onChangeText={setNotes} testID="owner-form-notes" value={notes} />
            <Button
              disabled={!selectedBarberServiceId || !selectedCustomerId || !selectedStartsAt || isSaving}
              label={t("owner.appointmentForm.create")}
              onPress={() => void createAppointment()}
              testID="owner-form-create"
            />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
