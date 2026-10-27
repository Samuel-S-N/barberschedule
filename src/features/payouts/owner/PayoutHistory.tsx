import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Button } from "../../../components/ui/Button";
import { formatDayMonth } from "../format";
import type { PayoutListItem } from "../types";

// Removing needs a second tap on the same row, like the rent payments list.
export function PayoutHistory({ items, onDelete }: { items: PayoutListItem[]; onDelete: (id: string) => void }) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState<string | null>(null);

  if (items.length === 0) return <Text className="text-sm font-sans text-neutral-600">{t("payouts.historyEmpty")}</Text>;

  return (
    <View className="gap-2">
      {items.map((item) => (
        <View key={item.id} className="flex-row items-center justify-between gap-2" testID={`payout-row-${item.id}`}>
          <Text className="flex-1 text-sm font-sans text-ink">{`${formatDayMonth(item.paidOn)} · ${item.barberName} · ${formatPriceBRL(item.amountCents)}${item.note ? ` · ${item.note}` : ""}`}</Text>
          <Button
            label={armed === item.id ? t("payouts.confirmDelete") : t("payouts.delete")}
            onPress={() => (armed === item.id ? (setArmed(null), onDelete(item.id)) : setArmed(item.id))}
            size="sm"
            testID={`payout-delete-${item.id}`}
            variant={armed === item.id ? "danger" : "outline"}
          />
        </View>
      ))}
    </View>
  );
}
