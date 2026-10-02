import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import type { DaySummary } from "../../features/appointments/day-summary";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { Card } from "../ui/Card";
import { formatPriceBRL } from "./ServiceCard";

export type DaySummaryCardProps = { earnedCents: number | null; summary: DaySummary; testID?: string };

function Cell({ label, sublabel, value }: { label: string; sublabel?: string; value: string }) {
  return (
    <View className="min-w-[120px] flex-1 gap-0.5">
      <Text className="text-xs font-sans-medium text-neutral-600">{label}</Text>
      <Text className="text-xl font-display-bold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{value}</Text>
      {sublabel ? <Text className="text-xs font-sans text-neutral-500">{sublabel}</Text> : null}
    </View>
  );
}

export function DaySummaryCard({ earnedCents, summary, testID }: DaySummaryCardProps) {
  const { t } = useTranslation();
  const nextTime = summary.next ? formatInstantInShopTime(new Date(summary.next.startsAt)).localTime : null;

  return (
    <Card testID={testID}>
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("barber.summary.title")}</Text>
        <View className="flex-row flex-wrap gap-3">
          <Cell label={t("barber.summary.appointments")} sublabel={t("barber.summary.done", { count: summary.completed })} value={String(summary.total)} />
          <Cell label={t("barber.summary.free")} value={String(summary.freeSlots)} />
          <Cell
            label={t("barber.summary.next")}
            sublabel={summary.next ? summary.next.customerName : undefined}
            value={nextTime ?? t("barber.summary.nextNone")}
          />
          {earnedCents !== null ? <Cell label={t("barber.summary.earned")} value={formatPriceBRL(earnedCents)} /> : null}
        </View>
      </View>
    </Card>
  );
}
