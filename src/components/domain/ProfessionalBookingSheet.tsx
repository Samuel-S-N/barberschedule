import { X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import type { ProfessionalCustomer, ProfessionalCustomerInput } from "../../features/appointments/professional-booking";
import type { MyProfessionalService } from "../../features/professionals/types";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { Button } from "../ui/Button";
import { Input, useFieldChain } from "../ui/Input";
import { PhoneInput } from "../ui/MaskedInputs";
import { phoneDigits } from "../../features/account/phone";
import { formatPriceBRL } from "./ServiceCard";

export type ProfessionalBookingSheetProps = {
  busy?: boolean;
  fitsService: (service: MyProfessionalService) => boolean;
  // A known client (e.g. booking again from the client screen): the form opens filled in and submits their id.
  initialCustomer?: ProfessionalCustomer | null;
  onClose: () => void;
  onSearch: (term: string) => void;
  onSubmit: (input: { professionalServiceId: string; customer: ProfessionalCustomerInput | { id: string } }) => void;
  preferredServiceName?: string | null;
  recent: ProfessionalCustomer[];
  services: MyProfessionalService[];
  slotLabel: string;
  visible: boolean;
};

export function ProfessionalBookingSheet({ busy = false, fitsService, initialCustomer = null, onClose, onSearch, onSubmit, preferredServiceName = null, recent, services, slotLabel, visible }: ProfessionalBookingSheetProps) {
  const colors = useColors();
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
      (preferredServiceName ? services.find((service) => service.serviceName === preferredServiceName && fitsService(service)) : undefined)?.professionalServiceId
      ?? services.find((service) => fitsService(service))?.professionalServiceId
      ?? null,
    [fitsService, preferredServiceName, services],
  );
  const selected = serviceId && services.some((s) => s.professionalServiceId === serviceId && fitsService(s)) ? serviceId : defaultService;

  useEffect(() => {
    if (visible) {
      inFlight.current = false;
      setName(initialCustomer?.fullName ?? "");
      setEmail(initialCustomer?.email ?? "");
      setPhone(phoneDigits(initialCustomer?.phone ?? ""));
      setPickedId(initialCustomer?.id ?? null);
      setServiceId(null);
    }
  }, [visible, slotLabel, initialCustomer?.id]);

  const edit = (setter: (value: string) => void) => (value: string) => {
    setPickedId(null);
    setter(value);
  };

  const pick = (customer: ProfessionalCustomer) => {
    setPickedId(customer.id);
    setName(customer.fullName);
    setEmail(customer.email ?? "");
    setPhone(phoneDigits(customer.phone ?? ""));
  };

  const canConfirm = name.trim() !== "" && selected !== null && !busy;
  const confirm = () => {
    if (!canConfirm || !selected || inFlight.current) return;
    inFlight.current = true;
    onSubmit({ professionalServiceId: selected, customer: pickedId ? { id: pickedId } : { email, name, phone } });
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 items-center justify-center bg-black/40 p-5">
        {/* Tapping the dimmed area outside the window closes it (a sibling layer, so the scrolling form is not wrapped in a Pressable). */}
        <Pressable accessible={false} className="absolute bottom-0 left-0 right-0 top-0" focusable={false} onPress={onClose} testID="professional-book-dismiss" />
        <View className="max-h-full w-full max-w-[420px] rounded-2xl bg-surface" testID="professional-book-sheet">
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled">
            <View className="gap-3 p-5">
              <View className="flex-row items-start justify-between gap-2">
                <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">
                  {t("professional.agenda.bookTitle", { time: slotLabel })}
                </Text>
                <Pressable accessibilityLabel={t("agendaCard.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="professional-book-close">
                  <X color={colors.ink} size={22} />
                </Pressable>
              </View>
              <View className="gap-3">
                <Input
                  {...field(0)}
                  label={t("professional.agenda.bookCustomerName")}
                  onChangeText={(value) => {
                    edit(setName)(value);
                    onSearch(value);
                  }}
                  placeholder={t("examples.fullName")} testID="professional-book-name"
                  value={name}
                />
                {recent.length > 0 ? (
                  <View className="gap-2">
                    <Text className="text-sm font-sans text-neutral-600">{t("professional.agenda.bookRecent")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {recent.map((customer) => (
                        <Pressable
                          accessibilityRole="button"
                          className="rounded-full border border-neutral-300 px-3 py-2"
                          key={customer.id}
                          onPress={() => pick(customer)}
                          testID={`professional-book-recent-${customer.id}`}
                        >
                          <Text className="text-sm font-sans-medium text-ink">{customer.fullName}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <Input {...field(1)} autoCapitalize="none" keyboardType="email-address" label={t("professional.agenda.bookEmail")} onChangeText={edit(setEmail)} placeholder={t("examples.email")} testID="professional-book-email" value={email} />
                <PhoneInput {...field(2)} label={t("professional.agenda.bookPhone")} onChangeValue={edit(setPhone)} testID="professional-book-phone" value={phone} />
                {name.trim() !== "" && email.trim() === "" ? (
                  <Text className="text-sm font-sans text-neutral-600" testID="professional-book-no-email">
                    {t("professional.agenda.bookNoEmailHint")}
                  </Text>
                ) : null}
                <Text className="text-sm font-sans text-neutral-600">{t("professional.agenda.bookService")}</Text>
                {services.map((service) => {
                  const fits = fitsService(service);
                  const isSelected = selected === service.professionalServiceId;

                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ disabled: !fits, selected: isSelected }}
                      className={`rounded-xl border p-3 ${isSelected ? "border-ink bg-neutral-100" : "border-neutral-300"} ${fits ? "" : "opacity-50"}`}
                      disabled={!fits}
                      key={service.professionalServiceId}
                      onPress={() => setServiceId(service.professionalServiceId)}
                      testID={`professional-book-service-${service.professionalServiceId}`}
                    >
                      <Text className="text-base font-sans-medium text-ink">{service.serviceName}</Text>
                      <Text className="text-sm font-sans text-neutral-600">{`${service.durationMinutes} min · ${formatPriceBRL(service.priceCents)}`}</Text>
                      {fits ? null : <Text className="text-xs font-sans text-danger-500">{t("professional.agenda.bookServiceNoFit")}</Text>}
                    </Pressable>
                  );
                })}
                <View className="flex-row gap-2">
                  <Button label={t("professional.agenda.bookCancel")} onPress={onClose} testID="professional-book-cancel" variant="outline" />
                  <Button disabled={!canConfirm} label={t("professional.agenda.bookConfirm")} onPress={confirm} testID="professional-book-confirm" />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
