import { X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import type { BarberCustomer, BarberCustomerInput } from "../../features/appointments/barber-booking";
import type { MyBarberService } from "../../features/barbers/types";
import { colors } from "../../lib/design/colors";
import { Button } from "../ui/Button";
import { Input, useFieldChain } from "../ui/Input";
import { formatPriceBRL } from "./ServiceCard";

export type BarberBookingSheetProps = {
  busy?: boolean;
  fitsService: (service: MyBarberService) => boolean;
  // A known client (e.g. booking again from the client screen): the form opens filled in and submits their id.
  initialCustomer?: BarberCustomer | null;
  onClose: () => void;
  onSearch: (term: string) => void;
  onSubmit: (input: { barberServiceId: string; customer: BarberCustomerInput | { id: string } }) => void;
  preferredServiceName?: string | null;
  recent: BarberCustomer[];
  services: MyBarberService[];
  slotLabel: string;
  visible: boolean;
};

export function BarberBookingSheet({ busy = false, fitsService, initialCustomer = null, onClose, onSearch, onSubmit, preferredServiceName = null, recent, services, slotLabel, visible }: BarberBookingSheetProps) {
  const { t } = useTranslation();
  const field = useFieldChain(3);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  // A ref, not state: two taps in the same frame both see the stale `busy`, and each would book.
  const inFlight = useRef(false);
  useEffect(() => {
    if (!busy) inFlight.current = false;
  }, [busy]);

  const defaultService = useMemo(
    () =>
      (preferredServiceName ? services.find((service) => service.serviceName === preferredServiceName && fitsService(service)) : undefined)?.barberServiceId
      ?? services.find((service) => fitsService(service))?.barberServiceId
      ?? null,
    [fitsService, preferredServiceName, services],
  );
  const selected = serviceId && services.some((s) => s.barberServiceId === serviceId && fitsService(s)) ? serviceId : defaultService;

  useEffect(() => {
    if (visible) {
      inFlight.current = false;
      setName(initialCustomer?.fullName ?? "");
      setEmail(initialCustomer?.email ?? "");
      setPhone(initialCustomer?.phone ?? "");
      setPickedId(initialCustomer?.id ?? null);
      setServiceId(null);
    }
  }, [visible, slotLabel, initialCustomer?.id]);

  const edit = (setter: (value: string) => void) => (value: string) => {
    setPickedId(null);
    setter(value);
  };

  const pick = (customer: BarberCustomer) => {
    setPickedId(customer.id);
    setName(customer.fullName);
    setEmail(customer.email ?? "");
    setPhone(customer.phone ?? "");
  };

  const canConfirm = name.trim() !== "" && selected !== null && !busy;
  const confirm = () => {
    if (!canConfirm || !selected || inFlight.current) return;
    inFlight.current = true;
    onSubmit({ barberServiceId: selected, customer: pickedId ? { id: pickedId } : { email, name, phone } });
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 items-center justify-center bg-black/40 p-5">
        {/* Tapping the dimmed area outside the window closes it (a sibling layer, so the scrolling form is not wrapped in a Pressable). */}
        <Pressable accessible={false} className="absolute bottom-0 left-0 right-0 top-0" focusable={false} onPress={onClose} testID="barber-book-dismiss" />
        <View className="max-h-full w-full max-w-[420px] rounded-2xl bg-surface" testID="barber-book-sheet">
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled">
            <View className="gap-3 p-5">
              <View className="flex-row items-start justify-between gap-2">
                <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">
                  {t("barber.agenda.bookTitle", { time: slotLabel })}
                </Text>
                <Pressable accessibilityLabel={t("agendaCard.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="barber-book-close">
                  <X color={colors.ink} size={22} />
                </Pressable>
              </View>
              <View className="gap-3">
                <Input
                  {...field(0)}
                  label={t("barber.agenda.bookCustomerName")}
                  onChangeText={(value) => {
                    edit(setName)(value);
                    onSearch(value);
                  }}
                  placeholder={t("examples.fullName")} testID="barber-book-name"
                  value={name}
                />
                {recent.length > 0 ? (
                  <View className="gap-2">
                    <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.bookRecent")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {recent.map((customer) => (
                        <Pressable
                          accessibilityRole="button"
                          className="rounded-full border border-neutral-300 px-3 py-2"
                          key={customer.id}
                          onPress={() => pick(customer)}
                          testID={`barber-book-recent-${customer.id}`}
                        >
                          <Text className="text-sm font-sans-medium text-ink">{customer.fullName}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <Input {...field(1)} autoCapitalize="none" keyboardType="email-address" label={t("barber.agenda.bookEmail")} onChangeText={edit(setEmail)} placeholder={t("examples.email")} testID="barber-book-email" value={email} />
                <Input {...field(2)} keyboardType="phone-pad" label={t("barber.agenda.bookPhone")} onChangeText={edit(setPhone)} placeholder={t("examples.phone")} testID="barber-book-phone" value={phone} />
                {name.trim() !== "" && email.trim() === "" ? (
                  <Text className="text-sm font-sans text-neutral-600" testID="barber-book-no-email">
                    {t("barber.agenda.bookNoEmailHint")}
                  </Text>
                ) : null}
                <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.bookService")}</Text>
                {services.map((service) => {
                  const fits = fitsService(service);
                  const isSelected = selected === service.barberServiceId;

                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ disabled: !fits, selected: isSelected }}
                      className={`rounded-xl border p-3 ${isSelected ? "border-ink bg-neutral-100" : "border-neutral-300"} ${fits ? "" : "opacity-50"}`}
                      disabled={!fits}
                      key={service.barberServiceId}
                      onPress={() => setServiceId(service.barberServiceId)}
                      testID={`barber-book-service-${service.barberServiceId}`}
                    >
                      <Text className="text-base font-sans-medium text-ink">{service.serviceName}</Text>
                      <Text className="text-sm font-sans text-neutral-600">{`${service.durationMinutes} min · ${formatPriceBRL(service.priceCents)}`}</Text>
                      {fits ? null : <Text className="text-xs font-sans text-danger-500">{t("barber.agenda.bookServiceNoFit")}</Text>}
                    </Pressable>
                  );
                })}
                <View className="flex-row gap-2">
                  <Button label={t("barber.agenda.bookCancel")} onPress={onClose} testID="barber-book-cancel" variant="outline" />
                  <Button disabled={!canConfirm} label={t("barber.agenda.bookConfirm")} onPress={confirm} testID="barber-book-confirm" />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
