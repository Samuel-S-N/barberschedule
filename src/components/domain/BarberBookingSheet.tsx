import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import type { BarberCustomer, BarberCustomerInput } from "../../features/appointments/barber-booking";
import type { MyBarberService } from "../../features/barbers/types";
import { Button } from "../ui/Button";
import { Input, useFieldChain } from "../ui/Input";
import { formatPriceBRL } from "./ServiceCard";

export type BarberBookingSheetProps = {
  busy?: boolean;
  fitsService: (service: MyBarberService) => boolean;
  onClose: () => void;
  onSearch: (term: string) => void;
  onSubmit: (input: { barberServiceId: string; customer: BarberCustomerInput | { id: string } }) => void;
  recent: BarberCustomer[];
  services: MyBarberService[];
  slotLabel: string;
  visible: boolean;
};

export function BarberBookingSheet({ busy = false, fitsService, onClose, onSearch, onSubmit, recent, services, slotLabel, visible }: BarberBookingSheetProps) {
  const { t } = useTranslation();
  const field = useFieldChain(3);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);

  const firstFit = useMemo(() => services.find((service) => fitsService(service))?.barberServiceId ?? null, [fitsService, services]);
  const selected = serviceId && services.some((s) => s.barberServiceId === serviceId && fitsService(s)) ? serviceId : firstFit;

  useEffect(() => {
    if (visible) {
      setName("");
      setEmail("");
      setPhone("");
      setPickedId(null);
      setServiceId(null);
    }
  }, [visible, slotLabel]);

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
    if (!canConfirm || !selected) return;
    onSubmit({ barberServiceId: selected, customer: pickedId ? { id: pickedId } : { email, name, phone } });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[90%] w-full rounded-t-2xl bg-surface">
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled">
            <View className="items-center gap-3 p-5">
              <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
                {t("barber.agenda.bookTitle", { time: slotLabel })}
              </Text>
              <View className="w-full max-w-[420px] gap-3">
                <Input
                  {...field(0)}
                  label={t("barber.agenda.bookCustomerName")}
                  onChangeText={(value) => {
                    edit(setName)(value);
                    onSearch(value);
                  }}
                  testID="barber-book-name"
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
                <Input {...field(1)} autoCapitalize="none" keyboardType="email-address" label={t("barber.agenda.bookEmail")} onChangeText={edit(setEmail)} testID="barber-book-email" value={email} />
                <Input {...field(2)} keyboardType="phone-pad" label={t("barber.agenda.bookPhone")} onChangeText={edit(setPhone)} testID="barber-book-phone" value={phone} />
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
