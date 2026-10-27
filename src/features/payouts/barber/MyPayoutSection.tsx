import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Card } from "../../../components/ui/Card";
import { useSupabaseSession } from "../../../providers/AppProviders";
import { getMyPayoutSummary } from "../api";
import { formatDayMonth } from "../format";
import { scheduleText } from "../schedule";

export function MyPayoutSection() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const summary = useQuery({ queryFn: () => getMyPayoutSummary(supabase), queryKey: ["my-payout-summary", profile?.userId] });
  const data = summary.data;

  if (!data) return null;

  return (
    <Card variant="outlined">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("payouts.barber.title")}</Text>
        <Text className="text-sm font-sans text-neutral-600">{t("payouts.barber.receivable")}</Text>
        <Text className="text-3xl font-display-bold text-ink" testID="my-payout-balance">
          {data.balanceCents < 0 ? `${t("payouts.balanceOverpaid")} ${formatPriceBRL(-data.balanceCents)}` : formatPriceBRL(data.balanceCents)}
        </Text>
        <Text className="text-xs font-sans text-neutral-600">{t("payouts.barber.since", { date: formatDayMonth(data.trackingStart) })}</Text>
        <Text className="text-sm font-sans text-ink">{scheduleText(t, data.config)}</Text>
        {data.nextDueDate ? <Text className="text-sm font-sans text-ink" testID="my-payout-next">{t("payouts.next", { date: formatDayMonth(data.nextDueDate) })}</Text> : null}
        {data.pastUnmarkedCount > 0 ? <Text className="text-sm font-sans text-warning-600" testID="my-payout-unmarked">{t("payouts.barber.pastUnmarked", { count: data.pastUnmarkedCount })}</Text> : null}
        <Text accessibilityRole="header" className="pt-2 text-base font-display-semibold text-ink">{t("payouts.history")}</Text>
        {data.payouts.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("payouts.historyEmpty")}</Text> : null}
        {data.payouts.map((p) => (
          <Text key={p.id} className="text-sm font-sans text-ink" testID={`my-payout-row-${p.id}`}>{`${formatDayMonth(p.paidOn)} · ${formatPriceBRL(p.amountCents)}${p.note ? ` · ${p.note}` : ""}`}</Text>
        ))}
      </View>
    </Card>
  );
}
