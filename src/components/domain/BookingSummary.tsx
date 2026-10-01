import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "./ServiceCard";

export type BookingSummaryProps = {
  barberName: string;
  dateLabel: string;
  durationMinutes: number;
  priceCents: number;
  serviceName: string;
};

export function BookingSummary({ barberName, dateLabel, durationMinutes, priceCents, serviceName }: BookingSummaryProps) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [t("book.summary.barber"), barberName],
    [t("book.summary.service"), serviceName],
    [t("book.summary.duration"), `${durationMinutes} min`],
    [t("book.summary.price"), formatPriceBRL(priceCents)],
    [t("book.summary.date"), dateLabel],
  ];

  return (
    <View className="gap-2 rounded-[20px] bg-neutral-50 p-4" testID="booking-summary">
      {rows.map(([label, value]) => (
        <View className="flex-row justify-between" key={label}>
          <Text className="text-sm font-sans text-neutral-600">{label}</Text>
          <Text className="text-sm font-sans-semibold text-ink">{value}</Text>
        </View>
      ))}
    </View>
  );
}
