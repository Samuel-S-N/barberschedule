import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import type { QuickActions } from "../../features/appointments/agenda-actions";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatusBadge } from "./StatusBadge";
import type { AppointmentStatus } from "./StatusBadge";

export type AgendaCardProps = {
  actions: QuickActions;
  appointmentId: string;
  busy: boolean;
  customerName: string;
  onComplete: () => void;
  onConfirm: () => void;
  onNoShow: () => void;
  onOpen: () => void;
  status: AppointmentStatus;
  subtitle?: string;
  testPrefix: "barber" | "owner";
  timeLabel: string;
};

// Only what the day needs at a glance; tapping the top part opens the details pop-up.
export function AgendaCard({ actions, appointmentId, busy, customerName, onComplete, onConfirm, onNoShow, onOpen, status, subtitle, testPrefix, timeLabel }: AgendaCardProps) {
  const { t } = useTranslation();
  const hasActions = actions.confirm || actions.complete || actions.noShow;

  return (
    <Card testID={`${testPrefix}-appointment-${appointmentId}`}>
      <View className="gap-3">
        <Pressable accessibilityRole="button" className="gap-1" onPress={onOpen} testID={`${testPrefix}-appointment-card-${appointmentId}`}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{timeLabel}</Text>
            <StatusBadge status={status} />
          </View>
          <Text className="text-base font-sans-medium text-ink">{customerName}</Text>
          {subtitle ? <Text className="text-sm font-sans text-neutral-600">{subtitle}</Text> : null}
        </Pressable>
        {hasActions ? (
          <View className="flex-row flex-wrap gap-2">
            {actions.confirm ? <Button disabled={busy} label={t("barber.agenda.confirm")} onPress={onConfirm} size="sm" testID={`${testPrefix}-confirm-${appointmentId}`} /> : null}
            {actions.complete ? <Button disabled={busy} label={t("barber.agenda.complete")} onPress={onComplete} size="sm" testID={`${testPrefix}-complete-${appointmentId}`} /> : null}
            {actions.noShow ? <Button disabled={busy} label={t("barber.agenda.noShow")} onPress={onNoShow} size="sm" testID={`${testPrefix}-noshow-${appointmentId}`} variant="outline" /> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
