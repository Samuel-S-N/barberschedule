import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { periodLines } from "../balance";
import { formatDayMonth } from "../format";
import type { PayoutOverviewItem } from "../types";

// The previous/current period lines of a barber's balance. `showTotal` adds the "A receber" line on top.
export function PeriodBreakdown({ item, showTotal, testIdPrefix }: { item: PayoutOverviewItem; showTotal: boolean; testIdPrefix: string }) {
  const { t } = useTranslation();

  return (
    <>
      {periodLines(item, { withTotal: showTotal }).map((row) => {
        const label = row.key === "current" && row.endsOn ? t("payouts.period.currentUntil", { date: formatDayMonth(row.endsOn) }) : t(`payouts.period.${row.key}`);
        const strong = row.key === "total";

        return (
          <View className="flex-row justify-between gap-2" key={row.key}>
            <Text className={`flex-1 text-sm ${strong ? "font-sans-semibold text-ink" : "font-sans text-neutral-600"}`}>{label}</Text>
            <Text className={`text-sm ${strong ? "font-sans-semibold" : "font-sans-medium"} ${row.key === "overpaid" ? "text-warning-500" : "text-ink"}`} testID={`${testIdPrefix}-${row.key}`}>
              {formatPriceBRL(row.cents)}
            </Text>
          </View>
        );
      })}
    </>
  );
}
