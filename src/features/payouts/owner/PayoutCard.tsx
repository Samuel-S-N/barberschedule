import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { payoutBadge } from "../balance";
import { formatDayMonth } from "../format";
import { scheduleText } from "../schedule";
import type { PayoutOverviewItem } from "../types";

const TONE_CLASS = { danger: "text-danger-500", neutral: "text-neutral-600", success: "text-success-600", warning: "text-warning-600" } as const;

export function PayoutCard({ item, onPay }: { item: PayoutOverviewItem; onPay: () => void }) {
  const { t } = useTranslation();
  const badge = payoutBadge(item.status, item.balanceCents);

  return (
    <Card variant="outlined">
      <View className="gap-2" testID={`payout-card-${item.barberId}`}>
        <View className="flex-row items-center justify-between gap-2">
          <Text accessibilityRole="header" className="flex-1 text-lg font-display-semibold text-ink">{item.barberName}</Text>
          <Text className={`text-sm font-sans-medium ${TONE_CLASS[badge.tone]}`}>{t(`payouts.badge.${badge.key}`)}</Text>
        </View>
        <Text className="text-sm font-sans text-neutral-600">{scheduleText(t, item.config)}</Text>
        <Text className="text-2xl font-display-bold text-ink">
          {item.balanceCents < 0 ? `${t("payouts.balanceOverpaid")} ${formatPriceBRL(-item.balanceCents)}` : formatPriceBRL(item.balanceCents)}
        </Text>
        {item.nextDueDate ? <Text className="text-sm font-sans text-neutral-600">{t("payouts.next", { date: formatDayMonth(item.nextDueDate) })}</Text> : null}
        <Button label={t("payouts.pay")} onPress={onPay} size="sm" testID={`payout-pay-${item.barberId}`} />
      </View>
    </Card>
  );
}
