import { ChevronRight, MessageCircle, Phone, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { isOpenStatus } from "../../features/appointments/agenda-actions";
import { telUrl, whatsappUrl } from "../../features/clients/format";
import { colors } from "../../lib/design/colors";
import { Button } from "../ui/Button";
import { ContactLink } from "./ContactLink";
import { formatPriceBRL } from "./ServiceCard";
import { StatusBadge } from "./StatusBadge";
import type { AppointmentStatus } from "./StatusBadge";

export type SheetAppointment = {
  barberName?: string;
  customerName: string;
  customerPhone: string | null;
  dateLabel: string;
  id: string;
  notes: string | null;
  priceCents: number;
  serviceName: string;
  status: AppointmentStatus;
  timeLabel: string;
};

export type AppointmentSheetProps = {
  appointment: SheetAppointment | null;
  busy: boolean;
  onCancel: () => void;
  onClose: () => void;
  onMove?: () => void;
  onOpenCustomer: () => void;
  remindUrl?: string | null;
  testPrefix: "barber" | "owner";
};

export function AppointmentSheet({ appointment, busy, onCancel, onClose, onMove, onOpenCustomer, remindUrl, testPrefix }: AppointmentSheetProps) {
  const { t } = useTranslation();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // A second tap is needed to cancel; opening another appointment starts over.
  useEffect(() => setConfirmingCancel(false), [appointment?.id]);

  if (!appointment) return null;
  const id = appointment.id;
  const open = isOpenStatus(appointment.status);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID={`${testPrefix}-sheet-backdrop`}>
        <Pressable className="w-full max-w-[420px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID={`${testPrefix}-sheet`}>
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 gap-1">
              <Text className="text-xl font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{appointment.dateLabel} · {appointment.timeLabel}</Text>
              <StatusBadge status={appointment.status} />
            </View>
            <Pressable accessibilityLabel={t("agendaCard.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID={`${testPrefix}-sheet-close`}>
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-neutral-200 px-4" onPress={onOpenCustomer} testID={`${testPrefix}-appointment-customer-${id}`}>
            <View>
              <Text className="text-xs font-sans text-neutral-500">{t("agendaCard.customer")}</Text>
              <Text className="text-base font-sans-semibold text-ink">{appointment.customerName}</Text>
            </View>
            <ChevronRight color={colors.neutral[500]} size={20} />
          </Pressable>

          <View className="gap-1">
            <Text className="text-base font-sans-medium text-ink">{appointment.serviceName} · {formatPriceBRL(appointment.priceCents)}</Text>
            {appointment.barberName ? <Text className="text-sm font-sans text-neutral-600">{t("agendaCard.barber")}: {appointment.barberName}</Text> : null}
            {appointment.notes ? <Text className="text-sm font-sans text-neutral-600">{t("agendaCard.notes")}: {appointment.notes}</Text> : null}
          </View>

          <View className="flex-row gap-3">
            <ContactLink icon={MessageCircle} testID={`${testPrefix}-appt-whatsapp-${id}`} url={whatsappUrl(appointment.customerPhone)}>{t("barber.clients.whatsapp")}</ContactLink>
            <ContactLink icon={Phone} testID={`${testPrefix}-appt-call-${id}`} url={telUrl(appointment.customerPhone)}>{t("barber.clients.call")}</ContactLink>
          </View>
          {remindUrl ? (
            <View className="flex-row">
              <ContactLink icon={MessageCircle} testID={`${testPrefix}-remind-${id}`} url={remindUrl}>{t("barber.agenda.remind")}</ContactLink>
            </View>
          ) : null}

          {open && onMove ? <Button disabled={busy} label={t("barber.agenda.moveAppointment")} onPress={onMove} testID={`${testPrefix}-move-${id}`} variant="outline" /> : null}
          {open ? (
            <Button
              disabled={busy}
              label={confirmingCancel ? t("barber.agenda.cancelConfirm") : t("barber.agenda.cancelAppointment")}
              onPress={() => (confirmingCancel ? onCancel() : setConfirmingCancel(true))}
              testID={`${testPrefix}-cancel-${id}`}
              variant="danger"
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
